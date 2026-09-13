import { ProductivityStorage } from './storage';

export type ReminderStatus = "scheduled" | "triggered" | "cancelled" | "missed";

export interface Reminder {
  id: string;
  title: string;
  remindAt: string;
  status: ReminderStatus;
  taskId?: string;
  recurring?: string;
  createdAt: string;
  updatedAt: string;
}

export class ReminderService {
  static async create(data: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Reminder> {
    const db = ProductivityStorage.getInstance().getDb();
    const reminder: Reminder = {
      ...data,
      id: 'rem_' + Math.random().toString(36).substring(2, 9),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.run(
      'INSERT INTO reminders (id, title, remindAt, status, taskId, recurring, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [reminder.id, reminder.title, reminder.remindAt, reminder.status, reminder.taskId, reminder.recurring, reminder.createdAt, reminder.updatedAt]
    );
    return reminder;
  }

  static async get(id: string): Promise<Reminder | null> {
    const db = ProductivityStorage.getInstance().getDb();
    const row = await db.get('SELECT * FROM reminders WHERE id = ?', [id]);
    return row as Reminder | null;
  }

  static async list(filters?: { status?: ReminderStatus }): Promise<Reminder[]> {
    const db = ProductivityStorage.getInstance().getDb();
    let query = 'SELECT * FROM reminders';
    const params: any[] = [];
    if (filters?.status) {
      query += ' WHERE status = ?';
      params.push(filters.status);
    }
    const rows = await db.all(query, params);
    return rows as Reminder[];
  }

  static async updateStatus(id: string, status: ReminderStatus): Promise<void> {
    const db = ProductivityStorage.getInstance().getDb();
    await db.run('UPDATE reminders SET status = ?, updatedAt = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  }

  static async cancel(id: string): Promise<void> {
    await this.updateStatus(id, 'cancelled');
  }

  static async update(id: string, data: Partial<Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Reminder> {
    const db = ProductivityStorage.getInstance().getDb();
    const existing = await this.get(id);
    if (!existing) throw new Error("Reminder not found");

    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await db.run(
      'UPDATE reminders SET title = ?, remindAt = ?, status = ?, taskId = ?, recurring = ?, updatedAt = ? WHERE id = ?',
      [updated.title, updated.remindAt, updated.status, updated.taskId, updated.recurring, updated.updatedAt, id]
    );
    return updated;
  }
}
