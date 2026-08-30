import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import crypto from 'crypto';
import { MemoryRecord, MemoryStore } from './types';

export class SQLiteMemoryStore implements MemoryStore {
  private dbPath: string;
  private dbPromise: Promise<Database>;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.dbPromise = this.init();
  }

  private async init(): Promise<Database> {
    const db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // Simple FTS if needed, or just basic LIKE search. We will use LIKE for simplicity.
    return db;
  }

  async save(content: string, category: string, metadata?: Record<string, any>): Promise<MemoryRecord> {
    const db = await this.dbPromise;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await db.run(
      'INSERT INTO memories (id, content, category, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, content, category, metadata ? JSON.stringify(metadata) : null, now, now]
    );

    return {
      id,
      content,
      category,
      metadata,
      createdAt: now,
      updatedAt: now
    };
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const db = await this.dbPromise;
    const row = await db.get('SELECT * FROM memories WHERE id = ?', [id]);
    if (!row) return null;
    
    return {
      id: row.id,
      content: row.content,
      category: row.category,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  async search(query: string, category?: string): Promise<MemoryRecord[]> {
    const db = await this.dbPromise;
    let sql = 'SELECT * FROM memories WHERE content LIKE ?';
    const params = [`%${query}%`];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY createdAt DESC LIMIT 50'; // Simple limit

    const rows = await db.all(sql, params);
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      category: row.category,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  async delete(id: string): Promise<boolean> {
    const db = await this.dbPromise;
    const result = await db.run('DELETE FROM memories WHERE id = ?', [id]);
    return (result.changes ?? 0) > 0;
  }

  async clear(): Promise<void> {
    const db = await this.dbPromise;
    await db.run('DELETE FROM memories');
  }

  async close(): Promise<void> {
    const db = await this.dbPromise;
    await db.close();
  }
}
