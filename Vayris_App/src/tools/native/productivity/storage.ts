import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

export class ProductivityStorage {
  private db: Database | null = null;
  private static instance: ProductivityStorage;

  private constructor() {}

  static getInstance(): ProductivityStorage {
    if (!ProductivityStorage.instance) {
      ProductivityStorage.instance = new ProductivityStorage();
    }
    return ProductivityStorage.instance;
  }

  async initialize(dbPath: string = path.resolve(process.cwd(), 'vayris_productivity.db')) {
    if (this.db) return;
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        dueAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        remindAt TEXT NOT NULL,
        status TEXT NOT NULL,
        taskId TEXT,
        recurring TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS alarms (
        id TEXT PRIMARY KEY,
        label TEXT,
        triggerAt TEXT NOT NULL,
        status TEXT NOT NULL,
        recurring TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
  }

  getDb(): Database {
    if (!this.db) throw new Error("ProductivityStorage not initialized");
    return this.db;
  }
}
