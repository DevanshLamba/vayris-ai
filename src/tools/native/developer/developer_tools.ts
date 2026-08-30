import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import { FileSystemSecurity } from '../filesystem/utils';

const execFileAsync = util.promisify(execFile);

// Helper to enforce workspace limits on commands
async function safeExec(command: string, args: string[], cwd: string): Promise<any> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { 
      cwd, 
      timeout: 30000, // 30 seconds max
      maxBuffer: 1024 * 50 // 50KB output cap
    });
    return { success: true, data: { stdout: stdout.trim(), stderr: stderr.trim() } };
  } catch (error: any) {
    return { 
      success: false, 
      error: `Command failed: ${error.message}`, 
      data: { stdout: error.stdout?.trim(), stderr: error.stderr?.trim(), code: error.code } 
    };
  }
}

export class GitStatusTool extends BaseTool {
  name = 'git_status';
  description = 'Show the git status of the current workspace.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private security: FileSystemSecurity) { super(); }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const root = this.security.validatePath(process.cwd()); // Use allowed root
    return await safeExec('git', ['status', '-s'], root);
  }
}

export class GitDiffTool extends BaseTool {
  name = 'git_diff';
  description = 'Return the current git diff of the workspace.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private security: FileSystemSecurity) { super(); }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const root = this.security.validatePath(process.cwd());
    return await safeExec('git', ['diff'], root);
  }
}

export class ProjectInfoTool extends BaseTool {
  name = 'project_info';
  description = 'Return metadata about the current project (e.g. package.json).';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private security: FileSystemSecurity) { super(); }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const root = this.security.validatePath(process.cwd());
      const packagePath = path.join(root, 'package.json');
      const content = await fs.readFile(packagePath, 'utf8');
      const pkg = JSON.parse(content);
      
      return { 
        success: true, 
        data: { 
          name: pkg.name, 
          version: pkg.version, 
          scripts: pkg.scripts,
          dependencies: Object.keys(pkg.dependencies || {}).length,
          devDependencies: Object.keys(pkg.devDependencies || {}).length
        } 
      };
    } catch (e: any) {
      return { success: false, error: 'Could not read project info: ' + e.message };
    }
  }
}

export class RunTestsTool extends BaseTool {
  name = 'run_tests';
  description = 'Run the configured test command for the project.';
  permissionLevel = PermissionLevel.CONFIRM;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private security: FileSystemSecurity) { super(); }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const root = this.security.validatePath(process.cwd());
    // Use npm directly, safely.
    return await safeExec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test'], root);
  }
}

export class RunBuildTool extends BaseTool {
  name = 'run_build';
  description = 'Run the configured build command for the project.';
  permissionLevel = PermissionLevel.CONFIRM;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private security: FileSystemSecurity) { super(); }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const root = this.security.validatePath(process.cwd());
    return await safeExec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], root);
  }
}
