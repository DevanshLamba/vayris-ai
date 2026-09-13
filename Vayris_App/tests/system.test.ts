import { SystemInfoTool } from '../src/tools/native/system/system_info';
import { SystemTimeTool } from '../src/tools/native/system/system_time';
import { ToolContext } from '../src/tools/types';

describe('System Tools', () => {
  const mockContext: ToolContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };

  it('SystemInfoTool should return valid structured data', async () => {
    const tool = new SystemInfoTool();
    const result = await tool.execute({}, mockContext);
    
    expect(result.success).toBe(true);
    expect(result.data.platform).toBeDefined();
    expect(result.data.architecture).toBeDefined();
    expect(result.data.cpus).toBeGreaterThan(0);
  });

  it('SystemTimeTool should return ISO time', async () => {
    const tool = new SystemTimeTool();
    const result = await tool.execute({}, mockContext);
    
    expect(result.success).toBe(true);
    expect(result.data.currentTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
