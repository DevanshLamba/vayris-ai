/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import fs from 'fs/promises';
import { FileSystemSecurity } from './utils';

export class DeleteFileTool extends BaseTool {
  name = 'delete_file';
  description = 'Delete a file inside an allowed workspace.';
  permissionLevel = PermissionLevel.RESTRICTED; // Highly dangerous
  parameters = {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'The path to the file to delete.' }
    },
    required: ['filePath']
  };

  private security: FileSystemSecurity;

  constructor(security: FileSystemSecurity) {
    super();
    this.security = security;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const safePath = this.security.validatePath(args.filePath);
      
      const stats = await fs.stat(safePath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Target is a directory, not a file. Use a different tool to delete directories.' };
      }

      await fs.unlink(safePath);
      
      return { success: true, data: { file: safePath, status: 'deleted' } };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'File not found.' };
      }
      return { success: false, error: error.message };
    }
  }
}
