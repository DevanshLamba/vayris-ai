import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import fs from 'fs/promises';
import path from 'path';
import { FileSystemSecurity } from './utils';

export class SearchFilesTool extends BaseTool {
  name = 'search_files';
  description = 'Search for files by name/pattern within an allowed directory.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      dirPath: { type: 'string', description: 'The directory to search in.' },
      pattern: { type: 'string', description: 'Substring to search for in filenames.' }
    },
    required: ['dirPath', 'pattern']
  };

  private security: FileSystemSecurity;

  constructor(security: FileSystemSecurity) {
    super();
    this.security = security;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const safeDir = this.security.validatePath(args.dirPath);
      const pattern = args.pattern.toLowerCase();
      
      const results: string[] = [];
      await this.searchRecursive(safeDir, pattern, results, 0);

      return { success: true, data: { matches: results } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async searchRecursive(currentPath: string, pattern: string, results: string[], depth: number) {
    if (depth > 5) return; // Prevent excessive recursion

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.name.toLowerCase().includes(pattern)) {
          results.push(fullPath);
          if (results.length >= 50) return; // Cap results
        }

        if (entry.isDirectory()) {
          await this.searchRecursive(fullPath, pattern, results, depth + 1);
          if (results.length >= 50) return;
        }
      }
    } catch (err) {
      // Ignore access errors on specific subdirectories
    }
  }
}
