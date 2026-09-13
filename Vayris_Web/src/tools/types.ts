/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  uiContent?: string;
  spokenContent?: string;
  metadata?: any;
}

export enum PermissionLevel {
  SAFE = 'safe',
  CONFIRM = 'confirm',
  RESTRICTED = 'restricted',
}

export interface ToolContext {
  workspace: string;
  permissions: {
    canExecuteRestricted: boolean;
    autoConfirm?: boolean;
  };
  injectedData?: any;
  signal?: AbortSignal;
  latestGoal?: string;
  // Can add MCP connections or other context here later
}

export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: any; // JSON Schema for arguments
  abstract permissionLevel: PermissionLevel;

  abstract execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult>;
}
