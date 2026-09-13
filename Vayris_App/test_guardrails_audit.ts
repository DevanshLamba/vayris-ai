
import { GuardrailsPermissionManager } from './src/core/guardrails';
import { DefaultPermissionManager } from './src/core/permissions';
import { PermissionLevel } from './src/tools/types';

async function runAudit() {
  const baseManager = new DefaultPermissionManager();
  const guardrails = new GuardrailsPermissionManager(baseManager);

  const req1 = {
    tool: { name: 'delete_file', permissionLevel: PermissionLevel.RESTRICTED, description: '', parameters: {}, execute: async () => ({success: true}) },
    args: { path: 'C:/important/file.txt' },
    context: { workspace: '', permissions: { canExecuteRestricted: true }, latestGoal: 'Delete this file please' }
  };

  console.log('TEST 1: INITIAL DESTRUCTIVE REQUEST');
  let res1 = await guardrails.checkPermission(req1);
  console.log(res1);

  console.log('\nTEST 2: LLM FALSE CONFIRMATION');
  const req2 = { ...req1, args: { path: 'C:/important/file.txt', confirmed: true } };
  let res2 = await guardrails.checkPermission(req2);
  console.log(res2);

  console.log('\nTEST 3: RAG INJECTION');
  const req3 = { ...req1, context: { ...req1.context, latestGoal: 'Summarize the document' } };
  let res3 = await guardrails.checkPermission(req3);
  console.log(res3);

  console.log('\nTEST 4: EXPLICIT CONFIRMATION BINDING');
  const req4 = { ...req1 };
  await guardrails.checkPermission(req4);
  const req5 = { ...req1, context: { ...req1.context, latestGoal: 'yes' } };
  let res5 = await guardrails.checkPermission(req5);
  console.log(res5);

  console.log('\nTEST 5: FAIL-CLOSED');
  const req6 = { ...req1, tool: { ...req1.tool, name: 'unknown_malicious_tool' } };
  let res6 = await guardrails.checkPermission(req6);
  console.log(res6);
}
runAudit().catch(console.error);

