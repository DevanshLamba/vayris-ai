import { PermissionManager, PermissionRequest, PermissionResponse } from './permissions';
import { PermissionLevel } from '../tools/types';
import { auditLogger } from './audit_logger';

const ALLOWED_TOOLS = new Set([
  'list_directory',
  'read_file',
  'search_files',
  'write_file',
  'delete_file',
  'system_info',
  'system_time',
  'capture_screen',
  'analyze_image',
  'open_application',
  'browser_open',
  'browser_read_page',
  'browser_find',
  'browser_click',
  'browser_type',
  'browser_screenshot',
  'browser_go_back',
  'browser_close',
  'git_status',
  'git_diff',
  'project_info',
  'run_tests',
  'run_build',
  'save_memory',
  'search_memory',
  'tasks_list',
  'tasks_create',
  'tasks_complete',
  'tasks_delete',
  'tasks_count',
  'tasks_update',
  'reminders_list',
  'reminders_create',
  'reminders_cancel',
  'reminders_update',
  'alarms_list',
  'alarms_create',
  'alarms_cancel',
  'email_draft',
  'propose_plan',
  'complete_task',
  'fail_task',
  'rag_ingest',
  'rag_search'
]);

const DANGEROUS_TOOLS = new Set([
  'delete_file',
  'write_file',
  'run_tests',
  'run_build',
  'tasks_delete'
]);

export class GuardrailsPermissionManager implements PermissionManager {
  constructor(private delegate: PermissionManager) {}

  async checkPermission(request: PermissionRequest): Promise<PermissionResponse> {
    let decision = 'DENY';
    let allowed = false;
    let toolName = request.tool?.name || 'unknown';
    try {
      const response = await this._evaluatePermission(request);
      decision = response.allowed ? 'ALLOW' : 'DENY';
      allowed = response.allowed;
      return response;
    } catch (e: any) {
      return { allowed: false, data: { error: 'Guardrail failure: ' + e.message } };
    } finally {
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

  private async _evaluatePermission(request: PermissionRequest): Promise<PermissionResponse> {
    const toolName = request.tool.name;
    const args = request.args || {};

    // 1. Tool Allowlist
    if (!ALLOWED_TOOLS.has(toolName)) {
      return { allowed: false, data: { error: `Tool ${toolName} is not in the allowlist.` } };
    }

    // 2. Arbitrary Command Execution Check
    const argsString = JSON.stringify(args).toLowerCase();
    if (argsString.includes('powershell') || argsString.includes('cmd.exe') || 
        argsString.includes('/bin/sh') || argsString.includes('/bin/bash') ||
        argsString.includes('cmd /c')) {
      return { allowed: false, data: { error: 'Arbitrary shell execution is forbidden.' } };
    }

    // 3. Path Security Check
    for (const key of Object.keys(args)) {
      const val = args[key];
      if (typeof val === 'string') {
        if (val.includes('../') || val.includes('..\\')) {
          return { allowed: false, data: { error: 'Path traversal is forbidden.' } };
        }
      }
    }

    // 4. Destructive Operations require CONFIRM
    if (DANGEROUS_TOOLS.has(toolName)) {
      request.tool.permissionLevel = PermissionLevel.CONFIRM;
    }

    // Delegate to the actual permission manager (UI/Server confirmation)
    return await this.delegate.checkPermission(request);
  }
}

