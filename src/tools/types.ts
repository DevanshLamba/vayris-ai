export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
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
  // Can add MCP connections or other context here later
}

export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: any; // JSON Schema for arguments
  abstract permissionLevel: PermissionLevel;

  abstract execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult>;
}
