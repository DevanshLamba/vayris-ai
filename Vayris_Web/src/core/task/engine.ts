/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { randomUUID } from 'crypto';
import { TaskState, TaskStatus, TaskStep, TaskEvent, TaskEventType } from './types';
import { ModelProvider, Message } from '../../providers/types';
import { ToolRegistry } from '../../tools/registry';
import { ToolContext } from '../../tools/types';
import { PermissionManager } from '../permissions';
import { getCoreIdentityPrompt } from '../identity';
import { extractToolCallFromText } from '../utils/toolCallText';

export interface TaskEngineConfig {
  provider: ModelProvider;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
  maxIterations?: number;
  maxRetriesPerStep?: number;
  fastModel?: string;
  deepModel?: string;
}

export class TaskEngine {
  private provider: ModelProvider;
  private toolRegistry: ToolRegistry;
  private permissionManager: PermissionManager;
  private maxIterations: number;
  private maxRetriesPerStep: number;
  public fastModel: string;
  public deepModel: string;
  private eventListeners: ((event: TaskEvent) => void)[] = [];

  constructor(config: TaskEngineConfig) {
    this.provider = config.provider;
    this.toolRegistry = config.toolRegistry;
    this.permissionManager = config.permissionManager;
    this.maxIterations = config.maxIterations || 20;
    this.maxRetriesPerStep = config.maxRetriesPerStep || 3;
    this.fastModel = config.fastModel || 'llama3.2:1b';
    this.deepModel = config.deepModel || 'qwen3:4b';
  }

  onEvent(listener: (event: TaskEvent) => void) {
    this.eventListeners.push(listener);
  }

  emit(type: TaskEventType, taskId: string, data?: any) {
    const event: TaskEvent = { type, taskId, timestamp: Date.now(), data };
    this.eventListeners.forEach(l => l(event));
  }

  createTask(goal: string | import('../../providers/types').MessageContentPart[], reasoningMode?: import('../../providers/types').ReasoningMode): TaskState {
    const taskId = randomUUID();
    const state: TaskState = {
      taskId,
      originalGoal: goal,
      reasoningMode,
      status: TaskStatus.PENDING,
      steps: [],
      timestamps: { created: Date.now(), updated: Date.now() },
      metadata: {},
      cancellationRequested: false,
      abortController: new AbortController()
    };
    return state;
  }

  fastPathResponse(state: TaskState, responseText: string): TaskState {
    console.log('[PERF] task_started');
    this.updateStatus(state, TaskStatus.RUNNING);
    this.emit(TaskEventType.TASK_STARTED, state.taskId, { goal: state.originalGoal });
    
    state.metadata.finalResponse = responseText;
    this.updateStatus(state, TaskStatus.COMPLETED);
    this.emit(TaskEventType.TASK_COMPLETED, state.taskId);
    console.log('[PERF] final_response');
    console.log('[PERF] task_complete');
    return state;
  }

  async fastPathToolExecution(state: TaskState, toolName: string, args: any, context: ToolContext): Promise<TaskState> {
    console.log('[PERF] task_started');
    this.updateStatus(state, TaskStatus.RUNNING);
    this.emit(TaskEventType.TASK_STARTED, state.taskId, { goal: state.originalGoal });

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return this.fastPathResponse(state, `Error: Internal tool ${toolName} not found.`);
    }

    this.emit(TaskEventType.STEP_STARTED, state.taskId, { tool: toolName });
    this.updateStatus(state, TaskStatus.WAITING_FOR_PERMISSION);
    this.emit(TaskEventType.PERMISSION_REQUESTED, state.taskId, { tool: toolName });

    const permResponse = await this.permissionManager.checkPermission({ tool, args, context });
    
    if (state.cancellationRequested) {
       this.updateStatus(state, TaskStatus.CANCELLED);
       return state;
    }

