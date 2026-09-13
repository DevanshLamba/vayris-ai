// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskService = void 0;
const storage_1 = require("./storage");
class TaskService {
    static async create(data) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const task = {
            ...data,
            id: 'task_' + Math.random().toString(36).substring(2, 9),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await db.run('INSERT INTO tasks (id, title, notes, status, priority, dueAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [task.id, task.title, task.notes, task.status, task.priority, task.dueAt, task.createdAt, task.updatedAt]);
        return task;
    }
    static async get(id) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const row = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
        return row;
    }
    static async list(filters) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        let query = 'SELECT * FROM tasks';
        const params = [];
        if (filters?.status) {
            query += ' WHERE status = ?';
            params.push(filters.status);
        }
        const rows = await db.all(query, params);
        // Sort logic: overdue -> due today -> high priority -> normal -> completed
        let tasks = rows;
        const now = new Date();
        tasks.sort((a, b) => {
            if (a.status !== b.status)
                return a.status === 'pending' ? -1 : 1;
            const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
            const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
            if (aDue !== bDue)
                return aDue - bDue;
            const pWeight = { high: 0, medium: 1, low: 2 };
            return pWeight[a.priority] - pWeight[b.priority];
        });
        if (filters?.isOverdue !== undefined) {
            tasks = tasks.filter(t => {
                if (t.status !== 'pending' || !t.dueAt)
                    return false;
                const due = new Date(t.dueAt);
                return (due < now) === filters.isOverdue;
            });
        }
        return tasks;
    }
    static async update(id, data) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const task = await this.get(id);
        if (!task)
            throw new Error('Task not found');
        const updated = { ...task, ...data, updatedAt: new Date().toISOString() };
        await db.run('UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, dueAt = ?, updatedAt = ? WHERE id = ?', [updated.title, updated.notes, updated.status, updated.priority, updated.dueAt, updated.updatedAt, id]);
        return updated;
    }
    static async complete(id) {
        return this.update(id, { status: 'completed' });
    }
    static async delete(id) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        await db.run('DELETE FROM tasks WHERE id = ?', [id]);
    }
    static async search(query) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const rows = await db.all('SELECT * FROM tasks WHERE title LIKE ? OR notes LIKE ?', [`%${query}%`, `%${query}%`]);
        return rows;
    }
}
exports.TaskService = TaskService;
