/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface MCPClientConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPClient {
  private client: Client;
  private transport?: StdioClientTransport;
  private isConnected = false;
  
  public readonly name: string;
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.name = config.name;
    this.config = config;
    this.client = new Client(
      {
        name: 'vayris-agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    // Filter out undefined values from process.env
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    
    // Merge with custom config env
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        env[key] = value;
      }
    }

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args || [],
      env,
    });

    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
    } catch (error: any) {
      throw new Error(`Failed to connect to MCP server '${this.name}': ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.transport) return;
    try {
      await this.transport.close();
      this.isConnected = false;
    } catch (error: any) {
      console.error(`Error disconnecting from MCP server '${this.name}': ${error.message}`);
    }
  }

  async getTools(): Promise<Tool[]> {
    if (!this.isConnected) {
      throw new Error(`Cannot list tools: MCP server '${this.name}' is not connected.`);
    }

    try {
      const response = await this.client.listTools();
      return response.tools || [];
    } catch (error: any) {
      throw new Error(`Failed to list tools from MCP server '${this.name}': ${error.message}`);
    }
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.isConnected) {
      throw new Error(`Cannot call tool '${name}': MCP server '${this.name}' is not connected.`);
    }

    try {
      return await this.client.callTool({
        name,
        arguments: args,
      });
    } catch (error: any) {
      throw new Error(`Error executing MCP tool '${name}': ${error.message}`);
    }
  }
}
