import { ProductivityStorage } from './storage';

export type TaskStatus = "pending" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class TaskService {
  static async create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const db = ProductivityStorage.getInstance().getDb();
    const task: Task = {
      ...data,
      id: 'task_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.run(
      'INSERT INTO tasks (id, title, notes, status, priority, dueAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [task.id, task.title, task.notes, task.status, task.priority, task.dueAt, task.createdAt, task.updatedAt]
    );
    return task;
  }

  static async get(id: string): Promise<Task | null> {
    const db = ProductivityStorage.getInstance().getDb();
    const row = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    return row as Task | null;
  }

  static async list(filters?: { status?: TaskStatus, isOverdue?: boolean }): Promise<Task[]> {
    const db = ProductivityStorage.getInstance().getDb();
    let query = 'SELECT * FROM tasks';
    const params: any[] = [];
    if (filters?.status) {
      query += ' WHERE status = ?';
      params.push(filters.status);
    }
    const rows = await db.all(query, params);
    
    // Sort logic: overdue -> due today -> high priority -> normal -> completed
    let tasks = rows as Task[];
    const now = new Date();
    tasks.sort((a, b) => {
       if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
       const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
       const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
       if (aDue !== bDue) return aDue - bDue;
       const pWeight = { high: 0, medium: 1, low: 2 };
       return pWeight[a.priority] - pWeight[b.priority];
    });
    
    if (filters?.isOverdue !== undefined) {
      tasks = tasks.filter(t => {
         if (t.status !== 'pending' || !t.dueAt) return false;
         const due = new Date(t.dueAt);
         return (due < now) === filters.isOverdue;
      });
    }
    
    return tasks;
  }

  static async update(id: string, data: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Task> {
    const db = ProductivityStorage.getInstance().getDb();
    const task = await this.get(id);
    if (!task) throw new Error('Task not found');
    
    const updated = { ...task, ...data, updatedAt: new Date().toISOString() };
    await db.run(
      'UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, dueAt = ?, updatedAt = ? WHERE id = ?',
      [updated.title, updated.notes, updated.status, updated.priority, updated.dueAt, updated.updatedAt, id]
    );
    return updated;
  }

  static async complete(id: string): Promise<Task> {
    return this.update(id, { status: 'completed' });
  }

  static async delete(id: string): Promise<void> {
    const db = ProductivityStorage.getInstance().getDb();
    await db.run('DELETE FROM tasks WHERE id = ?', [id]);
  }

  static async search(query: string): Promise<Task[]> {
    const db = ProductivityStorage.getInstance().getDb();
    const rows = await db.all('SELECT * FROM tasks WHERE title LIKE ? OR notes LIKE ?', [`%${query}%`, `%${query}%`]);
    return rows as Task[];
  }
}
