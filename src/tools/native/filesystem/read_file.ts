import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import fs from 'fs/promises';
import { FileSystemSecurity } from './utils';

export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a text file inside an allowed workspace.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'The absolute or relative path to the file.' }
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
      if (!stats.isFile()) {
        return { success: false, error: 'Path exists but is not a file.' };
      }
      
      // Basic check to prevent reading massive files into memory blindly
      if (stats.size > 5 * 1024 * 1024) { // 5MB limit
        return { success: false, error: 'File is too large to read (exceeds 5MB limit).' };
      }

      const content = await fs.readFile(safePath, 'utf-8');
      return { success: true, data: { file: safePath, content } };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'File not found.' };
      }
      return { success: false, error: error.message };
    }
  }
}
