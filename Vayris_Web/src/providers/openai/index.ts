/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { ModelProvider, ProviderConfig, Message, ToolDefinition, ToolCall } from '../types';

export class OpenAICompatibleProvider implements ModelProvider {
  name = 'openai-compatible';
  capabilities = { vision: true };
  private config!: ProviderConfig;

  initialize(config: ProviderConfig): void {
    if (!config.apiKey && !config.baseUrl) {
      throw new Error("OpenAIProvider requires an apiKey or baseUrl");
    }
    this.config = {
      model: config.model,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    };
  }

  async checkConnection(): Promise<void> {
    try {
      const url = `${this.config.baseUrl}/models`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      
      const response = await fetch(url, { method: 'GET', headers });
      
      if (response.status === 401) throw new Error('Invalid API key');
      if (response.status === 404) throw new Error('Invalid endpoint');
      if (!response.ok) throw new Error(`Connection failure: ${response.statusText}`);
      
    } catch (e: any) {
      if (e.message.includes('fetch')) throw new Error('Connection failure');
      throw e;
    }
  }

  async checkModelAvailability(modelNames: string[]): Promise<string[]> {
    try {
      const url = `${this.config.baseUrl}/models`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) return [];
      
      const data = await response.json();
      const availableModels = data.data?.map((m: any) => m.id) || [];
      
      const missing = modelNames.filter(m => !availableModels.includes(m));
      return missing;
    } catch (e) {
      // If we can't fetch models list for some reason, just return empty to not block startup
      return [];
    }
  }

  private formatMessages(messages: Message[]) {
    return messages.map(m => {
      const out: any = { role: m.role };
      
      if (Array.isArray(m.content)) {
        out.content = m.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          } else if (part.type === 'image') {
            const dataUri = part.image.data.startsWith('data:') 
              ? part.image.data 
              : `data:${part.image.mimeType};base64,${part.image.data}`;
            return { type: 'image_url', image_url: { url: dataUri } };
          }
          return null;
        });
      } else {
        out.content = m.content || "";
      }

      if (m.name) out.name = m.name;
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      
      if (m.tool_calls) {
        out.tool_calls = m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
          }
        }));
      }
      return out;
    });
  }

  async generateResponse(messages: Message[], tools?: ToolDefinition[], options?: import('../types').ModelGenerateOptions): Promise<Message> {
    const url = `${this.config.baseUrl}/chat/completions`;
    
    // Handle generic reasoning mode for OpenAI-compatible providers
    let formattedMessages = this.formatMessages(messages);
    if (options?.reasoningMode === 'fast') {
       // We rely solely on the orchestrator's fast system prompt.
    } else if (options?.reasoningMode === 'deep') {
       formattedMessages = [
         { role: 'system', content: 'You must engage in deep, rigorous, multi-step chain of thought reasoning before providing your final answer. Think step-by-step.' },
         ...formattedMessages
       ];
    }

    const payload: any = {
      model: options?.modelOverride || this.config.model,
      messages: formattedMessages,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }
      }));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Provider Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    const resultMessage: Message = {
      role: 'assistant',
      content: message.content || null,
    };

    if (message.tool_calls) {
      resultMessage.tool_calls = message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : (tc.function.arguments || {})
      }));
    }

    return resultMessage;
  }

  async *generateResponseStream(messages: Message[], tools?: ToolDefinition[], options?: import('../types').ModelGenerateOptions): AsyncGenerator<import('../types').StreamEvent, void, unknown> {
    const url = `${this.config.baseUrl}/chat/completions`;
    
    // Handle generic reasoning mode for OpenAI-compatible providers
    let formattedMessages = this.formatMessages(messages);
    if (options?.reasoningMode === 'fast') {
       // We rely solely on the orchestrator's fast system prompt.
    } else if (options?.reasoningMode === 'deep') {
       formattedMessages = [
         { role: 'system', content: 'You must engage in deep, rigorous, multi-step chain of thought reasoning before providing your final answer. Think step-by-step.' },
         ...formattedMessages
       ];
    }

    const payload: any = {
      model: options?.modelOverride || this.config.model,
      stream: true,
      messages: formattedMessages,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }
      }));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;

    console.log(`[OLLAMA] sending payload to ${url}:`, JSON.stringify(payload, null, 2));

    const startTime = Date.now();
    console.log(`[PERF] HTTP Request initiated at ${startTime}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options?.signal
    });
    
    const fetchTime = Date.now();
    console.log(`[PERF] HTTP Request completed in ${fetchTime - startTime}ms. Status: ${response.status}`);

    if (response.status === 401) throw new Error('Invalid API key');
    if (!response.ok) throw new Error(`Model API error: ${response.statusText}`);
    
    if (!response.body) throw new Error('Response body is null');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let currentContent = "";
    let toolCallsMap = new Map<number, any>();
    let buffer = "";

    let firstChunkTime = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (firstChunkTime === 0) {
         firstChunkTime = Date.now();
         console.log(`[PERF] First stream chunk received in ${firstChunkTime - fetchTime}ms (Total TTFB: ${firstChunkTime - startTime}ms)`);
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // The last line might be incomplete, keep it in the buffer
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        const dataStr = line.replace('data: ', '').trim();
        if (dataStr === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices[0]?.delta;
          if (!delta) continue;
          
          if (delta.content) {
            console.log(`[RAW] chunk\ncontent = ${JSON.stringify(delta.content)}`);
            currentContent += delta.content;
            yield { type: 'text_delta', content: delta.content };
          }
          
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCallsMap.has(index)) {
                toolCallsMap.set(index, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : (tc.function?.arguments ? JSON.stringify(tc.function.arguments) : '')
                });
              } else {
                const existing = toolCallsMap.get(index);
                if (tc.id) existing.id += tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) {
                  if (typeof tc.function.arguments === 'string') {
                    existing.arguments += tc.function.arguments;
                  } else {
                    existing.arguments = JSON.stringify(tc.function.arguments);
                  }
                }
              }
            }
          }
        } catch (e) {
          // A malformed chunk inside a complete line is unexpected, but safe to ignore
        }
      }
    }

    const tool_calls = Array.from(toolCallsMap.values()).map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: typeof tc.arguments === 'string' ? (tc.arguments ? JSON.parse(tc.arguments) : {}) : (tc.arguments || {})
    }));

    const finalMessage: Message = {
      role: 'assistant',
      content: currentContent || null,
    };
    if (tool_calls.length > 0) finalMessage.tool_calls = tool_calls;

    yield { type: 'done', message: finalMessage };
  }
}
