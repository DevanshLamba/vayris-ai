import { PermissionManager, PermissionRequest, PermissionResponse } from './permissions';
import { PermissionLevel } from '../tools/types';

export class ServerPermissionManager implements PermissionManager {
  private pendingRequests: Map<string, { resolve: (response: PermissionResponse) => void, toolName: string }> = new Map();
  private requestCallback?: (reqId: string, req: PermissionRequest) => void;
  private trustedTools: Set<string> = new Set();

  onRequest(cb: (reqId: string, req: PermissionRequest) => void) {
    this.requestCallback = cb;
  }

  resolveRequest(reqId: string, response: PermissionResponse) {
    const pending = this.pendingRequests.get(reqId);
    if (pending) {
      if (response.allowed && response.data?.alwaysAllowSession) {
        this.trustedTools.add(pending.toolName);
      }
      pending.resolve(response);
      this.pendingRequests.delete(reqId);
    }
  }

  async checkPermission(request: PermissionRequest): Promise<PermissionResponse> {
    if (request.tool.permissionLevel === PermissionLevel.SAFE) return { allowed: true };
    if (request.context?.permissions?.autoConfirm) return { allowed: true };
    if (this.trustedTools.has(request.tool.name)) return { allowed: true };

    return new Promise((resolve) => {
      const reqId = Math.random().toString(36).substring(7);
      
      const signal = request.context?.signal;
      if (signal?.aborted) {
        return resolve({ allowed: false });
      }

      const onAbort = () => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          resolve({ allowed: false });
        }
      };

      const cleanResolve = (val: PermissionResponse) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(val);
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      this.pendingRequests.set(reqId, { resolve: cleanResolve, toolName: request.tool.name });
      
      if (this.requestCallback) {
        this.requestCallback(reqId, request);
      } else {
        // Fallback if no client is listening
        console.warn('ServerPermissionManager: No client to ask, denying.');
        cleanResolve({ allowed: false });
      }
    });
  }
}
