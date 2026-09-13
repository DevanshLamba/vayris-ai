import { AgentOrchestrator } from '../src/core/orchestrator';
import { ModelProvider } from '../src/providers/types';
import { ToolRegistry } from '../src/tools/registry';
import { ToolContext, PermissionLevel } from '../src/tools/types';
import { TaskStatus } from '../src/core/task/types';

describe('AgentOrchestrator', () => {
  let mockProvider: jest.Mocked<ModelProvider>;
  let toolRegistry: ToolRegistry;
  let orchestrator: AgentOrchestrator;
  let mockContext: ToolContext;

  beforeEach(() => {
    mockProvider = {
      name: 'mock',
      initialize: jest.fn(),
      generateResponse: jest.fn()
    } as unknown as jest.Mocked<ModelProvider>;

    toolRegistry = new ToolRegistry();
    orchestrator = new AgentOrchestrator({
      provider: mockProvider,
      toolRegistry,
      maxIterations: 3
    });

    mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };

    toolRegistry.register({
      name: 'test_tool',
      description: 'Test tool',
      permissionLevel: PermissionLevel.SAFE,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ success: true, data: { status: 'ok' } })
    });
  });

  it('should run a task successfully', async () => {
    mockProvider.generateResponse.mockResolvedValueOnce({
      role: 'assistant',
      content: 'Final response.'
    });

    const result = await orchestrator.runTask('Do something', mockContext);
    
    expect(result.status).toBe(TaskStatus.COMPLETED);
    expect(result.metadata.finalResponse).toBe('Final response.');
  });
});
