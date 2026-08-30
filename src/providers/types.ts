export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export type ImageContent = {
  mimeType: string;
  data: string; // Base64 encoded data or data URI
};

export type MessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image'; image: ImageContent };

export interface Message {
  role: Role;
  content: string | MessageContentPart[] | null;
  name?: string; // For tool results
  tool_call_id?: string; // For tool results
  tool_calls?: ToolCall[]; // For assistant tool calls
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any; // JSON schema for parameters
}

export interface ProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

export type StreamEvent = 
  | { type: 'text_delta'; content: string }
  | { type: 'done'; message: Message };

export type ReasoningMode = 'fast' | 'normal' | 'deep';

export interface ModelGenerateOptions {
  reasoningMode?: ReasoningMode;
  signal?: AbortSignal;
  modelOverride?: string;
}

export interface ModelCapabilities {
  vision: boolean;
}

export interface ModelProvider {
  name: string;
  capabilities: ModelCapabilities;
  initialize(config: ProviderConfig): void;
  checkConnection(): Promise<void>;
  generateResponse(messages: Message[], tools?: ToolDefinition[], options?: ModelGenerateOptions): Promise<Message>;
  generateResponseStream?(messages: Message[], tools?: ToolDefinition[], options?: ModelGenerateOptions): AsyncGenerator<StreamEvent, void, unknown>;
}
