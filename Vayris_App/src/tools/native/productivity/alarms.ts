import { ProductivityStorage } from './storage';

export type AlarmStatus = "scheduled" | "triggered" | "cancelled" | "missed";

export interface Alarm {
  id: string;
  label?: string;
  triggerAt: string;
  status: AlarmStatus;
  recurring?: string;
  createdAt: string;
  updatedAt: string;
}

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function getBase64Command(title: string, message: string) {
    const psScript = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $xmlString = @"
<toast scenario="alarm"><visual><binding template="ToastGeneric"><text>${title.replace(/"/g, '""')}</text><text>${message.replace(/"/g, '""')}</text></binding></visual><audio src="ms-winsoundevent:Notification.Looping.Alarm" loop="true"/></toast>
"@
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $template.LoadXml($xmlString)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe")
    $notifier.Show($toast)
    `;
    return Buffer.from(psScript, 'utf16le').toString('base64');
}

function getLocalISOString(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export class AlarmService {
  static async create(data: Omit<Alarm, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Alarm> {
    const db = ProductivityStorage.getInstance().getDb();
    const alarm: Alarm = {
      ...data,
      id: 'alm_' + Math.random().toString(36).substring(2, 9),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await db.run(
      'INSERT INTO alarms (id, label, triggerAt, status, recurring, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [alarm.id, alarm.label, alarm.triggerAt, alarm.status, alarm.recurring, alarm.createdAt, alarm.updatedAt]
    );
    
    try {
        const b64 = getBase64Command('Alarm', alarm.label || 'Alarm');
        const localTimeStr = getLocalISOString(new Date(alarm.triggerAt));
        const psCmd = `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -EncodedCommand ${b64}'; $trigger = New-ScheduledTaskTrigger -Once -At '${localTimeStr}'; $settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable; Register-ScheduledTask -TaskName 'VayrisAlarm_${alarm.id}' -Action $action -Trigger $trigger -Settings $settings -Force`;
        await execAsync(`powershell -Command "${psCmd}"`);
    } catch (e) {
        console.error("[AlarmService] Failed to register Windows scheduled task:", e);
    }
    
    return alarm;
  }

  static async get(id: string): Promise<Alarm | null> {
    const db = ProductivityStorage.getInstance().getDb();
    const row = await db.get('SELECT * FROM alarms WHERE id = ?', [id]);
    return row as Alarm | null;
  }

  static async list(filters?: { status?: AlarmStatus }): Promise<Alarm[]> {
    const db = ProductivityStorage.getInstance().getDb();
    let query = 'SELECT * FROM alarms';
    const params: any[] = [];
    if (filters?.status) {
      query += ' WHERE status = ?';
      params.push(filters.status);
    }
    const rows = await db.all(query, params);
    return rows as Alarm[];
  }

  static async updateStatus(id: string, status: AlarmStatus): Promise<void> {
    const db = ProductivityStorage.getInstance().getDb();
    await db.run('UPDATE alarms SET status = ?, updatedAt = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  }

  static async cancel(id: string): Promise<void> {
    await this.updateStatus(id, 'cancelled');
    try {
        await execAsync(`powershell -Command "Unregister-ScheduledTask -TaskName 'VayrisAlarm_${id}' -Confirm:$false"`);
    } catch (e) {
        // Task might already be deleted or triggered, ignore.
    }
  }
}
