/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async init() {
    console.log(`[BROWSER] browser instance exists: ${!!this.browser}`);
    if (!this.browser) {
      console.log(`[BROWSER] OS Platform: ${process.platform}`);
      console.log(`[BROWSER] SESSIONNAME: ${process.env.SESSIONNAME}`);
      console.log(`[BROWSER] USERNAME: ${process.env.USERNAME}`);
      console.log('[BROWSER] launching chromium (msedge channel)');
      const options = { 
        headless: false,
        channel: 'msedge',
        args: ['--start-maximized']
      };
      console.log(`[BROWSER] launch options: ${JSON.stringify(options)}`);
      this.browser = await chromium.launch(options);
      console.log('[BROWSER] launch returned');
      console.log(`[BROWSER] isConnected: ${this.browser.isConnected()}`);
      console.log(`[BROWSER] contexts length: ${this.browser.contexts().length}`);
      
      this.context = await this.browser.newContext({ viewport: null });
      console.log('[BROWSER] context created');
      
      this.page = await this.context.newPage();
      console.log('[BROWSER] page created');
      console.log(`[BROWSER] page count: ${this.context.pages().length}`);
    }
  }

  async close() {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  private async getPage(): Promise<Page> {
    await this.init();
    if (!this.page) throw new Error("Browser page is not initialized.");
    return this.page;
  }

  async navigate(url: string) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }
    const parsedUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
    }

    const page = await this.getPage();
    console.log('[BROWSER] calling page.goto');
    
    // Bring window to front
    await page.bringToFront().catch(() => {});
    
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    console.log('[BROWSER] page.goto completed');
    
    const currentUrl = page.url();
    const title = await page.title();
    
    console.log(`[BROWSER] page.url = ${currentUrl}`);
    console.log(`[BROWSER] page.title = ${title}`);
    
    return { title, url: currentUrl };
  }

  async readPage() {
    const page = await this.getPage();
    const text = await page.evaluate(() => document.body.innerText);
    return { title: await page.title(), url: page.url(), content: text.substring(0, 10000) }; // Cap to 10K chars
  }

  async findElements(selector: string) {
    const page = await this.getPage();
    const locators = page.locator(selector);
    const count = await locators.count();
    const results = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      results.push(await locators.nth(i).textContent());
    }
    return { count, elements: results.map(t => (t || '').trim()) };
  }

  async click(selector: string) {
    const page = await this.getPage();
    await page.click(selector, { timeout: 5000 });
    return { status: 'clicked', selector };
  }

  async type(selector: string, text: string) {
    const page = await this.getPage();
    await page.fill(selector, text, { timeout: 5000 });
    return { status: 'typed', selector };
  }

  async screenshot() {
    const page = await this.getPage();
    const buffer = await page.screenshot({ type: 'png' });
    // In a real scenario we might return a path or base64, here we return base64 for safe tooling output.
    return { status: 'captured', base64: buffer.toString('base64').substring(0, 100) + '... [TRUNCATED FOR OUTPUT]' }; 
  }

  async goBack() {
    const page = await this.getPage();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    return { title: await page.title(), url: page.url() };
  }
}

// Global browser instance manager
export const browserManager = new BrowserManager();
