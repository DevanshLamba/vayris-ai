/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../types';
import { MemoryStore } from '../../memory/types';

export class SaveMemoryTool extends BaseTool {
  name = 'save_memory';
  description = 'Saves important information, user preferences, or facts to long-term memory.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The information to save.' },
      category: { type: 'string', description: 'Category of memory (e.g., "preference", "fact", "project").' }
    },
    required: ['content', 'category']
  };

  private store: MemoryStore;

  constructor(store: MemoryStore) {
    super();
    this.store = store;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const record = await this.store.save(args.content, args.category);
      return { success: true, data: { id: record.id, status: 'saved' } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class SearchMemoryTool extends BaseTool {
  name = 'search_memory';
  description = 'Searches long-term memory for previously saved information.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query.' },
      category: { type: 'string', description: 'Optional category to filter by.' }
    },
    required: ['query']
  };

  private store: MemoryStore;

  constructor(store: MemoryStore) {
    super();
    this.store = store;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const results = await this.store.search(args.query, args.category);
      return { success: true, data: { results: results.map(r => ({ id: r.id, content: r.content, category: r.category })) } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
