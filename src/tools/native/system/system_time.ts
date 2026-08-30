import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';

export class SystemTimeTool extends BaseTool {
  name = 'system_time';
  description = 'Returns the current local time of the system.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const currentTime = new Date().toISOString();
      return { success: true, data: { currentTime } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
