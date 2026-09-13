/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../tools/types';
import { MCPClient } from './client';
import { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';

export class MCPToolAdapter extends BaseTool {
  public name: string;
  public description: string;
  public parameters: any;
  public permissionLevel: PermissionLevel;
  public originalName: string;

  private mcpClient: MCPClient;

  constructor(mcpTool: MCPTool, mcpClient: MCPClient) {
    super();
    // Vayris requires distinct tool names. Namespacing MCP tools.
    this.name = `mcp.${mcpClient.name}.${mcpTool.name}`;
    this.description = mcpTool.description || `Tool ${mcpTool.name} from MCP server ${mcpClient.name}`;
    this.parameters = mcpTool.inputSchema;
    
    // Critical Requirement: Conservative default permission policy for MCP tools.
    // They are external and potentially powerful, so we enforce CONFIRM by default.
    this.permissionLevel = PermissionLevel.CONFIRM;
    
    this.mcpClient = mcpClient;
    this.originalName = mcpTool.name;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const response = await this.mcpClient.callTool(this.originalName, args);
      
      // The MCP SDK usually returns an object with a content array (e.g. [{ type: 'text', text: '...' }])
      // We'll normalize this for the Vayris orchestrator.
      if (response.isError) {
        return {
          success: false,
          error: response.content?.[0]?.text || 'Unknown MCP tool error',
        };
      }

      return {
        success: true,
        data: response.content, // Pass the rich content back
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
