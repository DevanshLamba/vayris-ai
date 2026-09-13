// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmService = void 0;
const storage_1 = require("./storage");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function getBase64Command(title, message) {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$player = New-Object System.Media.SoundPlayer("C:\\Windows\\Media\\Alarm01.wav")
$player.PlayLooping()
[System.Windows.Forms.MessageBox]::Show("${message.replace(/"/g, '""')}", "${title.replace(/"/g, '""')}", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Exclamation)
$player.Stop()
    `;
    return Buffer.from(psScript, 'utf16le').toString('base64');
}
function getLocalISOString(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
class AlarmService {
    static async create(data) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const alarm = {
            ...data,
            id: 'alm_' + Math.random().toString(36).substring(2, 9),
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await db.run('INSERT INTO alarms (id, label, triggerAt, status, recurring, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [alarm.id, alarm.label, alarm.triggerAt, alarm.status, alarm.recurring, alarm.createdAt, alarm.updatedAt]);
        try {
            const b64 = getBase64Command('Alarm', alarm.label || 'Alarm');
            const localTimeStr = getLocalISOString(new Date(alarm.triggerAt));
            const psCmd = `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -EncodedCommand ${b64}'; $trigger = New-ScheduledTaskTrigger -Once -At '${localTimeStr}'; $settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable; Register-ScheduledTask -TaskName 'VayrisAlarm_${alarm.id}' -Action $action -Trigger $trigger -Settings $settings -Force`;
            await execAsync(`powershell -Command "${psCmd}"`);
        }
        catch (e) {
            console.error("[AlarmService] Failed to register Windows scheduled task:", e);
        }
        return alarm;
    }
    static async get(id) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        const row = await db.get('SELECT * FROM alarms WHERE id = ?', [id]);
        return row;
    }
    static async list(filters) {
        const db = storage_1.ProductivityStorage.getInstance().getDb();
        let query = 'SELECT * FROM alarms';
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
        await db.run('UPDATE alarms SET status = ?, updatedAt = ? WHERE id = ?', [status, new Date().toISOString(), id]);
    }
    static async cancel(id) {
        await this.updateStatus(id, 'cancelled');
        try {
            await execAsync(`powershell -Command "Unregister-ScheduledTask -TaskName 'VayrisAlarm_${id}' -Confirm:$false"`);
        }
        catch (e) {
            // Task might already be deleted or triggered, ignore.
        }
    }
}
exports.AlarmService = AlarmService;
