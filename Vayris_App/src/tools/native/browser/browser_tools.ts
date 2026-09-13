/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import { BrowserManager } from '../../../browser/manager';

export class BrowserOpenTool extends BaseTool {
  name = 'browser_open';
  description = 'Open a URL in the browser.';
  permissionLevel = PermissionLevel.CONFIRM;
  parameters = { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    console.log('[BROWSER URL DEBUG] raw input=', args.url);
    try {
      const { normalizeWebUrl } = await import('./website_catalog');
      const canonicalUrl = normalizeWebUrl(args.url);
      console.log('[BROWSER URL DEBUG] normalized URL=', canonicalUrl);
      
      // 1. Let playwright do its headless tracking as usual
      const data = await this.browser.navigate(canonicalUrl);
      
      // 2. Force a physical native OS window to open independently
      try {
        const open = (await import('open')).default;
        await open(canonicalUrl);
        console.log('[BROWSER] forced native OS window open via `open` package');
      } catch (openErr: any) {
        console.log('[BROWSER] failed to force native window:', openErr.message);
      }
      
      return { success: true, data };
    } catch (e: any) { 
      return { success: false, error: e.message }; 
    }
  }
}

export class BrowserReadPageTool extends BaseTool {
  name = 'browser_read_page';
  description = 'Extract visible text from the current browser page.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(): Promise<ToolResult> {
    try {
      return { success: true, data: await this.browser.readPage() };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}

export class BrowserFindTool extends BaseTool {
  name = 'browser_find';
  description = 'Find elements on the current page using a CSS selector.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      return { success: true, data: await this.browser.findElements(args.selector) };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}

export class BrowserClickTool extends BaseTool {
  name = 'browser_click';
  description = 'Click a visible element on the page using a CSS selector.';
  permissionLevel = PermissionLevel.CONFIRM;
  parameters = { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      return { success: true, data: await this.browser.click(args.selector) };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}

export class BrowserTypeTool extends BaseTool {
  name = 'browser_type';
  description = 'Type text into a field on the current page using a CSS selector.';
  permissionLevel = PermissionLevel.CONFIRM;
  parameters = { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' } }, required: ['selector', 'text'] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      return { success: true, data: await this.browser.type(args.selector, args.text) };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}

export class BrowserScreenshotTool extends BaseTool {
  name = 'browser_screenshot';
  description = 'Capture a screenshot of the current page.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(): Promise<ToolResult> {
    try {
      return { success: true, data: await this.browser.screenshot() };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}

export class BrowserGoBackTool extends BaseTool {
  name = 'browser_go_back';
  description = 'Navigate back one page in the browser history.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(): Promise<ToolResult> {
    try {
      return { success: true, data: await this.browser.goBack() };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}

export class BrowserCloseTool extends BaseTool {
  name = 'browser_close';
  description = 'Close the browser entirely.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = { type: 'object', properties: {}, required: [] };

  constructor(private browser: BrowserManager) { super(); }

  async execute(): Promise<ToolResult> {
    try {
      await this.browser.close();
      return { success: true, data: { status: 'Browser closed.' } };
    } catch (e: any) { return { success: false, error: e.message }; }
  }
}
