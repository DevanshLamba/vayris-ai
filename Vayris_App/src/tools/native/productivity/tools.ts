import { BaseTool, ToolResult, PermissionLevel } from '../../types';
import { TaskService } from './tasks';
import { ReminderService } from './reminders';
import { AlarmService } from './alarms';

export class TasksListTool extends BaseTool {
  name = 'tasks_list';
  description = 'List all tasks. Returns structured task data.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status: pending or completed' }
    }
  };

  async execute(args: any): Promise<ToolResult> {
    const requestedStatus = args.status || 'pending';
    const tasks = await TaskService.list({ status: requestedStatus });
    if (tasks.length === 0) return { success: true, data: tasks, uiContent: "You're all clear, Boss. No pending tasks.", spokenContent: "You're all clear, Boss. No pending tasks." };
    
    let html = `<div class="mb-3 text-white/90 font-light">Here are the ${requestedStatus} tasks, Boss.</div><div class="flex flex-col gap-3">`;
    tasks.forEach((t, index) => {
      const isCompleted = t.status === 'completed';
      const isOverdue = t.dueAt && t.status === 'pending' && new Date(t.dueAt) < new Date();
      const pColor = t.priority === 'high' ? 'text-rose-400' : (t.priority === 'medium' ? 'text-amber-400' : 'text-blue-400');
      const visualNum = index + 1;
      
      html += `
        <div class="glass-strong rounded-xl p-4 border ${isCompleted ? 'border-white/5 opacity-60' : (isOverdue ? 'border-rose-500/30' : 'border-white/10')} flex justify-between items-start group">
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <span class="text-[9px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/60">#${visualNum}</span>
              <span class="${isCompleted ? 'line-through text-white/50' : 'text-white/90'} font-medium text-sm">${t.title}</span>
            </div>
            ${t.notes ? `<span class="text-white/40 text-[11px] mt-1 ml-7">${t.notes}</span>` : ''}
            <div class="flex gap-2 mt-2 ml-7 text-[10px] uppercase tracking-wider font-mono">
               <span class="${pColor}">${t.priority}</span>
               ${t.dueAt ? `<span class="${isOverdue ? 'text-rose-400' : 'text-indigo-300'}">Due: ${new Date(t.dueAt).toLocaleString()}</span>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-[10px] font-mono uppercase tracking-widest ${isCompleted ? 'text-emerald-400' : 'text-white/30'}">${t.status}</span>
            ${!isCompleted ? `<button onclick="window.dispatchEvent(new CustomEvent('VAYRIS_COMMAND', { detail: { command: 'mark task ${t.id} complete' } }))" class="px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-md text-[9px] uppercase font-mono tracking-widest text-emerald-300 transition-colors pointer-events-auto cursor-pointer">Complete</button>` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
    return { success: true, data: tasks, uiContent: html, spokenContent: `Here are the ${requestedStatus} tasks, Boss.` };
  }
}

export class TasksCreateTool extends BaseTool {
  name = 'tasks_create';
  description = 'Create a new task.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      notes: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      dueAt: { type: 'string', description: 'ISO date string or natural language parsed string' }
    },
    required: ['title']
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      const dueAtDate = args.dueAt ? require('chrono-node').parseDate(args.dueAt) : null;
      const task = await TaskService.create({
        title: args.title,
        notes: args.notes,
        priority: args.priority || 'medium',
        status: 'pending',
        dueAt: dueAtDate ? dueAtDate.toISOString() : undefined
      });
      const tasksTool = new TasksListTool();
      const ui = await tasksTool.execute({ status: 'pending' });
      const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — task added.</div>` + ui.uiContent;
      return { success: true, data: task, uiContent: finalUi, spokenContent: "Done, Boss — task added." };
    } catch (e: any) {
      return { success: false, error: `Failed to create task: ${e.message}`, spokenContent: "I couldn't create the task." };
    }
  }
}

export class TasksCompleteTool extends BaseTool {
  name = 'tasks_complete';
  description = 'Mark a task as completed using its ID.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id']
  };

  async execute(args: any): Promise<ToolResult> {
    let targetId = args.id;
    if (/^\d+$/.test(targetId)) {
       const index = parseInt(targetId, 10) - 1;
       const tasks = await TaskService.list({ status: 'pending' });
       if (tasks[index]) targetId = tasks[index].id;
       else return { success: false, uiContent: `<div class="text-rose-400">Task #${targetId} not found in pending list.</div>`, spokenContent: `Task ${targetId} not found.` };
    }
    const task = await TaskService.complete(targetId);
    const tasksTool = new TasksListTool();
    const ui = await tasksTool.execute({ status: 'pending' });
    const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss.</div>` + ui.uiContent;
    return { success: true, data: task, uiContent: finalUi, spokenContent: "Done, Boss." };
  }
}

export class TasksUpdateTool extends BaseTool {
  name = 'tasks_update';
  description = 'Update an existing task (e.g. priority, due date, title, notes, status).';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      notes: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      dueAt: { type: 'string', description: 'ISO date string or natural language' },
      status: { type: 'string', enum: ['pending', 'completed'] }
    },
    required: ['id']
  };

  async execute(args: any): Promise<ToolResult> {
    let targetId = args.id;
    if (/^\d+$/.test(targetId)) {
       const index = parseInt(targetId, 10) - 1;
       const tasks = await TaskService.list({ status: 'pending' });
       if (tasks[index]) targetId = tasks[index].id;
       else return { success: false, uiContent: `<div class="text-rose-400">Task #${targetId} not found in pending list.</div>`, spokenContent: `Task ${targetId} not found.` };
    }
    
    const updateData: any = {};
    if (args.title) updateData.title = args.title;
    if (args.notes !== undefined) updateData.notes = args.notes;
    if (args.priority) updateData.priority = args.priority;
    if (args.status) updateData.status = args.status;
    if (args.dueAt) {
       const d = require('chrono-node').parseDate(args.dueAt);
       if (d) updateData.dueAt = d.toISOString();
    }
    
    const task = await TaskService.update(targetId, updateData);
    const tasksTool = new TasksListTool();
    const ui = await tasksTool.execute({ status: 'pending' });
    const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — task updated.</div>` + ui.uiContent;
    return { success: true, data: task, uiContent: finalUi, spokenContent: 'Done, Boss — task updated.' };
  }
}

export class TasksDeleteTool extends BaseTool {
  name = 'tasks_delete';
  description = 'Delete a task by ID.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id']
  };

  async execute(args: any): Promise<ToolResult> {
    let targetId = args.id;
    if (/^\d+$/.test(targetId)) {
       const index = parseInt(targetId, 10) - 1;
       const tasks = await TaskService.list({ status: 'pending' });
       if (tasks[index]) targetId = tasks[index].id;
       else return { success: false, uiContent: `<div class="text-rose-400">Task #${targetId} not found in pending list.</div>`, spokenContent: `Task ${targetId} not found.` };
    }
    await TaskService.delete(targetId);
    const tasksTool = new TasksListTool();
    const ui = await tasksTool.execute({ status: 'pending' });
    const finalUi = `<div class="mb-3 text-white/90 font-light">Deleted.</div>` + ui.uiContent;
    return { success: true, data: "Task deleted.", uiContent: finalUi, spokenContent: "Task deleted." };
  }
}

