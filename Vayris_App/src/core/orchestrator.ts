/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { ModelProvider, Message } from '../providers/types';
import { ToolRegistry } from '../tools/registry';
import { ToolContext } from '../tools/types';
import { PermissionManager, DefaultPermissionManager } from './permissions';
import { TaskEngine } from './task/engine';
import { TaskState, TaskStatus, TaskEventType } from './task/types';
import { RagService } from '../rag/service';
import { getCoreIdentityPrompt } from './identity';
import { extractToolCallFromText, looksLikeToolCallStart, looksLikeMalformedToolCall } from './utils/toolCallText';

export interface OrchestratorConfig {
  provider: ModelProvider;
  toolRegistry: ToolRegistry;
  permissionManager?: PermissionManager;
  maxIterations?: number;
  fastModel?: string;
  deepModel?: string;
  ragService?: RagService;
}

export class AgentOrchestrator {
  private engine: TaskEngine;
  private activeTask: TaskState | null = null;
  private pendingClarification: { originalGoal: string, question: string } | null = null;
  private pendingConfirmationCall: { tool: string, args: any, originalGoal: string, question: string } | null = null;
  private provider: ModelProvider;
  public fastModel: string;
  public deepModel: string;
  private ragService?: RagService;

  constructor(config: OrchestratorConfig) {
    this.provider = config.provider;
    this.fastModel = config.fastModel || 'llama3.2:1b';
    this.deepModel = config.deepModel || 'qwen3:4b';
    this.ragService = config.ragService;
    this.engine = new TaskEngine({
      provider: config.provider,
      toolRegistry: config.toolRegistry,
      permissionManager: config.permissionManager || new DefaultPermissionManager(),
      maxIterations: config.maxIterations || 20,
      fastModel: this.fastModel,
      deepModel: this.deepModel
    });
  }

  // Subscribe to internal task events for UI/CLI output
  onTaskEvent(listener: (event: any) => void) {
    this.engine.onEvent(listener);
  }

  cancelActiveTask(): boolean {
    console.log(`[ORCHESTRATOR] cancelActiveTask called. activeTask is: ${this.activeTask ? this.activeTask.taskId : 'null'}`);
    let cancelled = false;
    if (this.activeTask) {
      console.log(`[ORCHESTRATOR] Hard cancelling active task: ${this.activeTask.taskId}`);
      this.engine.cancelTask(this.activeTask);
      this.activeTask = null;
      cancelled = true;
    }
    this.pendingClarification = null;
    this.pendingConfirmationCall = null;
    return cancelled;
  }

