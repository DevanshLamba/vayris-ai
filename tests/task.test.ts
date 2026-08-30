import { TaskEngine } from '../src/core/task/engine';
import { TaskStatus, TaskEventType } from '../src/core/task/types';
import { ModelProvider } from '../src/providers/types';
import { ToolRegistry } from '../src/tools/registry';
import { DefaultPermissionManager } from '../src/core/permissions';
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../src/tools/types';

describe('TaskEngine', () => {
  let mockProvider: jest.Mocked<ModelProvider>;
  let toolRegistry: ToolRegistry;
  let permissionManager: DefaultPermissionManager;
  let engine: TaskEngine;
  let mockContext: ToolContext;

  beforeEach(() => {
    mockProvider = {
      name: 'mock',
      initialize: jest.fn(),
      generateResponse: jest.fn()
    } as unknown as jest.Mocked<ModelProvider>;

    toolRegistry = new ToolRegistry();
    permissionManager = new DefaultPermissionManager();
    engine = new TaskEngine({
      provider: mockProvider,
      toolRegistry,
      permissionManager,
      maxIterations: 5
    });

    mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };

    // Register a safe dummy tool
    toolRegistry.register({
      name: 'dummy_tool',
      description: 'A dummy tool',
      permissionLevel: PermissionLevel.SAFE,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ success: true, data: { result: 'dummy_success' } })
    });
  });

  it('should handle simple direct execution without plan', async () => {
    mockProvider.generateResponse.mockResolvedValueOnce({
      role: 'assistant',
      content: 'The time is 12:00 PM.'
    });

    const task = engine.createTask('What time is it?');
    const result = await engine.runTask(task, mockContext);

    expect(result.status).toBe(TaskStatus.COMPLETED);
    expect(result.metadata.finalResponse).toBe('The time is 12:00 PM.');
    expect(mockProvider.generateResponse).toHaveBeenCalledTimes(1);
  });

  it('should handle multi-step plan proposal and completion', async () => {
    // Step 1: Model proposes a plan
    mockProvider.generateResponse.mockResolvedValueOnce({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_1',
        name: 'propose_plan',
        arguments: { steps: ['Step 1'], criteria: ['Done'] }
      }]
    });

    // Step 2: Model completes task
    mockProvider.generateResponse.mockResolvedValueOnce({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_2',
        name: 'complete_task',
        arguments: { evidence: 'I finished' }
      }]
    });

    const task = engine.createTask('Complex task');
    const events: any[] = [];
    engine.onEvent(e => events.push(e));

    const result = await engine.runTask(task, mockContext);

    expect(result.status).toBe(TaskStatus.COMPLETED);
    expect(result.steps.length).toBe(1);
    expect(events.map(e => e.type)).toContain(TaskEventType.PLAN_CREATED);
    expect(events.map(e => e.type)).toContain(TaskEventType.VERIFICATION_STARTED);
    expect(events.map(e => e.type)).toContain(TaskEventType.TASK_COMPLETED);
  });

  it('should prevent infinite loops by max iterations', async () => {
    // Model keeps returning same tool call forever
    mockProvider.generateResponse.mockResolvedValue({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_1',
        name: 'dummy_tool',
        arguments: {}
      }]
    });

    const task = engine.createTask('Do something');
    const result = await engine.runTask(task, mockContext);

    // Should fail when max iterations is reached
    expect(result.status).toBe(TaskStatus.FAILED);
  });

  it('should prevent infinite loops by detecting identical failing actions', async () => {
    // Register a failing tool
    toolRegistry.register({
      name: 'fail_tool',
      description: 'A failing tool',
      permissionLevel: PermissionLevel.SAFE,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ success: false, error: 'Always fails' })
    });

    // Model repeats the same failing tool
    mockProvider.generateResponse.mockResolvedValue({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_f',
        name: 'fail_tool',
        arguments: {}
      }]
    });

    const task = engine.createTask('Fail loop');
    const result = await engine.runTask(task, mockContext);

    expect(result.status).toBe(TaskStatus.FAILED);
    expect(mockProvider.generateResponse).toHaveBeenCalledTimes(4); // Stops early due to repetitive fails
  });
});