export class TasksCountTool extends BaseTool {
  name = 'tasks_count';
  description = 'Count tasks.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {} };

  async execute(args: any): Promise<ToolResult> {
    const tasks = await TaskService.list();
    const pending = tasks.filter(t => t.status === 'pending').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    return { success: true, data: { total: tasks.length, pending, completed } };
  }
}

export class RemindersListTool extends BaseTool {
  name = 'reminders_list';
  description = 'List all reminders.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {} };

  async execute(args: any): Promise<ToolResult> {
    const items = await ReminderService.list();
    if (items.length === 0) return { success: true, data: items, uiContent: "You have no reminders." };
    
    let html = '<div class="flex flex-col gap-3 mt-2"><div class="text-[10px] font-mono tracking-widest text-indigo-400 uppercase">Reminders</div>';
    for (const r of items) {
      html += `
        <div class="glass-strong rounded-xl p-3 border border-white/10 flex justify-between items-center">
          <span class="text-white/90 text-sm">${r.title}</span>
          <div class="flex gap-4 items-center">
            <span class="text-indigo-300 text-[11px]">${new Date(r.remindAt).toLocaleString()}</span>
            <span class="text-[9px] uppercase tracking-widest text-white/50">${r.status}</span>
          </div>
        </div>
      `;
    }
    html += '</div>';
    return { success: true, data: items, uiContent: html };
  }
}

