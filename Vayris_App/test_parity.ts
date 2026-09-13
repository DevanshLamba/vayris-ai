
import { TaskEngine } from "./src/core/task/engine";
import { DefaultPermissionManager } from "./src/core/permissions";
import { GuardrailsPermissionManager } from "./src/core/guardrails";

async function runParityTest() {
  const baseManager = new DefaultPermissionManager();
  const guardrails = new GuardrailsPermissionManager(baseManager);
  
  // mock provider
  const mockProvider = {
    generateResponseStream: (memory: any[], tools: any[], config: any) => {
      console.log("[MOCK PROVIDER] reasoningMode=" + config.reasoningMode + " toolsCount=" + tools?.length);
      if (tools) {
         console.log("[MOCK PROVIDER] tools=" + tools.map((t:any) => t.name).join(", "));
      }
      return (async function*() {
         yield { type: "tool_call", name: "tasks_create", args: { title: "Test Task" }, id: "123" };
      })();
    }
  };

  const engine = new TaskEngine(mockProvider as any);
  (engine as any).permissionManager = guardrails;
  
  console.log("--- TESTING FAST MODE ---");
  const taskFast = engine.createTask("create a task", "fast");
  taskFast.metadata.domain = "productivity";
  await engine.runTask(taskFast, { workspace: "", permissions: { canExecuteRestricted: true }, latestGoal: "create a task" });

  console.log("\n--- TESTING DEEP MODE ---");
  const taskDeep = engine.createTask("create a task", "deep");
  taskDeep.metadata.domain = "productivity";
  await engine.runTask(taskDeep, { workspace: "", permissions: { canExecuteRestricted: true }, latestGoal: "create a task" });
  
  console.log("\nPARITY TEST COMPLETE");
}
runParityTest().catch(console.error);

