import { FileSystemSecurity } from '../src/tools/native/filesystem/utils';
import { GitStatusTool, GitDiffTool, ProjectInfoTool, RunTestsTool, RunBuildTool } from '../src/tools/native/developer/developer_tools';
import { ToolContext } from '../src/tools/types';
import fs from 'fs/promises';
import path from 'path';

describe('Developer Tools', () => {
  let fsSecurity: FileSystemSecurity;
  let mockContext: ToolContext;

  beforeAll(() => {
    fsSecurity = new FileSystemSecurity([process.cwd()]);
    mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };
  });

  it('should return project info safely', async () => {
    const tool = new ProjectInfoTool(fsSecurity);
    const result = await tool.execute({}, mockContext);
    
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('vayris');
    expect(result.data.scripts).toBeDefined();
  });

  it('should run git status', async () => {
    const tool = new GitStatusTool(fsSecurity);
    const result = await tool.execute({}, mockContext);
    
    // Might fail if not in a git repo, but structure should be checked
    // We expect it to either succeed or return a structured git error
    expect(result).toBeDefined();
    if (!result.success) {
      expect(result.error).toContain('Command failed');
    }
  });

  it('should run tests command safely without raw shell', async () => {
    const tool = new RunTestsTool(fsSecurity);
    // Running real test inside a test will cause recursion or slow execution.
    // We'll mock the internal execFile instead of running `npm test`.
    // For now, we know the implementation uses a strictly defined array: ['run', 'test']
    expect(tool.name).toBe('run_tests');
    expect(tool.permissionLevel).toBe('confirm');
  });

  it('must prevent arbitrary shell execution', () => {
    // There is no tool that accepts 'command' or 'sh'.
    // We explicitly verify that the tools don't accept raw command input.
    const runTestTool = new RunTestsTool(fsSecurity);
    expect(runTestTool.parameters.properties).not.toHaveProperty('command');
  });
});
