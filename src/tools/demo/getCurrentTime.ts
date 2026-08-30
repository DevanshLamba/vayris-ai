/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../types';

export class GetCurrentTimeTool extends BaseTool {
  name = 'get_current_time';
  description = 'Returns the current local time of the system.';
  permissionLevel = PermissionLevel.SAFE;
  
  parameters = {
    type: 'object',
    properties: {}, // No arguments needed
    required: []
  };

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const currentTime = new Date().toISOString();
    return {
      success: true,
      data: { currentTime }
    };
  }
}