    if (!permResponse.allowed) {
      if (permResponse.data?.action === 'CONFIRM') {
         this.updateStatus(state, TaskStatus.COMPLETED);
         state.metadata.pendingClarification = true;
         state.metadata.question = permResponse.data.message;
         state.metadata.finalResponse = permResponse.data.message;
         state.metadata.pendingTool = toolName;
         state.metadata.pendingArgs = args;
         this.emit(TaskEventType.TASK_COMPLETED, state.taskId, { message: permResponse.data.message });
         return state;
      }
      this.emit(TaskEventType.TOOL_RESULT as any, state.taskId, { tool: toolName, result: { success: false, error: 'Permission denied by user.' } });
      return this.fastPathResponse(state, permResponse.data?.error || 'Permission denied.');
    }

    let execContext = { ...context, signal: state.abortController.signal };
    if (permResponse.data) {
      execContext = { ...execContext, injectedData: permResponse.data };
    }

    this.emit(TaskEventType.PERMISSION_GRANTED, state.taskId, { tool: toolName });
    this.updateStatus(state, TaskStatus.RUNNING);
    this.emit(TaskEventType.TOOL_CALLED, state.taskId, { tool: toolName, args });

    console.log(`[PERF] tool_start (${toolName})`);
    const result = await this.toolRegistry.executeTool(toolName, args, execContext);
    console.log(`[PERF] tool_end (${toolName})`);

    const emitResult = { ...result };
    if (emitResult.data && emitResult.data._isImage) {
      emitResult.data = { _isImage: true, message: 'Image attached (data hidden for UI performance)' };
    }
    this.emit(TaskEventType.TOOL_RESULT, state.taskId, { tool: toolName, result: emitResult });

    let responseText = result.success ? `Successfully executed ${toolName}. Result: ${JSON.stringify(result.data)}` : `Execution failed: ${result.error}`;
    
    if (result.uiContent) {
       responseText = result.uiContent;
    }
    
    if (result.spokenContent) {
       state.metadata.spokenResponse = result.spokenContent;
    }
    
    // Cleanup output for UX
    if (result.success && toolName === 'browser_open') responseText = 'Opened successfully.';
    if (result.success && toolName === 'browser_close') responseText = 'Browser closed.';
    if (result.success && toolName === 'system_time') responseText = `Current time: ${result.data.currentTime}`;
    if (result.success && toolName === 'open_application') responseText = `Opened application.`;

