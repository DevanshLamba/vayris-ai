import { ProviderRegistry } from '../src/providers/registry';
import { ModelProvider, ProviderConfig, Message, ToolDefinition } from '../src/providers/types';

class MockProvider implements ModelProvider {
  name = 'mock';
  capabilities = { vision: false, tools: true, streaming: false };
  async checkConnection(): Promise<void> { }
  initialize(config: ProviderConfig): void {}
  async generateResponse(messages: Message[], tools?: ToolDefinition[]): Promise<Message> {
    return { role: 'assistant', content: 'Mock response' };
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('should register and retrieve a provider', () => {
    registry.register(new MockProvider());
    const provider = registry.getProvider('mock');
    expect(provider).toBeDefined();
    expect(provider.name).toBe('mock');
  });

  it('should list registered providers', () => {
    registry.register(new MockProvider());
    expect(registry.listProviders()).toContain('mock');
  });

  it('should throw when getting an unknown provider', () => {
    expect(() => registry.getProvider('unknown')).toThrow();
  });
});