export class RemindersCreateTool extends BaseTool {
  name = 'reminders_create';
  description = 'Create a reminder.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      remindAt: { type: 'string' },
      taskId: { type: 'string' }
    }
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      if (!args.title && !args.remindAt) {
          const uiContent = `<div class="text-white/90 font-light">What should I remind you about, and when, Boss?</div>`;
          return { success: false, uiContent, spokenContent: "What should I remind you about, and when, Boss?", metadata: { missingFields: true, question: "What should I remind you about, and when, Boss?", intent: 'reminders_create', originalArgs: args } };
      }
      if (!args.remindAt) {
          const uiContent = `<div class="text-white/90 font-light">When should I remind you, Boss?</div>`;
          return { success: false, uiContent, spokenContent: "When should I remind you, Boss?", metadata: { missingFields: true, question: "When should I remind you, Boss?", intent: 'reminders_create', originalArgs: args } };
      }
      if (!args.title) {
          args.title = "Reminder"; // Default title instead of blocking, or we could ask
      }

      const { parseAdvancedTime } = require('./timeParser');
      const parsed = parseAdvancedTime(args.remindAt);
      if (!parsed) {
         const uiContent = `<div class="text-white/90 font-light">I couldn't understand the time. What time exactly, Boss?</div>`;
         return { success: false, uiContent, spokenContent: "What time exactly, Boss?", metadata: { missingFields: true, question: "What time exactly, Boss?", intent: 'reminders_create', originalArgs: args } };
      }
      
      if (!parsed.hasTime) {
         // E.g. "What time on Friday, Boss?" or "What time tomorrow, Boss?"
         const uiContent = `<div class="text-white/90 font-light">What time, Boss?</div>`;
         return { success: false, uiContent, spokenContent: "What time, Boss?", metadata: { missingFields: true, question: "What time, Boss?", intent: 'reminders_create', originalArgs: args } };
      }
      
      const remindAtDate = parsed.date;
      
      // Allow a tiny grace period of 1 minute in case the user says "at 5:00" and it is 5:00:30 right now.
      if (remindAtDate.getTime() < Date.now() - 60000) {
         return { success: false, uiContent: `<div class="text-rose-400 font-light">That time is in the past!</div>`, spokenContent: "That time is in the past!" };
      }
      
      // Ensure we don't schedule something slightly in the past (like 30 seconds ago) which would trigger instantly, 
      // instead of storing it as a future reminder. But actually, triggering instantly is fine.
      
      const r = await ReminderService.create({
        title: args.title,
        remindAt: remindAtDate.toISOString(),
        taskId: args.taskId
      });
      require('./scheduler').ProductivityScheduler.getInstance().scheduleNext();
      
      const listTool = new RemindersListTool();
      const ui = await listTool.execute({ status: 'scheduled' });
      const timeStr = remindAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — I'll remind you at ${timeStr}.</div>` + ui.uiContent;
      
      return { success: true, data: r, uiContent: finalUi, spokenContent: `Done, Boss — I'll remind you at ${timeStr}.` };
    } catch (e: any) {
      return { success: false, error: `Failed to create reminder: ${e.message}` };
    }
  }
}

