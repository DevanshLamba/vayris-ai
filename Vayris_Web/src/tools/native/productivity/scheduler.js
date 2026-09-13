// @ts-nocheck
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductivityScheduler = void 0;
const reminders_1 = require("./reminders");
const alarms_1 = require("./alarms");
// using native OS notification via node-notifier if available, or just console and UI events.
// For Windows, powershell can be used to show a toast, but keeping it simple: just print to console which acts as local notification
// Wait, for Vayris, the prompt says "Use an appropriate local Windows notification mechanism already available or compatible with the existing application."
// We can use a simple PowerShell script for toast.
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ProductivityScheduler {
    static instance;
    timeoutId = null;
    isRunning = false;
    constructor() { }
    static getInstance() {
        if (!ProductivityScheduler.instance) {
            ProductivityScheduler.instance = new ProductivityScheduler();
        }
        return ProductivityScheduler.instance;
    }
    async start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        // 1. Recover missed
        await this.recoverMissed();
        // 2. Schedule next
        this.scheduleNext();
    }
    async recoverMissed() {
        const now = new Date().getTime();
        const reminders = await reminders_1.ReminderService.list({ status: 'scheduled' });
        for (const r of reminders) {
            if (new Date(r.remindAt).getTime() <= now - 60000) {
                await reminders_1.ReminderService.updateStatus(r.id, 'missed');
                console.log(`[Scheduler] Missed reminder recovered: ${r.title}`);
                this.showNotification("Missed Reminder", r.title);
            }
        }
        // Clean up old alarms from the DB without triggering a duplicate OS notification
        const alarms = await alarms_1.AlarmService.list({ status: 'scheduled' });
        for (const a of alarms) {
            if (new Date(a.triggerAt).getTime() <= now - 60000) {
                await alarms_1.AlarmService.updateStatus(a.id, 'triggered');
                console.log(`[Scheduler] Cleaned up past alarm: ${a.label || 'Alarm'}`);
            }
        }
    }
    async scheduleNext() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        const now = new Date().getTime();
        let nextTime = Infinity;
        const reminders = await reminders_1.ReminderService.list({ status: 'scheduled' });
        const alarms = await alarms_1.AlarmService.list({ status: 'scheduled' });
        for (const r of reminders) {
            const t = new Date(r.remindAt).getTime();
            if (t < nextTime)
                nextTime = t;
        }
        for (const a of alarms) {
            const t = new Date(a.triggerAt).getTime();
            if (t < nextTime)
                nextTime = t;
        }
        if (nextTime !== Infinity) {
            const delay = Math.max(0, nextTime - now);
            // Cap at 24 hours to prevent setTimeout overflow
            const cappedDelay = Math.min(delay, 86400000);
            this.timeoutId = setTimeout(() => this.triggerDueItems(), cappedDelay);
        }
    }
    async triggerDueItems() {
        const now = new Date().getTime();
        const reminders = await reminders_1.ReminderService.list({ status: 'scheduled' });
        for (const r of reminders) {
            if (new Date(r.remindAt).getTime() <= now + 1000) {
                await reminders_1.ReminderService.updateStatus(r.id, 'triggered');
                console.log(`[Scheduler] Triggering reminder: ${r.title}`);
                this.showNotification("Reminder", r.title);
            }
        }
        const alarms = await alarms_1.AlarmService.list({ status: 'scheduled' });
        for (const a of alarms) {
            if (new Date(a.triggerAt).getTime() <= now + 1000) {
                await alarms_1.AlarmService.updateStatus(a.id, 'triggered');
                console.log(`[Scheduler] Alarm time reached, updated DB status to triggered: ${a.label || 'Alarm'}`);
                // Notification is handled natively by Windows Task Scheduler
            }
        }
        this.scheduleNext();
    }
    async showNotification(title, message) {
        try {
            const psScript = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
      $xml = $template.GetXml()
      $xml = $xml.Replace("<text id=""1""></text>", "<text id=""1"">${title.replace(/"/g, '""')}</text>")
      $xml = $xml.Replace("<text id=""2""></text>", "<text id=""2"">${message.replace(/"/g, '""')}</text>")
      $template.LoadXml($xml)
      $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
      $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe")
      $notifier.Show($toast)
      `;
            const scriptPath = path.resolve(process.cwd(), 'scratch', `notify_${Date.now()}.ps1`);
            fs.writeFileSync(scriptPath, psScript);
            await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`);
            fs.unlinkSync(scriptPath);
        }
        catch (e) {
            console.error("[Scheduler] Failed to show Windows notification:", e);
        }
    }
}
exports.ProductivityScheduler = ProductivityScheduler;
