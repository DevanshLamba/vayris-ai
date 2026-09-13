import fs from 'fs';
import path from 'path';

export class AuditLogger {
  private logFile: string;

  constructor() {
    this.logFile = path.resolve(process.cwd(), 'audit.log');
  }

  log(event: {
    timestamp: number;
    mode: string;
    tool: string;
    operation: string;
    decision: string;
    success: boolean;
  }) {
    const entry = JSON.stringify({
      timestamp: new Date(event.timestamp).toISOString(),
      modelMode: event.mode,
      tool: event.tool,
      operation: event.operation, // Don't log full args to avoid secrets, just the operation or tool name
      decision: event.decision,
      success: event.success
    }) + '\n';
    
    fs.appendFileSync(this.logFile, entry);
  }
}

export const auditLogger = new AuditLogger();