export class AlarmsListTool extends BaseTool {
  name = 'alarms_list';
  description = 'List all alarms.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {} };

  async execute(args: any): Promise<ToolResult> {
    const items = await AlarmService.list();
    if (items.length === 0) return { success: true, data: items, uiContent: "You have no alarms." };
    
    let html = '<div class="flex flex-col gap-3 mt-2"><div class="text-[10px] font-mono tracking-widest text-rose-400 uppercase">Alarms</div>';
    for (const a of items) {
      html += `
        <div class="glass-strong rounded-xl p-3 border border-rose-500/20 flex justify-between items-center">
          <span class="text-white/90 text-sm">${a.label || 'Alarm'}</span>
          <div class="flex gap-4 items-center">
            <span class="text-rose-300 text-[11px]">${new Date(a.triggerAt).toLocaleString()}</span>
            <span class="text-[9px] uppercase tracking-widest text-white/50">${a.status}</span>
          </div>
        </div>
      `;
    }
    html += '</div>';
    return { success: true, data: items, uiContent: html };
  }
}

export class AlarmsCreateTool extends BaseTool {
  name = 'alarms_create';
  description = 'Set an alarm.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      label: { type: 'string' },
      triggerAt: { type: 'string', description: 'E.g., "9:00 AM", "in 5 minutes", "tomorrow at 8pm"' }
    }
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      if (!args.triggerAt) {
          const uiContent = `<div class="text-white/90 font-light">What time should I set the alarm for, Boss?</div>`;
          return { success: false, uiContent, spokenContent: "What time should I set the alarm for, Boss?", metadata: { missingFields: true, question: "What time should I set the alarm for, Boss?", intent: 'alarms_create', originalArgs: args } };
      }

      const { parseAdvancedTime } = require('./timeParser');
      const parsed = parseAdvancedTime(args.triggerAt);
      if (!parsed) {
         const uiContent = `<div class="text-white/90 font-light">I couldn't understand that alarm time, Boss. What time should I use?</div>`;
         return { success: false, uiContent, spokenContent: "I couldn't understand that alarm time, Boss. What time should I use?", metadata: { missingFields: true, question: "I couldn't understand that alarm time, Boss. What time should I use?", intent: 'alarms_create', originalArgs: args } };
      }
      
      if (!parsed.hasTime) {
         const uiContent = `<div class="text-white/90 font-light">What time should I set the alarm for, Boss?</div>`;
         return { success: false, uiContent, spokenContent: "What time should I set the alarm for, Boss?", metadata: { missingFields: true, question: "What time should I set the alarm for, Boss?", intent: 'alarms_create', originalArgs: args } };
      }
      
      const triggerAtDate = parsed.date;
      
      if (triggerAtDate.getTime() < Date.now() - 60000) {
         return { success: false, uiContent: `<div class="text-rose-400 font-light">That time is in the past!</div>`, spokenContent: "That time is in the past!" };
      }

      const a = await AlarmService.create({
        label: args.label || 'Alarm',
        triggerAt: triggerAtDate.toISOString()
      });
      require('./scheduler').ProductivityScheduler.getInstance().scheduleNext();
      
      const listTool = new AlarmsListTool();
      const ui = await listTool.execute({});
      
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      let datePrefix = "";
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (triggerAtDate.getDate() === tomorrow.getDate() && triggerAtDate.getMonth() === tomorrow.getMonth() && triggerAtDate.getFullYear() === tomorrow.getFullYear()) {
        datePrefix = "tomorrow at ";
      }
      
      const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — alarm set for ${datePrefix}${timeFormatter.format(triggerAtDate)}.</div>` + ui.uiContent;
      
      return { success: true, data: a, uiContent: finalUi, spokenContent: `Done, Boss — alarm set for ${datePrefix}${timeFormatter.format(triggerAtDate)}.` };
    } catch (e: any) {
      return { success: false, error: `Failed to create alarm: ${e.message}`, spokenContent: "I couldn't set the alarm, Boss." };
    }
  }
}

export class AlarmsCancelTool extends BaseTool {
  name = 'alarms_cancel';
  description = 'Cancel an alarm by ID.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: { id: { type: 'string' } }
  };

  async execute(args: any): Promise<ToolResult> {
    let targetId = args.id;
    const alarms = await AlarmService.list({ status: 'scheduled' });
    
    if (targetId && /^\d+$/.test(targetId)) {
       const index = parseInt(targetId, 10) - 1;
       if (alarms[index]) targetId = alarms[index].id;
       else return { success: false, uiContent: `<div class="text-rose-400">Alarm #${targetId} not found.</div>`, spokenContent: `Alarm ${targetId} not found.` };
    }
    
    if (!targetId) {
       if (alarms.length === 1) {
         targetId = alarms[0].id;
       } else if (alarms.length === 0) {
         return { success: false, uiContent: `<div class="text-white/90">You don't have any scheduled alarms.</div>`, spokenContent: "You don't have any scheduled alarms." };
       } else {
         const listTool = new AlarmsListTool();
         const ui = await listTool.execute({});
         return { success: false, uiContent: `<div class="text-white/90">Which alarm do you want to cancel, Boss?</div>` + ui.uiContent, spokenContent: "Which alarm do you want to cancel, Boss?" };
       }
    }

    await AlarmService.cancel(targetId);
    require('./scheduler').ProductivityScheduler.getInstance().scheduleNext();
    
    const rt = new AlarmsListTool();
    const ui = await rt.execute({});
    const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — alarm cancelled.</div>` + ui.uiContent;
    
    return { success: true, uiContent: finalUi, spokenContent: "Done, Boss — alarm cancelled." };
  }
}

export class RemindersCancelTool extends BaseTool {
  name = 'reminders_cancel';
  description = 'Cancel a reminder by ID or title substring.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: { 
      id: { type: 'string' },
      title: { type: 'string' }
    }
  };

  async execute(args: any): Promise<ToolResult> {
    let targetId = args.id;
    const reminders = await ReminderService.list({ status: 'scheduled' });
    
    if (targetId && /^\d+$/.test(targetId)) {
       const index = parseInt(targetId, 10) - 1;
       if (reminders[index]) targetId = reminders[index].id;
       else return { success: false, uiContent: `<div class="text-rose-400">Reminder #${targetId} not found in scheduled list.</div>`, spokenContent: `Reminder ${targetId} not found.` };
    } else if (args.title && !targetId) {
       const match = reminders.find(r => r.title.toLowerCase().includes(args.title.toLowerCase()));
       if (match) targetId = match.id;
       else return { success: false, uiContent: `<div class="text-rose-400">Reminder matching "${args.title}" not found.</div>`, spokenContent: `I couldn't find a reminder matching ${args.title}.` };
    }
    
    if (!targetId) return { success: false, uiContent: `<div class="text-rose-400">Please provide a reminder ID or title to cancel.</div>`, spokenContent: "Please provide a reminder ID." };
    
    await ReminderService.cancel(targetId);
    require('./scheduler').ProductivityScheduler.getInstance().scheduleNext();
    
    const rt = new RemindersListTool();
    const ui = await rt.execute({ status: 'scheduled' });
    const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — reminder cancelled.</div>` + ui.uiContent;
    
    return { success: true, uiContent: finalUi, spokenContent: "Done, Boss — reminder cancelled." };
  }
}

export class RemindersUpdateTool extends BaseTool {
  name = 'reminders_update';
  description = 'Update a reminder (e.g., reschedule).';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      searchTitle: { type: 'string', description: 'Title to search for if ID is not known' },
      title: { type: 'string' },
      remindAt: { type: 'string' }
    }
  };

  async execute(args: any): Promise<ToolResult> {
    let targetId = args.id;
    const reminders = await ReminderService.list({ status: 'scheduled' });
    
    if (targetId && /^\d+$/.test(targetId)) {
       const index = parseInt(targetId, 10) - 1;
       if (reminders[index]) targetId = reminders[index].id;
       else return { success: false, uiContent: `<div class="text-rose-400">Reminder #${targetId} not found in scheduled list.</div>`, spokenContent: `Reminder ${targetId} not found.` };
    } else if (args.searchTitle && !targetId) {
       const match = reminders.find(r => r.title.toLowerCase().includes(args.searchTitle.toLowerCase()));
       if (match) targetId = match.id;
       else return { success: false, uiContent: `<div class="text-rose-400">Reminder matching "${args.searchTitle}" not found.</div>`, spokenContent: `I couldn't find a reminder matching ${args.searchTitle}.` };
    }
    
    if (!targetId) return { success: false, uiContent: `<div class="text-rose-400">Please provide a reminder ID or searchTitle to update.</div>`, spokenContent: "Please provide a reminder ID." };
    
    const updateData: any = {};
    if (args.title) updateData.title = args.title;
    if (args.remindAt) {
       const { parseAdvancedTime } = require('./timeParser');
       const parsed = parseAdvancedTime(args.remindAt);
       if (!parsed) return { success: false, uiContent: `<div class="text-white/90 font-light">I couldn't understand the new time.</div>`, spokenContent: "I couldn't understand the time." };
       if (!parsed.hasTime) return { success: false, uiContent: `<div class="text-white/90 font-light">What time, Boss?</div>`, spokenContent: "What time, Boss?" };
       const d = parsed.date;
       if (d.getTime() < Date.now() - 60000) return { success: false, uiContent: `<div class="text-rose-400 font-light">That time is in the past!</div>`, spokenContent: "That time is in the past!" };
       updateData.remindAt = d.toISOString();
    }
    
    await ReminderService.update(targetId, updateData);
    require('./scheduler').ProductivityScheduler.getInstance().scheduleNext();
    
    const rt = new RemindersListTool();
    const ui = await rt.execute({ status: 'scheduled' });
    const finalUi = `<div class="mb-3 text-white/90 font-light">Done, Boss — reminder updated.</div>` + ui.uiContent;
    
    return { success: true, uiContent: finalUi, spokenContent: "Done, Boss — reminder updated." };
  }
}

