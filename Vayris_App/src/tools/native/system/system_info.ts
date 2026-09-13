/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import os from 'os';

export class SystemInfoTool extends BaseTool {
  name = 'system_info';
  description = 'Returns basic, non-sensitive information about the host operating system.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const info = {
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        cpus: os.cpus().length
      };
      
      return { success: true, data: info };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
