import { GuardrailsPermissionManager } from './src/core/guardrails';
import { PermissionManager, PermissionRequest, PermissionResponse } from './src/core/permissions';
import { PermissionLevel } from './src/tools/types';

class MockDelegate implements PermissionManager {
  async checkPermission(request: PermissionRequest): Promise<PermissionResponse> {
    if (request.tool.permissionLevel === PermissionLevel.CONFIRM) {
      return { allowed: true }; // user says yes
    }
    return { allowed: true };
  }
}

async function runTests() {
  const delegate = new MockDelegate();
  const guardrails = new GuardrailsPermissionManager(delegate);

  const tests = [
    {
      name: 'SAFE: create task',
      req: {
        tool: { name: 'tasks_create', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { title: 'Test Task' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: true
    },
    {
      name: 'SAFE: create alarm (with internally safe args)',
      req: {
        tool: { name: 'alarms_create', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { triggerAt: '9 AM' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: true
    },
    {
      name: 'DANGEROUS: delete file (requires CONFIRM -> mock allows)',
      req: {
        tool: { name: 'delete_file', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { path: 'test.txt' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: true
    },
    {
      name: 'DENIED: arbitrary PowerShell',
      req: {
        tool: { name: 'run_system_command', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { command: 'powershell.exe -c "Write-Host Hello"' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: false
    },
    {
      name: 'DENIED: arbitrary shell',
      req: {
        tool: { name: 'run_system_command', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { command: 'cmd /c del *.*' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: false
    },
    {
      name: 'DENIED: known tool with powershell injection',
      req: {
        tool: { name: 'tasks_create', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { title: 'powershell -c rm -rf /' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: false
    },
    {
      name: 'DENIED: path traversal',
      req: {
        tool: { name: 'write_file', permissionLevel: PermissionLevel.SAFE, description: '', parameters: {}, execute: async () => ({success:true}) },
        args: { path: '../../windows/system32/cmd.exe' },
        context: { workspace: '', permissions: { canExecuteRestricted: false } }
      },
      expectAllowed: false
    }
  ];

  let passed = 0;
  for (const t of tests) {
    const res = await guardrails.checkPermission(t.req);
    if (res.allowed === t.expectAllowed) {
      console.log(`[PASS] ${t.name}`);
      passed++;
    } else {
      console.log(`[FAIL] ${t.name} (Got: ${res.allowed}, Expected: ${t.expectAllowed}, Error: ${res.data?.error})`);
    }
  }
  
  console.log(`\nTests passed: ${passed}/${tests.length}`);
}

runTests().catch(console.error);