    state.metadata.finalResponse = responseText;
    this.updateStatus(state, TaskStatus.COMPLETED);
    this.emit(TaskEventType.TASK_COMPLETED, state.taskId);
    console.log('[PERF] final_response');
    console.log('[PERF] task_complete');
    return state;
  }

  cancelTask(state: TaskState) {
    if (state.cancellationRequested || state.status === TaskStatus.CANCELLED) return;
    
    state.cancellationRequested = true;
    state.abortController.abort();
    this.updateStatus(state, TaskStatus.CANCELLED);
    this.emit(TaskEventType.TASK_CANCELLED, state.taskId);
  }

  updateStatus(state: TaskState, status: TaskStatus) {
    state.status = status;
    state.timestamps.updated = Date.now();
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED || status === TaskStatus.CANCELLED) {
      state.timestamps.completed = Date.now();
    }
  }

  async runTask(state: TaskState, context: ToolContext): Promise<TaskState> {
    console.log('[PERF] task_started');
    console.log(`[ENGINE] task started: ${typeof state.originalGoal === 'string' ? state.originalGoal : 'multimodal'}`);
    this.emit(TaskEventType.TASK_STARTED, state.taskId, { goal: state.originalGoal });
    this.updateStatus(state, TaskStatus.RUNNING);

    let memory: Message[] = [
      { 
        role: 'system', 
        content: `${getCoreIdentityPrompt()}
You are a multi-step execution agent. The current time and date is ${new Date().toLocaleString()}.
Use tools to accomplish the user's goal. You may propose a plan using 'propose_plan' for complex tasks, or directly use tools for simple tasks.
After actions, observe results. If something fails, you can retry or revise your plan.
When you believe the task is fully complete and verified, use 'complete_task'.
If it is impossible to complete, use 'fail_task'.

CRITICAL RULES:
1. NEVER claim a tool action succeeded (e.g. "I opened the browser") unless you have actually called the tool and received a successful response from it.
2. You cannot fabricate or self-attest evidence. Evidence provided to complete_task MUST be based on the actual tool responses you received.` 
      },
      {
        role: 'user',
        content: state.originalGoal
      }
    ];

    // Expose control tools implicitly alongside registry tools
    const controlTools = [
      {
        name: 'propose_plan',
        description: 'Propose a structured plan of actionable steps for a complex task.',
        parameters: {
          type: 'object',
          properties: {
            steps: { type: 'array', items: { type: 'string' } },
            criteria: { type: 'array', items: { type: 'string' }, description: 'Criteria to verify before completion' }
          },
          required: ['steps']
        }
      },
      {
        name: 'complete_task',
        description: 'Mark the task as completed. Provide evidence of how completion criteria were verified.',
        parameters: { type: 'object', properties: { evidence: { type: 'string' } }, required: ['evidence'] }
      },
      {
        name: 'fail_task',
        description: 'Mark the task as impossible to complete.',
        parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] }
      }
    ];

    let allTools = [...this.toolRegistry.getToolDefinitions(), ...controlTools];
    if (state.metadata.domain === 'productivity') {
      const allowed = ['tasks_list', 'tasks_create', 'tasks_complete', 'tasks_delete', 'tasks_count', 'reminders_list', 'reminders_create', 'reminders_cancel', 'alarms_list', 'alarms_create', 'alarms_cancel', 'email_draft', 'system_time', 'system_info', 'complete_task', 'fail_task'];
      allTools = allTools.filter(t => allowed.includes(t.name));
    }

    let iterations = 0;
    let repetitiveFails = 0;
    let lastActionStr = '';

    while (iterations < this.maxIterations) {
      if (state.cancellationRequested) {
        this.updateStatus(state, TaskStatus.CANCELLED);
        return state;
      }

      iterations++;
      
      let response: Message = { role: 'assistant', content: '' };
      
      if (this.provider.generateResponseStream) {
        try {
          console.log(`[PERF] model_request_start (iteration ${iterations})`);
          const stream = this.provider.generateResponseStream(memory, allTools, {
            signal: state.abortController.signal,
            reasoningMode: state.reasoningMode,
            modelOverride: state.reasoningMode === 'fast' ? this.fastModel : this.deepModel
          });
          let firstChunk = true;
          for await (const event of stream) {
            if (state.cancellationRequested) break;
            
            if (event.type === 'text_delta') {
              if (firstChunk && event.content.trim().length > 0) {
                console.log(`[PERF] first_model_output (iteration ${iterations})`);
                firstChunk = false;
              }
              this.emit(TaskEventType.MESSAGE_DELTA, state.taskId, { content: event.content });
            } else if (event.type === 'done') {
              response = event.message;
            }
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || state.cancellationRequested) {
            this.updateStatus(state, TaskStatus.CANCELLED);
            return state;
          }
          throw e;
        }
      } else {
        try {
          response = await this.provider.generateResponse(memory, allTools, {
            reasoningMode: state.reasoningMode,
            signal: state.abortController.signal,
            modelOverride: state.reasoningMode === 'fast' ? this.fastModel : this.deepModel
          });
        } catch (e: any) {
          if (e.name === 'AbortError' || state.cancellationRequested) {
            this.updateStatus(state, TaskStatus.CANCELLED);
            return state;
          }
          throw e;
        }
      }
      
      if (!response) {
        response = { role: 'assistant', content: 'Stream aborted or failed.' };
      }

      // -------------------------------------------------------------
      // URGENT FIX: Parse raw tool/function JSON leaking into UI
      // -------------------------------------------------------------
      if (!response.tool_calls || response.tool_calls.length === 0) {
        if (typeof response.content === 'string' && (response.content.includes('"name"') || response.content.includes('"function"') || response.content.includes('"evidence"') || response.content.includes('"steps"'))) {
          try {
            const potentialJsonStr = response.content.trim();
            let parsedCalls = [];
            
            const lines = potentialJsonStr.split('\n');
            let hasValidJson = false;

            for (const line of lines) {
              const t = line.trim();
              if (t.startsWith('{') && t.endsWith('}')) {
                try {
                  const parsed = JSON.parse(t);
                  // Format 1: parsed.function is an object { name: '...', arguments: {...} }
                  if (parsed.type === 'function' && parsed.function && typeof parsed.function === 'object' && parsed.function.name) {
                    let args = parsed.function.arguments || parsed.function.parameters || {};
                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); } catch(e){}
                    }
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: parsed.function.name,
                      arguments: args
                    });
                    hasValidJson = true;
                  } 
                  // Format 2: parsed.function is a string (tool name)
                  else if (parsed.type === 'function' && typeof parsed.function === 'string') {
                    let args = parsed.arguments || parsed.parameters || {};
                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); } catch(e){}
                    }
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: parsed.function,
                      arguments: args
                    });
                    hasValidJson = true;
                  }
                  // Format 3: simple name / arguments pairs
                  else if (parsed.name && (parsed.arguments || parsed.parameters)) {
                    let args = parsed.arguments || parsed.parameters || {};
                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); } catch(e){}
                    }
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: parsed.name,
                      arguments: args
                    });
                    hasValidJson = true;
                  } else if (parsed.evidence !== undefined || parsed.result !== undefined) {
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: 'complete_task',
                      arguments: { evidence: typeof parsed.evidence === 'string' ? parsed.evidence : JSON.stringify(parsed) }
                    });
                    hasValidJson = true;
                  } else if (parsed.steps !== undefined) {
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: 'propose_plan',
                      arguments: parsed
                    });
                    hasValidJson = true;
                  }
                } catch(e) {}
              }
            }
            
            if (parsedCalls.length === 0 && potentialJsonStr.startsWith('{') && potentialJsonStr.endsWith('}')) {
               try {
                  const parsed = JSON.parse(potentialJsonStr);
                  if (parsed.type === 'function' && parsed.function && typeof parsed.function === 'object' && parsed.function.name) {
                    let args = parsed.function.arguments || parsed.function.parameters || {};
                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); } catch(e){}
                    }
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: parsed.function.name,
                      arguments: args
                    });
                    hasValidJson = true;
                  } else if (parsed.type === 'function' && typeof parsed.function === 'string') {
                    let args = parsed.arguments || parsed.parameters || {};
                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); } catch(e){}
                    }
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: parsed.function,
                      arguments: args
                    });
                    hasValidJson = true;
                  } else if (parsed.name && (parsed.arguments || parsed.parameters)) {
                    let args = parsed.arguments || parsed.parameters || {};
                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); } catch(e){}
                    }
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: parsed.name,
                      arguments: args
                    });
                    hasValidJson = true;
                  } else if (parsed.evidence !== undefined || parsed.result !== undefined) {
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: 'complete_task',
                      arguments: { evidence: typeof parsed.evidence === 'string' ? parsed.evidence : JSON.stringify(parsed) }
                    });
                    hasValidJson = true;
                  } else if (parsed.steps !== undefined) {
                    parsedCalls.push({
                      id: randomUUID(),
                      type: 'function',
                      name: 'propose_plan',
                      arguments: parsed
                    });
                    hasValidJson = true;
                  }
               } catch (e) {}
            }

            // Fallback: If it STILL looks like a raw tool call (even if invalid JSON), suppress it!
            if (!hasValidJson && (potentialJsonStr.includes('"type":"function"') || potentialJsonStr.includes('"type": "function"'))) {
                console.warn("[ENGINE] Intercepted MALFORMED raw JSON tool call from LLM:", potentialJsonStr);
                
                // Attempt to forcefully extract name and parameters using regex since JSON parse failed
                const nameMatch = potentialJsonStr.match(/"name"\s*:\s*"([^"]+)"/);
                if (nameMatch) {
                    const extractedName = nameMatch[1];
                    let extractedArgs: any = {};
                    
                    // Simple heuristic: just look for key-value pairs if parameters exists
                    if (potentialJsonStr.includes('"parameters"') || potentialJsonStr.includes('"arguments"')) {
                         const titleMatch = potentialJsonStr.match(/"title"\s*:\s*"([^"]+)"/);
                         const dueAtMatch = potentialJsonStr.match(/"dueAt"\s*:\s*"([^"]+)"/);
                         const evidenceMatch = potentialJsonStr.match(/"evidence"\s*:\s*"([^"]+)"/);
                         const queryMatch = potentialJsonStr.match(/"query"\s*:\s*"([^"]+)"/);
                         
                         if (titleMatch) extractedArgs['title'] = titleMatch[1];
                         else extractedArgs['title'] = "New Task"; // Fallback if hallucinated
                         if (dueAtMatch) extractedArgs['dueAt'] = dueAtMatch[1];
                         if (evidenceMatch) extractedArgs['evidence'] = evidenceMatch[1];
                         if (queryMatch) extractedArgs['query'] = queryMatch[1];
                    }
                    
                    parsedCalls.push({
                        id: randomUUID(),
                        type: 'function',
                        name: extractedName,
                        arguments: extractedArgs
                    });
                } else {
                    parsedCalls.push({
                        id: randomUUID(),
                        type: 'function',
                        name: 'error_handler',
                        arguments: { error: 'The LLM generated malformed JSON.' }
                    });
                }
            }
            
            // The scans above require the JSON to be the whole line or the whole
            // message. Catch the remaining case: a tool call embedded in prose
            // or inside a ```json fence.
            if (parsedCalls.length === 0) {
              const embedded = extractToolCallFromText(potentialJsonStr);
              if (embedded) {
                console.warn(`[ENGINE] Intercepted embedded raw JSON tool call: ${embedded.name}`);
                parsedCalls.push({
                  id: randomUUID(),
                  type: 'function',
                  name: embedded.name,
                  arguments: embedded.arguments
                });
              }
            }

            if (parsedCalls.length > 0) {
              response.tool_calls = parsedCalls;
              response.content = "I will use a tool to handle this.";
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }

      memory.push(response);

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const tc of response.tool_calls) {
          if (state.cancellationRequested) break;

          const actionStr = `${tc.name}:${JSON.stringify(tc.arguments)}`;
          if (actionStr === lastActionStr && repetitiveFails > 2) {
            // Loop protection
            this.updateStatus(state, TaskStatus.FAILED);
            this.emit(TaskEventType.TASK_FAILED, state.taskId, { reason: 'Infinite loop detected.' });
            return state;
          }

          if (tc.name === 'propose_plan') {
            this.emit(TaskEventType.PLAN_CREATED, state.taskId, tc.arguments);
            const args = tc.arguments as any;
            state.steps = (args.steps || []).map((s: string) => ({ id: randomUUID(), purpose: s, status: 'PENDING', retries: 0 }));
            state.completionCriteria = args.criteria;
            memory.push({ role: 'tool', name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ status: 'Plan accepted.' }) });
            continue;
          }
          if (tc.name === 'complete_task') {
            this.updateStatus(state, TaskStatus.VERIFYING);
            this.emit(TaskEventType.VERIFICATION_STARTED, state.taskId, tc.arguments);
            // Verify criteria
            this.updateStatus(state, TaskStatus.COMPLETED);
            this.emit(TaskEventType.TASK_COMPLETED, state.taskId, tc.arguments);
            state.metadata.finalResponse = (tc.arguments as any)?.evidence || 'Task completed successfully.';
            memory.push({ role: 'tool', name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ status: 'Verified and completed.' }) });
            console.log('[PERF] final_response');
            console.log('[PERF] task_complete');
            return state;
          }
          if (tc.name === 'fail_task') {
            this.updateStatus(state, TaskStatus.FAILED);
            this.emit(TaskEventType.TASK_FAILED, state.taskId, tc.arguments);
            state.metadata.finalResponse = (tc.arguments as any)?.reason || 'Task failed.';
            return state;
          }

          // Normal Tool Execution
          let canonicalToolName = tc.name;
          // Alias hallucinated names
          if (canonicalToolName === 'alarm_set') canonicalToolName = 'alarms_create';

          const tool = this.toolRegistry.getTool(canonicalToolName);
          if (!tool) {
            memory.push({ role: 'tool', name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: 'Tool not found.' }) });
            repetitiveFails++;
            lastActionStr = actionStr;
            continue;
          }

          this.emit(TaskEventType.STEP_STARTED, state.taskId, { tool: canonicalToolName });
          this.updateStatus(state, TaskStatus.WAITING_FOR_PERMISSION);
          this.emit(TaskEventType.PERMISSION_REQUESTED, state.taskId, { tool: canonicalToolName });

          const permResponse = await this.permissionManager.checkPermission({ tool, args: tc.arguments, context });
          
          if (state.cancellationRequested) {
             this.updateStatus(state, TaskStatus.CANCELLED);
             return state;
          }

          if (!permResponse.allowed) {
            if (permResponse.data?.action === 'CONFIRM') {
               this.updateStatus(state, TaskStatus.COMPLETED);
               state.metadata.pendingClarification = true;
               state.metadata.question = permResponse.data.message;
               state.metadata.finalResponse = permResponse.data.message;
               state.metadata.pendingTool = canonicalToolName;
               state.metadata.pendingArgs = tc.arguments;
               this.emit(TaskEventType.TASK_COMPLETED, state.taskId, { message: permResponse.data.message });
               return state;
            }

            this.emit(TaskEventType.TOOL_RESULT as any, state.taskId, { tool: canonicalToolName, result: { success: false, error: 'Permission denied by user.' } });
            memory.push({ role: 'tool', name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: permResponse.data?.error || 'Permission denied.' }) });
            continue;
          }

          // If the permission system injects data (like a screenshot), we pass it to the tool execution environment
          let execContext = { ...context, signal: state.abortController.signal };
          if (permResponse.data) {
             execContext = { ...execContext, injectedData: permResponse.data };
          }
          
          this.emit(TaskEventType.PERMISSION_GRANTED, state.taskId, { tool: canonicalToolName });
          this.updateStatus(state, TaskStatus.RUNNING);
          this.emit(TaskEventType.TOOL_CALLED, state.taskId, { tool: canonicalToolName, args: tc.arguments });

          console.log(`[PERF] tool_start (${canonicalToolName})`);
          const result = await this.toolRegistry.executeTool(canonicalToolName, tc.arguments, execContext);
          console.log(`[PERF] tool_end (${canonicalToolName})`);
          
          const emitResult = { ...result };
          if (emitResult.data && emitResult.data._isImage) {
            emitResult.data = { _isImage: true, message: 'Image attached (data hidden for UI performance)' };
          }
          this.emit(TaskEventType.TOOL_RESULT, state.taskId, { tool: canonicalToolName, result: emitResult });
          
          if (result.success) {
            let toolContent: any = JSON.stringify(result.data);
            if (typeof toolContent === 'string' && toolContent.length > 8000) {
              toolContent = toolContent.substring(0, 8000) + '... [TRUNCATED FOR CONTEXT LIMITS]';
            }
            if (result.data && result.data._isImage) {
               toolContent = [
                 { type: 'text', text: 'Image attached from tool.' },
                 { type: 'image', image: { mimeType: result.data.mimeType, data: result.data.data } }
               ];
            }
            if (result.uiContent) {
               state.metadata.uiCards = state.metadata.uiCards || [];
               state.metadata.uiCards.push(result.uiContent);
            }
            memory.push({ role: 'tool', name: tc.name, tool_call_id: tc.id, content: toolContent });
            repetitiveFails = 0; // reset
          } else {
            memory.push({ role: 'tool', name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: result.error }) });
            this.emit(TaskEventType.STEP_FAILED, state.taskId, { tool: canonicalToolName, error: result.error });
            repetitiveFails++;
          }
          lastActionStr = actionStr;
        }
      } else {
        // Model provided a raw text response, maybe just answering a simple question
        if (iterations === 1 && !response.tool_calls) {
          // Simple fast path completion
          this.updateStatus(state, TaskStatus.COMPLETED);
          this.emit(TaskEventType.TASK_COMPLETED, state.taskId, { response: response.content });
          state.metadata.finalResponse = response.content;
          return state;
        } else {
          // Model spoke without tools during a loop. Push user prompt to keep going or finish
          memory.push({ role: 'user', content: 'Please continue. Use complete_task if done, or propose_plan/execute tools if not.' });
        }
      }
    }

    this.updateStatus(state, TaskStatus.FAILED);
    this.emit(TaskEventType.TASK_FAILED, state.taskId, { reason: 'Max iterations reached.' });
    return state;
  }
}
