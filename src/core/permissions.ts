/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { BaseTool, PermissionLevel, ToolContext } from '../tools/types';
import * as readline from 'readline';

export interface PermissionRequest {
  tool: BaseTool;
  args: Record<string, any>;
  context: ToolContext;
}

export interface PermissionResponse {
  allowed: boolean;
  data?: any;
}

export interface PermissionManager {
  checkPermission(request: PermissionRequest): Promise<PermissionResponse>;
}

export class DefaultPermissionManager implements PermissionManager {
  private rl?: readline.Interface;
  private trustedTools: Set<string> = new Set();

  constructor(rl?: readline.Interface) {
    this.rl = rl;
  }

  async checkPermission(request: PermissionRequest): Promise<PermissionResponse> {
    const { tool, context } = request;

    if (tool.permissionLevel === PermissionLevel.SAFE) {
      return { allowed: true };
    }

    if (tool.permissionLevel === PermissionLevel.RESTRICTED) {
      if (!context.permissions.canExecuteRestricted) {
        return { allowed: false };
      }
    }

    if (context.permissions.autoConfirm) {
      return { allowed: true };
    }

    if (this.trustedTools.has(tool.name)) {
      return { allowed: true };
    }

    if (!this.rl) {
      return { allowed: false };
    }

    return new Promise((resolve) => {
      const signal = request.context?.signal;
      if (signal?.aborted) {
        return resolve({ allowed: false });
      }

      console.log(`\n\x1b[33m--- PERMISSION REQUIRED ---\x1b[0m`);
      console.log(`VAYRIS wants to execute:`);
      console.log(`Tool: ${request.tool.name}`);
      console.log(`Arguments: ${JSON.stringify(request.args, null, 2)}`);
      
      const onAbort = () => {
        // We can't cancel a readline question easily without complex hacks, but we can resolve the promise.
        resolve({ allowed: false });
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      const cleanResolve = (val: PermissionResponse) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(val);
      };

      this.rl!.question('\nAllow? [y/N/a (Always for session)]: ', (answer) => {
        if (signal?.aborted) return; // Ignore if already cancelled

        const input = answer.trim().toLowerCase();
        if (input === 'a') {
          this.trustedTools.add(tool.name);
          console.log(`\x1b[32mAction approved. Trusted tool: ${tool.name}\x1b[0m\n`);
          cleanResolve({ allowed: true });
        } else {
          const isAllowed = input === 'y';
          if (!isAllowed) {
            console.log('\x1b[31mAction denied by user.\x1b[0m\n');
          } else {
            console.log('\x1b[32mAction approved.\x1b[0m\n');
          }
          cleanResolve({ allowed: isAllowed });
        }
      });
    });
  }
}
