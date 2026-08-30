import { ToolRegistry } from '../src/tools/registry';
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../src/tools/types';

class MockTool extends BaseTool {
  name = 'mock_tool';
  description = 'A mock tool';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    return { success: true, data: { result: 'mock_success' } };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockContext: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };
  });

  it('should register and retrieve a tool', () => {
    const tool = new MockTool();
    registry.register(tool);
    expect(registry.getTool('mock_tool')).toBeDefined();
    expect(registry.getToolDefinitions().length).toBe(1);
  });

  it('should execute a tool successfully', async () => {
    registry.register(new MockTool());
    const result = await registry.executeTool('mock_tool', {}, mockContext);
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe('mock_success');
  });

  it('should return error for unknown tool', async () => {
    const result = await registry.executeTool('unknown_tool', {}, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
