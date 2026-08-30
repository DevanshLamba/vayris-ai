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

export class WriteFileTool extends BaseTool {
  name = 'write_file';
  description = 'Write text content to a file inside an allowed workspace. Overwrites if exists.';
  permissionLevel = PermissionLevel.CONFIRM; // Modifying files requires confirmation
  parameters = {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'The path to the file to write.' },
      content: { type: 'string', description: 'The text content to write.' }
    },
    required: ['filePath', 'content']
  };

  private security: FileSystemSecurity;

  constructor(security: FileSystemSecurity) {
    super();
    this.security = security;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const safePath = this.security.validatePath(args.filePath);
      
      await fs.writeFile(safePath, args.content, 'utf-8');
      
      return { success: true, data: { file: safePath, status: 'written' } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