export class EmailDraftTool extends BaseTool {
  name = 'email_draft';
  description = 'Generate an email draft to display to the user in chat. IT WILL NOT SEND THE EMAIL.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' }
    },
    required: ['subject', 'body']
  };

  async execute(args: any): Promise<ToolResult> {
    const draft = `
<div class="glass-strong rounded-xl p-4 mt-2 mb-2 border border-white/10">
  <div class="text-[10px] text-purple-400 font-mono tracking-widest uppercase mb-3 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>Email Draft (Local, Not Sent)</div>
  <div class="mb-1"><span class="text-white/40 text-sm">To:</span> <span class="text-white/90 text-sm">${args.to || ''}</span></div>
  <div class="mb-4"><span class="text-white/40 text-sm">Subject:</span> <span class="text-white/90 text-sm font-medium">${args.subject}</span></div>
  <div class="text-white/80 text-[15px] whitespace-pre-wrap">${args.body}</div>
</div>
    `;
    return { success: true, data: { draft_ready: true }, uiContent: draft };
  }
}

export const productivityTools = [
  new TasksListTool(),
  new TasksCreateTool(),
  new TasksCompleteTool(),
  new TasksUpdateTool(),
  new TasksDeleteTool(),
  new TasksCountTool(),
  new RemindersListTool(),
  new RemindersCreateTool(),
  new RemindersUpdateTool(),
  new RemindersCancelTool(),
  new AlarmsListTool(),
  new AlarmsCreateTool(),
  new AlarmsCancelTool(),
  new EmailDraftTool()
];
