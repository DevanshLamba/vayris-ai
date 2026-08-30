import { ModelProvider, ProviderConfig, Message, ToolDefinition, StreamEvent } from '../types';

export class GeminiProvider implements ModelProvider {
  name = 'gemini';
  capabilities = { vision: true };
  private config!: ProviderConfig;

  initialize(config: ProviderConfig): void {
    if (!config.apiKey) {
      throw new Error("GeminiProvider requires an apiKey");
    }
    this.config = {
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    };
  }

  async checkConnection(): Promise<void> {
    try {
      const url = `${this.config.baseUrl}/models?key=${this.config.apiKey}`;
      const response = await fetch(url);
      if (response.status === 400 || response.status === 403) throw new Error('Invalid API key');
      if (!response.ok) throw new Error(`Connection failure: ${response.statusText}`);
    } catch (e: any) {
      if (e.message.includes('fetch')) throw new Error('Connection failure');
      throw e;
    }
  }

  private mapRole(role: string): string {
    if (role === 'assistant') return 'model';
    if (role === 'system') return 'user'; // System prompts can be handled via systemInstruction
    if (role === 'tool') return 'user';
    return 'user';
  }

  private formatMessages(messages: Message[]) {
    const formatted: any[] = [];
    
    for (const m of messages) {
      const role = this.mapRole(m.role);
      const parts: any[] = [];
      
      if (m.role === 'tool' && m.name) {
        // Tool Result
        let toolResponseContent = m.content;
        if (Array.isArray(m.content)) {
          toolResponseContent = m.content.find(c => c.type === 'text')?.text || JSON.stringify(m.content);
        } else if (typeof m.content === 'object' && m.content !== null) {
          toolResponseContent = JSON.stringify(m.content);
        }
        
        let parsedResult = {};
        try {
           parsedResult = typeof toolResponseContent === 'string' ? JSON.parse(toolResponseContent) : toolResponseContent;
        } catch(e) {
           parsedResult = { result: toolResponseContent };
        }

        parts.push({
          functionResponse: {
            name: m.name,
            response: { result: parsedResult }
          }
        });
      } else if (m.role === 'assistant' && m.tool_calls) {
        // Assistant requesting tool calls
        for (const tc of m.tool_calls) {
          parts.push((tc as any)._gemini_raw || {
            functionCall: {
              name: tc.name,
              args: tc.arguments
            }
          });
        }
        if (m.content) {
            parts.push({ text: m.content });
        }
      } else {
        // Normal text/image message
        if (Array.isArray(m.content)) {
          for (const part of m.content) {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image') {
               const mimeType = part.image.mimeType;
               let data = part.image.data;
               if (data.startsWith('data:')) {
                  data = data.split(',')[1];
               }
               parts.push({
                 inlineData: {
                   mimeType: mimeType,
                   data: data
                 }
               });
            }
          }
        } else if (m.content) {
          parts.push({ text: m.content });
        }
      }
      
      if (parts.length > 0) {
          // If the last message was also 'user', combine them because Gemini alternating roles requirement
          if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
              formatted[formatted.length - 1].parts.push(...parts);
          } else {
              formatted.push({ role, parts });
          }
      }
    }
    return formatted;
  }

  private formatTools(tools: ToolDefinition[]) {
    if (!tools || tools.length === 0) return undefined;
    
    const functionDeclarations = tools.map(t => {
       // Gemini requires parameters to be an object with type: "OBJECT"
       const params = t.parameters || { type: 'object', properties: {} };
       
       // Standardize parameter types to uppercase for Gemini
       const standardizeType = (obj: any): any => {
           if (!obj) return obj;
           const newObj = { ...obj };
           if (newObj.type && typeof newObj.type === 'string') {
               newObj.type = newObj.type.toUpperCase();
           }
           if (newObj.properties) {
               for (const key of Object.keys(newObj.properties)) {
                   newObj.properties[key] = standardizeType(newObj.properties[key]);
               }
           }
           if (newObj.items) {
               newObj.items = standardizeType(newObj.items);
           }
           return newObj;
       };

       const formattedParams = standardizeType(params);
       
       return {
          name: t.name,
          description: t.description,
          parameters: formattedParams
       };
    });

    return [{ functionDeclarations }];
  }

  async generateResponse(messages: Message[], tools?: ToolDefinition[], options?: import('../types').ModelGenerateOptions): Promise<Message> {
    console.log(`[PROVIDER] calling Gemini (${this.config.model})`);
    const url = `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    const signal = options?.signal;
    
    // Extract system instructions if any
    let systemInstruction;
    const sysMsgs = messages.filter(m => m.role === 'system');
    if (sysMsgs.length > 0) {
      systemInstruction = {
         parts: sysMsgs.map(m => ({ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
      };
    }

    const formattedMessages = this.formatMessages(messages.filter(m => m.role !== 'system'));
    const formattedTools = tools ? this.formatTools(tools) : undefined;

    const payload: any = {
      contents: formattedMessages
    };

    if (systemInstruction) payload.systemInstruction = systemInstruction;
    if (formattedTools) payload.tools = formattedTools;

    let response: any;
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      attempts++;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });

      if (response.status === 503 && attempts < maxAttempts) {
        console.warn(`[PROVIDER] Gemini 503 high demand, retrying attempt ${attempts}/${maxAttempts}...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      break;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API Error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      return { role: 'assistant', content: '' };
    }

    const parts = candidate.content.parts;
    // console.log("PARTS:", JSON.stringify(parts, null, 2));
    const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
    const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => {
      const tc = {
        id: Math.random().toString(36).substring(7),
        name: p.functionCall.name,
        arguments: p.functionCall.args || {}
      };
      // Keep the whole part so we can echo it exactly!
      (tc as any)._gemini_raw = p;
      return tc;
    });

    const result: Message = { role: 'assistant', content: textParts };
    if (functionCalls.length > 0) {
      result.tool_calls = functionCalls;
    }

    return result;
  }
}
