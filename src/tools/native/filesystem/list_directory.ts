import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import fs from 'fs/promises';
import { FileSystemSecurity } from './utils';

export class ListDirectoryTool extends BaseTool {
  name = 'list_directory';
  description = 'List files and directories inside an allowed workspace path.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      dirPath: { type: 'string', description: 'The directory path to list.' }
    },
    required: ['dirPath']
  };

  private security: FileSystemSecurity;

  constructor(security: FileSystemSecurity) {
    super();
    this.security = security;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const safePath = this.security.validatePath(args.dirPath);
      const entries = await fs.readdir(safePath, { withFileTypes: true });
      
      const results = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : (entry.isFile() ? 'file' : 'other')
      }));

      return { success: true, data: { directory: safePath, entries: results } };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'Directory not found.' };
      }
      return { success: false, error: error.message };
    }
  }
}
