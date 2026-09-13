/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
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
