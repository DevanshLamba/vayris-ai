import { BrowserManager } from '../src/browser/manager';
import { 
  BrowserOpenTool, BrowserReadPageTool, BrowserFindTool, 
  BrowserClickTool, BrowserTypeTool, BrowserScreenshotTool, BrowserGoBackTool 
} from '../src/tools/native/browser/browser_tools';
import { ToolContext } from '../src/tools/types';

// Mock playwright
jest.mock('playwright', () => {
  const mockPage = {
    close: jest.fn().mockResolvedValue(undefined),
    goto: jest.fn().mockResolvedValue(undefined),
    title: jest.fn().mockResolvedValue('Example Domain'),
    url: jest.fn().mockReturnValue('https://example.com'),
    evaluate: jest.fn().mockResolvedValue('Example Domain body text'),
    locator: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(1),
      nth: jest.fn().mockReturnValue({
        textContent: jest.fn().mockResolvedValue('Example Domain')
      })
    }),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot-data')),
    goBack: jest.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    close: jest.fn().mockResolvedValue(undefined),
    newPage: jest.fn().mockResolvedValue(mockPage)
  };

  const mockBrowser = {
    close: jest.fn().mockResolvedValue(undefined),
    newContext: jest.fn().mockResolvedValue(mockContext)
  };

  return {
    chromium: {
      launch: jest.fn().mockResolvedValue(mockBrowser)
    }
  };
});

describe('Browser Tools', () => {
  let browserManager: BrowserManager;
  let mockContext: ToolContext;

  beforeAll(() => {
    browserManager = new BrowserManager();
    mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };
  });

  afterAll(async () => {
    await browserManager.close();
  });

  it('should prevent invalid URLs', async () => {
    const tool = new BrowserOpenTool(browserManager);
    const result = await tool.execute({ url: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid protocol');
  });

  it('should navigate and read page', async () => {
    const openTool = new BrowserOpenTool(browserManager);
    const openResult = await openTool.execute({ url: 'https://example.com' });
    expect(openResult.success).toBe(true);

    const readTool = new BrowserReadPageTool(browserManager);
    const readResult = await readTool.execute();
    expect(readResult.success).toBe(true);
    expect(readResult.data.content).toContain('Example Domain');
  });

  it('should find elements on page', async () => {
    const findTool = new BrowserFindTool(browserManager);
    const findResult = await findTool.execute({ selector: 'h1' });
    expect(findResult.success).toBe(true);
    expect(findResult.data.count).toBe(1);
    expect(findResult.data.elements[0]).toBe('Example Domain');
  });

  it('should capture screenshot', async () => {
    const shotTool = new BrowserScreenshotTool(browserManager);
    const shotResult = await shotTool.execute();
    expect(shotResult.success).toBe(true);
    expect(shotResult.data.base64).toContain('TRUNCATED');
  });
});