  async runTask(goal: string | any[], context: ToolContext, overrideMode?: 'FAST' | 'DEEP' | 'AUTO'): Promise<TaskState> {
    const textGoal = typeof goal === 'string' ? goal : goal.find(g => g.type === 'text')?.text || '';
    
    // Check if we are answering a pending tool confirmation (e.g. browser_open)
    if (this.pendingConfirmationCall) {
      const pendingCall = this.pendingConfirmationCall;
      this.pendingConfirmationCall = null; // consume
      
      const cleanGoal = textGoal.toLowerCase().replace(/[.,!?]/g, '').trim();
      // Spoken confirmations arrive via Vosk, so accept the natural variants it
      // produces. Anything outside these lists still falls through to normal
      // processing rather than being guessed at.
      const isConfirm = /^(yes|yeah|yep|yup|ya|y|sure|ok|okay|confirm|confirmed|affirmative|correct|do it|yes please|please do|go ahead|carry on|continue|proceed)$/i.test(cleanGoal);
      const isReject = /^(no|nope|nah|n|cancel|stop|abort|don't|do not|dont|never mind|nevermind|forget it|not now)$/i.test(cleanGoal);
      
      if (isConfirm) {
        console.log(`[ORCHESTRATOR] User confirmed pending tool: ${pendingCall.tool}`);
        const task = this.engine.createTask(textGoal, 'fast');
        this.activeTask = task;
        context.latestGoal = textGoal; // Let GuardrailsPermissionManager know user said yes
        const result = await this.engine.fastPathToolExecution(task, pendingCall.tool, pendingCall.args, context);
        if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
        return result;
      } else if (isReject) {
        console.log(`[ORCHESTRATOR] User rejected pending tool: ${pendingCall.tool}`);
        const task = this.engine.createTask(textGoal, 'fast');
        return this.engine.fastPathResponse(task, 'Operation cancelled.');
      }
      // If neither explicit yes/no, fall through to normal processing
      console.log(`[ORCHESTRATOR] User ignored pending tool, processing as new goal.`);
    }

    // Check if we are answering a pending clarification
    if (this.pendingClarification) {
      console.log(`[ROUTER] Answering pending clarification`);
      const pending = this.pendingClarification;
      this.pendingClarification = null; // consume
      
      goal = `Original Request: ${pending.originalGoal}\n\nAssistant Clarification: ${pending.question}\n\nUser Response: ${textGoal}`;
    }

    console.log('[PERF] input_received');
    let reasoningMode: import('../providers/types').ReasoningMode = 'normal';
    let domain = 'agentic';

    if (typeof goal === 'string') {
      const { normalizeAddressing } = await import('./utils/addressing');
      const { normalized, isNameOnly } = normalizeAddressing(goal);

      // Repair known STT distortions of app/site names ("open you deal" ->
      // "open YouTube") before any routing decision reads the text.
      const { normalizeSpokenCommand } = await import('./utils/speechAliases');
      goal = normalizeSpokenCommand(normalized);
      const lower = goal.toLowerCase();

      // Check RAG
      if (this.ragService && this.ragService.shouldRetrieve(goal)) {
        console.log(`[RAG] Query identified as knowledge request: "${goal}"`);
        const contextStr = await this.ragService.retrieveContext(goal);
        if (contextStr) {
          goal = `${goal}\n\n${contextStr}`;
        }
      }

      // 1. FAST ROUTER - DETERMINISTIC SYSTEM ACTIONS (Bypass Models)
      let intentAction: { tool: string; args: any } | null = null;
      let isDeterministic = false;
      
      if (/^(stop|cancel|abort|stop task|cancel task)$/i.test(lower)) {
        const cancelled = this.cancelActiveTask();
        const task = this.engine.createTask(goal, 'fast');
        return this.engine.fastPathResponse(task, cancelled ? "Task cancelled." : "No active task to cancel.");
      }
      
      if (/^(what time is it|what's the current time|tell me the time|time|what time)/i.test(lower)) {
        intentAction = { tool: 'system_time', args: {} };
      } else if (/^(what's the date|what date is it|today's date|date|what date)/i.test(lower)) {
        intentAction = { tool: 'system_time', args: {} };
      } else if (/^(close the browser|close browser|close chromium|close this browser)/i.test(lower)) {
        intentAction = { tool: 'browser_close', args: {} };
      } else if (/^(go back)/i.test(lower)) {
        intentAction = { tool: 'browser_go_back', args: {} };
      } else if (/^(read the page title|read this page)/i.test(lower)) {
        intentAction = { tool: 'browser_read_page', args: {} };
      } else if (/^(what os am i using|what's my cpu|how much ram do i have)/i.test(lower)) {
        intentAction = { tool: 'system_info', args: {} };
      } else if (/^(what's the current git status|what project am i in|show my project info)/i.test(lower)) {
        if (lower.includes('git')) intentAction = { tool: 'git_status', args: {} };
        else intentAction = { tool: 'project_info', args: {} };
      } else if (/^(show|list) (me )?(the |my |all )?(pending |completed )?tasks?$/i.test(lower) || /^(what are my tasks|what tasks do i have|what do i have to do|what do i have left)( \?)?$/i.test(lower)) {
        let status;
        if (lower.includes('pending')) status = 'pending';
        else if (lower.includes('completed')) status = 'completed';
        intentAction = { tool: 'tasks_list', args: { status } };
      } else if (/^how many tasks( do i have| are pending)?$/i.test(lower)) {
        intentAction = { tool: 'tasks_count', args: {} };
      } else if (/^(task|mark task|finish task|mark) (\d+|[a-z0-9_]+) (is |as )?(done|completed?)$/i.test(lower)) {
        const match = lower.match(/^(?:task|mark task|finish task|mark)\s+([a-z0-9_]+)/i);
        if (match && match[1]) intentAction = { tool: 'tasks_complete', args: { id: match[1] } };
      } else if (/^delete task ([a-z0-9_]+)$/i.test(lower)) {
        const match = lower.match(/^delete task ([a-z0-9_]+)/i);
        if (match && match[1]) intentAction = { tool: 'tasks_delete', args: { id: match[1] } };
      } else if (/^(show|list) (me )?(the |my |all )?reminders?$/i.test(lower)) {
        intentAction = { tool: 'reminders_list', args: {} };
      } else if (/^(show|list) (me )?(the |my |all )?alarms?$/i.test(lower)) {
        intentAction = { tool: 'alarms_list', args: {} };
      } else if (/^cancel( my)? (\d{1,2}(:\d{2})?\s*(am|pm)?\s*)?alarm$/i.test(lower)) {
        // Leave for FAST model to extract time properly if not fully specified
      }
      else if (/^search\s+(.+?)\s+for\s+(.+)$/i.test(goal.trim())) {
        const match = goal.trim().match(/^search\s+(.+?)\s+for\s+(.+)$/i)!;
        const siteName = match[1].trim().replace(/[.,!?]+$/, '');
        const query = match[2].trim().replace(/[.,!?]+$/, '');
        const { resolveWebsite } = await import('../tools/native/browser/website_catalog');
        const site = resolveWebsite(siteName);
        let url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        if (site && site.name.toLowerCase() === 'youtube') url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        else if (site && site.name.toLowerCase() === 'google') url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        else if (site && site.name.toLowerCase() === 'wikipedia') url = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`;
        else if (site && site.name.toLowerCase() === 'github') url = `https://github.com/search?q=${encodeURIComponent(query)}`;
        else if (site) url = `https://www.google.com/search?q=site:${site.domain}+${encodeURIComponent(query)}`;
        intentAction = { tool: 'browser_open', args: { url } };
      }
      else if (/^search(?:\s+for)?\s+(.+)$/i.test(goal.trim())) {
        const match = goal.trim().match(/^search(?:\s+for)?\s+(.+)$/i)!;
        const query = match[1].trim().replace(/[.,!?]+$/, '');
        intentAction = { tool: 'browser_open', args: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` } };
      }
      // 3 & 5. UNIVERSAL OPEN ROUTER (App vs Browser)
      else if (/^(open|launch|start|go to|visit|play|browse to|in browser open)\s+(.+)$/i.test(lower) || /^https?:\/\//i.test(lower) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(lower)) {
        
        console.log(`[ROUTER] input="${goal}"`);
        let command = '';
        let target = '';
        
        const match = lower.match(/^(open|launch|start|go to|visit|play|browse to|in browser open)\s+(.+)$/i);
        if (match) {
           command = match[1].toLowerCase();
           target = match[2].trim().replace(/['"]/g, '');
        } else {
           target = lower.trim().replace(/['"]/g, '');
        }
        console.log(`[ROUTER] normalized target="${target}" command="${command}"`);

        const isExplicitBrowser = /in browser|website|on the web|open web|url|this link/i.test(lower) 
                               || /^(go to|visit|browse to)$/.test(command)
                               || /^https?:\/\//i.test(target)
                               || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(target);
        
        let cleanTarget = target.replace(/\b(in browser|website|the website|on the web|web|url|this link|app|the application)\b/ig, '').trim();
        cleanTarget = cleanTarget.replace(/[.,!?]+$/, '').trim();
        if (!cleanTarget) cleanTarget = target.replace(/[.,!?]+$/, '').trim();
        
        const isExplicitApp = /app$|the application$/i.test(target) && !isExplicitBrowser;

        console.log(`[ROUTER] explicitBrowser=${isExplicitBrowser} explicitApplication=${isExplicitApp} cleanTarget="${cleanTarget}"`);

        const { resolveWebsite, normalizeWebUrl } = await import('../tools/native/browser/website_catalog');
        const { ApplicationResolver } = await import('../tools/native/applications/launcher');
        const resolver = new ApplicationResolver();

        if (isExplicitBrowser) {
           let url = '';
           try {
              url = normalizeWebUrl(cleanTarget);
           } catch {
              url = `https://www.google.com/search?q=${encodeURIComponent(cleanTarget)}`;
           }
           
           if (command === 'play') url = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTarget)}`;
           if (command === 'in browser open') url = `https://www.google.com/search?q=${encodeURIComponent(cleanTarget)}`;
           
           console.log(`[WEB] input="${goal}" normalized="${cleanTarget}" explicitBrowser=true url="${url}"`);
           intentAction = { tool: 'browser_open', args: { url: url } };
        } else if (isExplicitApp) {
           const appRes = await resolver.resolve(cleanTarget);
           console.log(`[APP_INDEX] lookup="${cleanTarget}" match=${appRes.found} source="${appRes.source}"`);
           if (appRes.found) {
              intentAction = { tool: 'open_application', args: { target: cleanTarget } };
           } else {
              const task = this.engine.createTask(goal, 'fast');
              return this.engine.fastPathResponse(task, `Application "${cleanTarget}" not found on this system.`);
           }
        } else {
           // DEFAULT "Open X"
           const appRes = await resolver.resolve(cleanTarget);
           console.log(`[APP_INDEX] lookup="${cleanTarget}" match=${appRes.found} source="${appRes.source}"`);
           if (appRes.found) {
              intentAction = { tool: 'open_application', args: { target: cleanTarget } };
           } else {
              // Website Fallback
              try {
                 const url = normalizeWebUrl(cleanTarget);
                 console.log(`[WEB] input="${goal}" normalized="${cleanTarget}" explicitBrowser=false url="${url}"`);
                 intentAction = { tool: 'browser_open', args: { url: url } };
              } catch {
                 if (command === 'play') {
                    console.log(`[BROWSER] decision=PLAY_SEARCH url="youtube.com/results"`);
                    intentAction = { tool: 'browser_open', args: { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTarget)}` } };
                 } else {
                    console.log(`[ROUTER] decision=NOT_FOUND / CLARIFY`);
                    const task = this.engine.createTask(goal, 'fast');
                    return this.engine.fastPathResponse(task, `I couldn't find an installed application or recognize a valid website for "${cleanTarget}". Did you mean to search the web?`);
                 }
              }
           }
        }
      } else if (/^(what os am i using|what's my cpu|how much ram do i have)/i.test(lower)) {
        intentAction = { tool: 'system_info', args: {} };
      } else if (/^(what's the current git status|what project am i in|show my project info)/i.test(lower)) {
        if (lower.includes('git')) intentAction = { tool: 'git_status', args: {} };
        else intentAction = { tool: 'project_info', args: {} };
      } else if (/^(set|create) (an |my )?alarm (for|of|at) (.+?)[.,!?]*$/i.test(lower)) {
        const match = lower.match(/^(?:set|create) (?:an |my )?alarm (?:for|of|at) (.+?)[.,!?]*$/i)!;
        intentAction = { tool: 'alarms_create', args: { triggerAt: match[1] } };
      } else if (/^(set|create) (an |my )?alarm[.,!?]*$/i.test(lower)) {
        intentAction = { tool: 'alarms_create', args: {} };
      } else if (/^cancel (an |my )?alarm[.,!?]*$/i.test(lower)) {
        intentAction = { tool: 'alarms_cancel', args: {} };
      }

      if (intentAction) {
         console.log(`[ROUTER] Intent matched: ${intentAction.tool}`);
         const task = this.engine.createTask(goal, 'fast');
         this.activeTask = task;
         const result = await this.engine.fastPathToolExecution(task, intentAction.tool, intentAction.args, context);
         
         if (result.metadata?.pendingClarification) {
           if (result.metadata.pendingTool) {
             this.pendingConfirmationCall = { 
               tool: result.metadata.pendingTool, 
               args: result.metadata.pendingArgs,
               originalGoal: textGoal,
               question: result.metadata.question
             };
           } else {
             this.pendingClarification = { originalGoal: textGoal, question: result.metadata.question };
           }
         }
         
         if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
         return result;
      }

      const isDirectChat = /^(hello|hi|hey|how are you|how is|who is|who are|where is|when is|are you|do you|can you|i want|i asked|i think|tell me|explain(?!.*\b(file|folder|project|browser|open)\b)|what is(?!.*\b(file|folder|project|browser)\b)|what's|what are|why is|why are|give me(?!.*\b(file|folder)\b)|rewrite|translate|summarize|thanks|thank you|good morning|good night|make this|can you help me|that's cool)/i.test(lower) && !/(open|close|launch|run|search|find|check|read|inspect|go to|download|create|remind|set|alarm|task|delete|complete|cancel|update)/i.test(lower);
      
      const shouldRunDirect = isDirectChat || isNameOnly;

      if (shouldRunDirect && overrideMode !== 'DEEP') {
         console.log(`[ROUTER] decision=DIRECT_CONVERSATION (Model: ${this.fastModel})`);
         return this.runDirectChat(goal, context);
      }
      
      // 3. PRODUCTIVITY VS AGENTIC
      let isProductivity = /^(create|make|add|set|remind) (a |an )?(task|alarm|reminder)/i.test(lower) || /^(remind me|set an alarm|create a task)/i.test(lower) || (/\b(task|alarm|reminder|remind)\b/i.test(lower) && !/\b(code|file|folder|project|bug|feature|search|analyze|build|fix)\b/i.test(lower));

      // 4. AGENTIC TASK ENGINE
      if (overrideMode === 'AUTO') {
         reasoningMode = 'normal';
      } else {
         reasoningMode = overrideMode === 'FAST' ? 'fast' : (overrideMode === 'DEEP' ? 'deep' : 'normal');
      }
      
      domain = isProductivity ? 'productivity' : 'agentic';
      console.log(`[ROUTER] decision=AGENT_TASK (reasoningMode: ${reasoningMode}, domain: ${domain})`);
    }
    
    const task = this.engine.createTask(goal, reasoningMode);
    task.metadata.domain = domain;
    this.activeTask = task;
    const result = await this.engine.runTask(task, context);
    
    if (result.metadata?.pendingClarification) {
      if (result.metadata.pendingTool) {
        this.pendingConfirmationCall = { 
          tool: result.metadata.pendingTool, 
          args: result.metadata.pendingArgs,
          originalGoal: textGoal,
          question: result.metadata.question
        };
      } else {
        this.pendingClarification = { originalGoal: textGoal, question: result.metadata.question };
      }
    }
    
    if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
    
    if (result.metadata.uiCards && result.metadata.uiCards.length > 0) {
       result.metadata.finalResponse = (result.metadata.finalResponse || '') + '\n\n' + result.metadata.uiCards.join('\n\n');
    }
    
    return result;
  }

  cancelTask(task: TaskState) {
    this.engine.cancelTask(task);
  }

  /**
   * The conversational path offers no tools, so any tool call it produces came
   * back as raw text. Such text must never be shown. If it really is a tool
   * call, re-run the goal through the agentic engine, which has the tools,
   * Guardrails and the confirmation flow. Returns null for ordinary text.
   */
  private async rerouteTextToolCall(
    directTask: TaskState,
    content: string,
    goal: string | import('../providers/types').MessageContentPart[],
    context: ToolContext
  ): Promise<TaskState | null> {
    const call = extractToolCallFromText(content);
    const malformed = !call && looksLikeMalformedToolCall(content);
    if (!call && !malformed) return null;

    console.warn(`[ORCHESTRATOR] Direct chat emitted a tool call as text (${call ? call.name : 'malformed'}); re-routing through the agent.`);

    // Retire the conversational task without ever emitting the raw JSON.
    this.engine.updateStatus(directTask, TaskStatus.COMPLETED);
    this.engine.emit(TaskEventType.TASK_COMPLETED, directTask.taskId);
    if (this.activeTask?.taskId === directTask.taskId) this.activeTask = null;

    const task = this.engine.createTask(goal, 'normal');
    task.metadata.domain = 'agentic';
    this.activeTask = task;
    const result = await this.engine.runTask(task, context);

    if (result.metadata?.pendingClarification) {
      if (result.metadata.pendingTool) {
        this.pendingConfirmationCall = {
          tool: result.metadata.pendingTool,
          args: result.metadata.pendingArgs,
          originalGoal: typeof goal === 'string' ? goal : '',
          question: result.metadata.question
        };
      } else {
        this.pendingClarification = {
          originalGoal: typeof goal === 'string' ? goal : '',
          question: result.metadata.question
        };
      }
    }

    if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
    return result;
  }

  async runDirectChat(goal: string | import('../providers/types').MessageContentPart[], context: ToolContext): Promise<TaskState> {
    console.log('[PERF] direct_chat_started');
    const task = this.engine.createTask(goal, 'fast');
    this.activeTask = task;
    
    // Simulate engine starting
    this.engine.updateStatus(task, TaskStatus.RUNNING);
    this.engine.emit(TaskEventType.TASK_STARTED, task.taskId, { goal });
    
    const memory: Message[] = [
      {
        role: 'system',
        content: `${getCoreIdentityPrompt()}
Respond in English only. Be extremely fast, natural, and concise.
Do not say any extra unnecessary words.
Do not attempt to use tools.
Do not use internal reasoning, chain of thought, or <think> tags.`
      },
      {
        role: 'user',
        content: goal
      }
    ];

    try {
      console.log(`[PERF] model_request_start`);
      if (this.provider.generateResponseStream) {
        const stream = this.provider.generateResponseStream(memory, [], {
          signal: task.abortController.signal,
          reasoningMode: 'fast',
          modelOverride: this.fastModel
        });
        
        console.log(`[PERF] about to start stream iteration for task ${task.taskId}`);
        
        let firstChunk = true;
        let fullResponse = '';
        // A model sometimes answers a plain question by printing a tool call as
        // text. Hold output back while it still looks like JSON so it can never
        // reach the transcript; ordinary prose fails this test on its first
        // character and streams normally.
        let held = '';
        let holding = true;

        for await (const event of stream) {
          console.log(`[PERF] received stream event: ${event.type}`);
          if (task.cancellationRequested) break;
          if (event.type === 'text_delta') {
            if (firstChunk && event.content.trim().length > 0) {
              console.log(`[PERF] first_model_output`);
              firstChunk = false;
            }
            fullResponse += event.content;

            if (holding) {
              held += event.content;
              if (!held.trim()) continue;
              if (looksLikeToolCallStart(held)) continue;
              holding = false;
              this.engine.emit(TaskEventType.MESSAGE_DELTA, task.taskId, { content: held });
              held = '';
              continue;
            }
            this.engine.emit(TaskEventType.MESSAGE_DELTA, task.taskId, { content: event.content });
          }
        }

        if (holding && held.trim() && !task.cancellationRequested) {
          // Never re-route after a stop/cancel - the user asked us to stop.
          const rerouted = await this.rerouteTextToolCall(task, held, goal, context);
          if (rerouted) return rerouted;
          // Not a tool call after all - release the held text unchanged.
          this.engine.emit(TaskEventType.MESSAGE_DELTA, task.taskId, { content: held });
        }

        task.metadata.finalResponse = fullResponse;
      } else {
        const response = await this.provider.generateResponse(memory, [], {
          signal: task.abortController.signal,
          reasoningMode: 'fast',
          modelOverride: this.fastModel
        });
        const rerouted = typeof response.content === 'string'
          ? await this.rerouteTextToolCall(task, response.content, goal, context)
          : null;
        if (rerouted) return rerouted;
        task.metadata.finalResponse = response.content;
        this.engine.emit(TaskEventType.MESSAGE_DELTA, task.taskId, { content: response.content });
      }
      
      if (!task.cancellationRequested) {
        this.engine.updateStatus(task, TaskStatus.COMPLETED);
        this.engine.emit(TaskEventType.TASK_COMPLETED, task.taskId);
        console.log('[PERF] task_complete (direct)');
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || task.cancellationRequested) {
        this.engine.updateStatus(task, TaskStatus.CANCELLED);
        this.engine.emit(TaskEventType.TASK_CANCELLED, task.taskId);
        console.log('[PERF] direct_chat_cancelled');
      } else {
        this.engine.updateStatus(task, TaskStatus.FAILED);
        this.engine.emit(TaskEventType.TASK_FAILED, task.taskId, { reason: e.message });
      }
    }
    
    if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
    return task;
  }
}
