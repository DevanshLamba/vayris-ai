import { BaseTool, ToolResult, ToolContext } from './types';
import { ToolDefinition } from '../providers/types';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getToolDefinitions(): (ToolDefinition & { permissionLevel?: string })[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      permissionLevel: tool.permissionLevel
    }));
  }

  async executeTool(name: string, args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return { success: false, error: `Tool ${name} not found.` };
    }

    // Permission checks would happen here or in the orchestrator
    // We delegate that to the orchestrator to interact with the user if needed,
    // but the registry enforces the interface.

    try {
      return await tool.execute(args, context);
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error occurred during tool execution.' };
    }
  }
}

export const toolRegistry = new ToolRegistry();
