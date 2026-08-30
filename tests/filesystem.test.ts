import { FileSystemSecurity } from '../src/tools/native/filesystem/utils';
import { ListDirectoryTool } from '../src/tools/native/filesystem/list_directory';
import { ReadFileTool } from '../src/tools/native/filesystem/read_file';
import { WriteFileTool } from '../src/tools/native/filesystem/write_file';
import { DeleteFileTool } from '../src/tools/native/filesystem/delete_file';
import { SearchFilesTool } from '../src/tools/native/filesystem/search_files';
import { ToolContext } from '../src/tools/types';
import fs from 'fs/promises';
import path from 'path';

describe('FileSystem Tools', () => {
  let fsSecurity: FileSystemSecurity;
  let testRoot: string;
  let mockContext: ToolContext;

  beforeAll(async () => {
    testRoot = path.join(process.cwd(), 'temp_test_workspace');
    await fs.mkdir(testRoot, { recursive: true });
    
    // Create some dummy files
    await fs.writeFile(path.join(testRoot, 'test.txt'), 'Hello world');
    await fs.mkdir(path.join(testRoot, 'subdir'));
    await fs.writeFile(path.join(testRoot, 'subdir', 'sub.txt'), 'Subdir content');

    fsSecurity = new FileSystemSecurity([testRoot]);
    mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };
  });

  afterAll(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  describe('FileSystemSecurity', () => {
    it('should allow paths inside workspace', () => {
      const p = path.join(testRoot, 'test.txt');
      expect(fsSecurity.validatePath(p)).toBe(p);
    });

    it('should reject paths outside workspace', () => {
      const p = path.join(process.cwd(), 'package.json');
      expect(() => fsSecurity.validatePath(p)).toThrow(/outside the allowed workspaces/);
    });

    it('should reject path traversal attacks', () => {
      const p = path.join(testRoot, '..', 'package.json');
      expect(() => fsSecurity.validatePath(p)).toThrow();
    });
  });

  describe('ListDirectoryTool', () => {
    it('should list directory contents', async () => {
      const tool = new ListDirectoryTool(fsSecurity);
      const result = await tool.execute({ dirPath: testRoot }, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data.entries.length).toBeGreaterThan(0);
      expect(result.data.entries.find((e: any) => e.name === 'test.txt')).toBeDefined();
    });
  });

  describe('ReadFileTool', () => {
    it('should read file content', async () => {
      const tool = new ReadFileTool(fsSecurity);
      const result = await tool.execute({ filePath: path.join(testRoot, 'test.txt') }, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data.content).toBe('Hello world');
    });

    it('should return structured error for missing file', async () => {
      const tool = new ReadFileTool(fsSecurity);
      const result = await tool.execute({ filePath: path.join(testRoot, 'missing.txt') }, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('SearchFilesTool', () => {
    it('should search and find files', async () => {
      const tool = new SearchFilesTool(fsSecurity);
      const result = await tool.execute({ dirPath: testRoot, pattern: 'sub.txt' }, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);
      expect(result.data.matches[0]).toContain('sub.txt');
    });
  });

  describe('WriteFileTool', () => {
    it('should write a new file', async () => {
      const tool = new WriteFileTool(fsSecurity);
      const filePath = path.join(testRoot, 'new.txt');
      const result = await tool.execute({ filePath, content: 'new content' }, mockContext);
      
      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('new content');
    });
  });

  describe('DeleteFileTool', () => {
    it('should delete a file', async () => {
      const tool = new DeleteFileTool(fsSecurity);
      const filePath = path.join(testRoot, 'new.txt'); // Created in previous test
      const result = await tool.execute({ filePath }, mockContext);
      
      expect(result.success).toBe(true);
      await expect(fs.stat(filePath)).rejects.toThrow();
    });

    it('should fail to delete a directory', async () => {
      const tool = new DeleteFileTool(fsSecurity);
      const result = await tool.execute({ filePath: path.join(testRoot, 'subdir') }, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('directory');
    });
  });
});
