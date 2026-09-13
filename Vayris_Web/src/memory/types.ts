/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
export interface MemoryRecord {
  id: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface MemoryStore {
  save(content: string, category: string, metadata?: Record<string, any>): Promise<MemoryRecord>;
  get(id: string): Promise<MemoryRecord | null>;
  search(query: string, category?: string): Promise<MemoryRecord[]>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}
