/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { MCPClient, MCPClientConfig } from './client';
import { MCPToolAdapter } from './adapter';
import { ToolRegistry } from '../tools/registry';

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async registerServer(config: MCPClientConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP server with name '${config.name}' is already registered.`);
    }

    const client = new MCPClient(config);
    this.clients.set(config.name, client);

    try {
      await client.connect();
      const tools = await client.getTools();
      
      for (const mcpTool of tools) {
        const adapter = new MCPToolAdapter(mcpTool, client);
        this.toolRegistry.register(adapter);
      }
      
      console.log(`Successfully registered MCP server '${config.name}' with ${tools.length} tools.`);
    } catch (error: any) {
      console.error(`Failed to register MCP server '${config.name}': ${error.message}`);
      // Clean up failed client
      await client.disconnect().catch(() => {});
      this.clients.delete(config.name);
      throw error;
    }
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }
}
