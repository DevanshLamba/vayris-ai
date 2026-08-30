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

export interface OrchestratorConfig {
  provider: ModelProvider;
  toolRegistry: ToolRegistry;
  permissionManager?: PermissionManager;
  maxIterations?: number;
  fastModel?: string;
  deepModel?: string;
}

export class AgentOrchestrator {
  private engine: TaskEngine;
  private activeTask: TaskState | null = null;
  private provider: ModelProvider;
  public fastModel: string;
  public deepModel: string;

  constructor(config: OrchestratorConfig) {
    this.provider = config.provider;
    this.fastModel = config.fastModel || 'llama3.2:1b';
    this.deepModel = config.deepModel || 'qwen3:4b';
    this.engine = new TaskEngine({
      provider: config.provider,
      toolRegistry: config.toolRegistry,
      permissionManager: config.permissionManager || new DefaultPermissionManager(),
      maxIterations: config.maxIterations || 20,
      deepModel: this.deepModel
    });
  }

  // Subscribe to internal task events for UI/CLI output
  onTaskEvent(listener: (event: any) => void) {
    this.engine.onEvent(listener);
  }

  cancelActiveTask() {
    console.log(`[ORCHESTRATOR] cancelActiveTask called. activeTask is: ${this.activeTask ? this.activeTask.taskId : 'null'}`);
    if (this.activeTask) {
      console.log(`[ORCHESTRATOR] Hard cancelling active task: ${this.activeTask.taskId}`);
      this.engine.cancelTask(this.activeTask);
      this.activeTask = null;
      return true;
    }
    return false;
  }

  async runTask(goal: string | import('../providers/types').MessageContentPart[], context: ToolContext, overrideMode?: 'AUTO' | 'FAST' | 'DEEP'): Promise<TaskState> {
    console.log('[PERF] input_received');
    let reasoningMode: import('../providers/types').ReasoningMode = 'normal';

    if (typeof goal === 'string') {
      const { normalizeAddressing } = await import('./utils/addressing');
      const { normalized, isNameOnly } = normalizeAddressing(goal);
      
      goal = normalized;
      const lower = goal.toLowerCase();

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
      }

      if (intentAction) {
         console.log(`[ROUTER] Intent matched: ${intentAction.tool}`);
         const task = this.engine.createTask(goal, 'fast');
         this.activeTask = task;
         const result = await this.engine.fastPathToolExecution(task, intentAction.tool, intentAction.args, context);
         if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
         return result;
      }

      // 2. DIRECT CONVERSATION VS DEEP TASK (Model Routing)
      const isDirectChat = /^(hello|hi|hey|how are you|tell me|explain(?!.*\b(file|folder|project|browser|open)\b)|what is(?!.*\b(file|folder|project|browser)\b)|what's|what are|why is|why are|give me(?!.*\b(file|folder)\b)|rewrite|translate|summarize|thanks|thank you|good morning|good night|make this|can you help me|that's cool)/i.test(lower) && !/(open|close|launch|run|search|find|check|read|inspect|go to|download)/i.test(lower);
      
      const shouldRunDirect = overrideMode === 'FAST' ? true : (overrideMode === 'DEEP' ? false : (isDirectChat || isNameOnly));

      if (shouldRunDirect) {
         console.log(`[ROUTER] decision=DIRECT_CONVERSATION (Model: ${this.fastModel})`);
         return this.runDirectChat(goal, context);
      }

      console.log(`[ROUTER] decision=AGENT_TASK (Model: ${this.deepModel})`);
    }
    
    const task = this.engine.createTask(goal, 'normal');
    this.activeTask = task;
    const result = await this.engine.runTask(task, context);
    if (this.activeTask?.taskId === task.taskId) this.activeTask = null;
    return result;
  }

  cancelTask(task: TaskState) {
    this.engine.cancelTask(task);
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
        content: `You are Vayris, a personal AI assistant.
Reply naturally in the same language and style as the user's latest message.
If the user writes in Hinglish or Roman Hindi, respond in natural Roman-script Hinglish.
If the user writes in Hindi, respond in Hindi.
If the user writes in English, respond in English.
Match the user's tone.
Do not unnecessarily translate or formalize the user's language.
Do not attempt to use tools. Be concise if the question is simple.
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
        
        for await (const event of stream) {
          console.log(`[PERF] received stream event: ${event.type}`);
          if (task.cancellationRequested) break;
          if (event.type === 'text_delta') {
            if (firstChunk && event.content.trim().length > 0) {
              console.log(`[PERF] first_model_output`);
              firstChunk = false;
            }
            this.engine.emit(TaskEventType.MESSAGE_DELTA, task.taskId, { content: event.content });
            fullResponse += event.content;
          }
        }
        
        task.metadata.finalResponse = fullResponse;
      } else {
        const response = await this.provider.generateResponse(memory, [], {
          signal: task.abortController.signal,
          reasoningMode: 'fast',
          modelOverride: this.fastModel
        });
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
