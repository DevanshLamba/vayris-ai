import { PermissionManager, PermissionRequest, PermissionResponse } from './permissions';
import { PermissionLevel } from '../tools/types';
import { auditLogger } from './audit_logger';

type RiskLevel = 'SAFE' | 'LOW_RISK' | 'CONFIRMATION_REQUIRED' | 'HIGH_RISK' | 'BLOCKED';

interface PendingConfirmation {
  id: string;
  tool: string;
  argsHash: string;
  expiresAt: number;
}

const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  // SAFE
  'system_time': 'SAFE',
  'system_info': 'SAFE',
  'search_memory': 'SAFE',
  'tasks_list': 'SAFE',
  'tasks_count': 'SAFE',
  'reminders_list': 'SAFE',
  'alarms_list': 'SAFE',
  'rag_search': 'SAFE',
  'list_directory': 'SAFE',
  'read_file': 'SAFE',
  'search_files': 'SAFE',
  'project_info': 'SAFE',
  'git_status': 'SAFE',
  
  // LOW RISK
  'tasks_create': 'LOW_RISK',
  'tasks_complete': 'LOW_RISK',
  'tasks_update': 'LOW_RISK',
  'reminders_create': 'LOW_RISK',
  'reminders_update': 'LOW_RISK',
  'alarms_create': 'LOW_RISK',
  'save_memory': 'LOW_RISK',
  'rag_ingest': 'LOW_RISK',
  'propose_plan': 'LOW_RISK',
  'complete_task': 'LOW_RISK',
  'fail_task': 'LOW_RISK',

  // CONFIRMATION REQUIRED
  'tasks_delete': 'CONFIRMATION_REQUIRED',
  'reminders_cancel': 'CONFIRMATION_REQUIRED',
  'alarms_cancel': 'CONFIRMATION_REQUIRED',
  'email_draft': 'CONFIRMATION_REQUIRED',
  'open_application': 'CONFIRMATION_REQUIRED',
  'write_file': 'HIGH_RISK', // File write might be destructive
  'delete_file': 'HIGH_RISK', // Destructive
  'run_tests': 'CONFIRMATION_REQUIRED',
  'run_build': 'HIGH_RISK',
  'git_diff': 'CONFIRMATION_REQUIRED',
  'capture_screen': 'CONFIRMATION_REQUIRED',
  'analyze_image': 'CONFIRMATION_REQUIRED',
  'browser_open': 'CONFIRMATION_REQUIRED',
  'browser_read_page': 'CONFIRMATION_REQUIRED',
  'browser_find': 'CONFIRMATION_REQUIRED',
  'browser_click': 'CONFIRMATION_REQUIRED',
  'browser_type': 'CONFIRMATION_REQUIRED',
  'browser_screenshot': 'CONFIRMATION_REQUIRED',
  'browser_go_back': 'CONFIRMATION_REQUIRED',
  'browser_close': 'CONFIRMATION_REQUIRED',
};

export class GuardrailsPermissionManager implements PermissionManager {
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();

  constructor(private delegate: PermissionManager) {}

