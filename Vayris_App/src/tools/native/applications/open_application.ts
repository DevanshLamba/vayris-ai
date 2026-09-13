/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';

export class OpenApplicationTool extends BaseTool {
  name = 'open_application';
  description = 'Opens an application, file, or URL using the system default handler. Does NOT execute shell commands.';
  permissionLevel = PermissionLevel.CONFIRM; // Interacting with external apps requires confirmation
  parameters = {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'The file path, URL, or application name to open.' },
      appName: { type: 'string', description: 'Optional specific application to use (e.g. "firefox").' }
    },
    required: ['target']
  };

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const { ApplicationResolver, ApplicationLauncher } = await import('./launcher');
      const resolver = new ApplicationResolver();
      const launcher = new ApplicationLauncher();

      // Determine the app to launch
      const targetName = args.appName || args.target;

      // If it looks like a URL, use the launcher to handle it via Windows shell safely
      if (/^(https?|file):\/\//.test(args.target) || /^[a-z0-9-]+\.[a-z]{2,}$/i.test(args.target)) {
        await launcher.launch({ found: true, targetType: 'uri', displayName: 'URL', source: 'URL', validatedTarget: args.target });
        return { success: true, data: { status: 'opened url', target: args.target } };
      }

      const resolvedApp = await resolver.resolve(targetName);

      if (!resolvedApp.found) {
        return { success: false, error: `Could not resolve application: ${targetName}` };
      }

      await launcher.launch(resolvedApp);
      
      return { success: true, data: { status: 'opened application', app: resolvedApp.displayName, targetType: resolvedApp.targetType, source: resolvedApp.source } };
    } catch (error: any) {
      return { success: false, error: `Failed to open target: ${error.message}` };
    }
  }
}
