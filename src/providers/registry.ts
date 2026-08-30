import { ModelProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, ModelProvider> = new Map();

  register(provider: ModelProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  getProvider(name: string): ModelProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Provider '${name}' not found in registry.`);
    }
    return provider;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Global registry instance
export const providerRegistry = new ProviderRegistry();