  private hashArgs(args: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(args || {})).digest('hex');
  }

  async checkPermission(request: PermissionRequest): Promise<PermissionResponse> {
    let decision = 'DENY';
    let allowed = false;
    let toolName = request.tool?.name || 'unknown';
    let reason = '';
    
    try {
      const response = await this._evaluatePermission(request);
      
      if (response.allowed) {
        decision = 'ALLOW';
        allowed = true;
      } else if (response.data?.action === 'CONFIRM') {
        decision = 'CONFIRM';
        allowed = false;
        reason = response.data.message;
      } else {
        decision = 'DENY';
        allowed = false;
        reason = response.data?.error || 'Unknown error';
      }
      return response;
    } catch (e: any) {
      reason = 'Guardrail exception: ' + e.message;
      return { allowed: false, data: { error: reason } };
    } finally {
      // Clean up expired confirmations
      const now = Date.now();
      for (const [key, conf] of this.pendingConfirmations.entries()) {
        if (now > conf.expiresAt) {
          this.pendingConfirmations.delete(key);
        }
      }

      auditLogger.log({
        timestamp: Date.now(),
        mode: request.context.injectedData?.mode || 'AUTO',
        tool: toolName,
        operation: 'execute',
        decision: decision,
        success: allowed
      });
    }
  }

  private isConfirmationResponse(input?: string): boolean {
    if (!input) return false;
    const clean = input.toLowerCase().replace(/[.,!?]/g, '').trim();
    return /^(yes|confirm|do it|yes please|y|yeah|yep|sure|ok|okay)$/.test(clean);
  }

  private async _evaluatePermission(request: PermissionRequest): Promise<PermissionResponse> {
    const toolName = request.tool.name;
    const args = request.args || {};
    const riskLevel = TOOL_RISK_MAP[toolName] || 'BLOCKED';

    if (riskLevel === 'BLOCKED') {
      return { allowed: false, data: { error: `Tool ${toolName} is not recognized or is blocked by Guardrails.` } };
    }

    // 1. Path Security & File Operation Validation
    for (const key of Object.keys(args)) {
      const val = args[key];
      if (typeof val === 'string') {
        if (val.includes('../') || val.includes('..\\')) {
          return { allowed: false, data: { error: 'Path traversal is forbidden by Guardrails.' } };
        }
      }
    }

    // 2. Arbitrary Command Execution Check
    const argsString = JSON.stringify(args).toLowerCase();
    if (argsString.includes('powershell') || argsString.includes('cmd.exe') || 
        argsString.includes('/bin/sh') || argsString.includes('/bin/bash') ||
        argsString.includes('cmd /c')) {
      return { allowed: false, data: { error: 'Arbitrary shell execution is forbidden by Guardrails.' } };
    }

    // 3. Confirmation System
    if (riskLevel === 'CONFIRMATION_REQUIRED' || riskLevel === 'HIGH_RISK') {
      const argsHash = this.hashArgs(args);
      const confKey = `${toolName}:${argsHash}`;
      
      const existingConf = this.pendingConfirmations.get(confKey);
      
      if (existingConf && existingConf.expiresAt > Date.now()) {
        // We have asked for confirmation. Check if the user confirmed.
        const latestGoal = request.context.latestGoal;
        if (this.isConfirmationResponse(latestGoal)) {
          // Confirmed! Delete the token so it can't be reused, and allow execution.
          this.pendingConfirmations.delete(confKey);
          return { allowed: true };
        } else {
          // User said something else, or did not explicitly confirm.
          this.pendingConfirmations.delete(confKey);
          return { allowed: false, data: { error: 'Operation was not explicitly confirmed. Please specify a new action.' } };
        }
      }

      // No pending confirmation exists. We need to create one and ask the user.
      const expiresAt = Date.now() + 60000; // 60 seconds to reply
      this.pendingConfirmations.set(confKey, {
        id: confKey,
        tool: toolName,
        argsHash,
        expiresAt
      });

      let confirmMsg = `I am about to execute **${toolName}**. Do you want me to continue?`;
      if (toolName === 'delete_file') {
        confirmMsg = `I am about to delete the file \`${args.path || args.filename || 'unknown'}\`. This cannot be undone. Do you want me to continue?`;
      } else if (toolName === 'tasks_delete') {
        confirmMsg = `That will permanently delete the task. Do you want me to continue?`;
      } else if (riskLevel === 'HIGH_RISK') {
        confirmMsg = `I am about to execute a HIGH RISK operation (${toolName}). Do you want me to continue?`;
      }

      return {
        allowed: false,
        data: {
          action: 'CONFIRM',
          message: confirmMsg
        }
      };
    }

    // SAFE or LOW_RISK
    return { allowed: true };
  }
}

