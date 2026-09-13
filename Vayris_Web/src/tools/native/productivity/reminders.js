// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReminderService = void 0;
const storage_1 = require("./storage");
class ReminderService {
    static async create(data) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const reminder = {
            ...data,
            id: 'rem_' + Math.random().toString(36).substring(2, 9),
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await db.run('INSERT INTO reminders (id, title, remindAt, status, taskId, recurring, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [reminder.id, reminder.title, reminder.remindAt, reminder.status, reminder.taskId, reminder.recurring, reminder.createdAt, reminder.updatedAt]);
        return reminder;
    }
    static async get(id) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const row = await db.get('SELECT * FROM reminders WHERE id = ?', [id]);
        return row;
    }
    static async list(filters) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        let query = 'SELECT * FROM reminders';
        const params = [];
        if (filters?.status) {
            query += ' WHERE status = ?';
            params.push(filters.status);
        }
        const rows = await db.all(query, params);
        return rows;
    }
    static async updateStatus(id, status) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        await db.run('UPDATE reminders SET status = ?, updatedAt = ? WHERE id = ?', [status, new Date().toISOString(), id]);
    }
    static async cancel(id) {
        await this.updateStatus(id, 'cancelled');
    }
    static async update(id, data) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const existing = await this.get(id);
        if (!existing)
            throw new Error("Reminder not found");
        const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
        await db.run('UPDATE reminders SET title = ?, remindAt = ?, status = ?, taskId = ?, recurring = ?, updatedAt = ? WHERE id = ?', [updated.title, updated.remindAt, updated.status, updated.taskId, updated.recurring, updated.updatedAt, id]);
        return updated;
    }
}
exports.ReminderService = ReminderService;
