/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { AgentOrchestrator } from './core/orchestrator';
import { ToolContext } from './tools/types';

import { ServerPermissionManager } from './core/server_permissions';

import { MemoryStore } from './memory/types';

export class VayrisServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private orchestrator: AgentOrchestrator;
  private permissionManager: ServerPermissionManager;
  private memoryStore: MemoryStore;
  private clients: Set<WebSocket> = new Set();
  private toolContext: ToolContext;

  constructor(orchestrator: AgentOrchestrator, toolContext: ToolContext, permissionManager: ServerPermissionManager, memoryStore: MemoryStore, appPath: string = process.cwd(), port: number = 3000) {
    this.orchestrator = orchestrator;
    this.toolContext = toolContext;
    this.permissionManager = permissionManager;
    this.memoryStore = memoryStore;
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Serve static frontend assets if built
    const uiDistPath = path.join(appPath, 'ui', 'dist');
    if (fs.existsSync(uiDistPath)) {
      this.app.use(express.static(uiDistPath));
    }

    this.server = http.createServer(this.app);
    
    this.server.on('connection', (socket) => {
      this.activeSockets.add(socket);
      socket.once('close', () => this.activeSockets.delete(socket));
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.setupRoutes();
    this.setupWebSocket();
    this.setupOrchestratorEvents();

    this.server.listen(port, () => {
      console.log(`\nVayris Local Server running on http://localhost:${port}`);
    });
  }

  private broadcast(type: string, data: any) {
    const message = JSON.stringify({ type, ...data });
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private setupOrchestratorEvents() {
    this.orchestrator.onTaskEvent((event) => {
      console.log(`[SERVER] emitting event: ${event.type}`);
      this.broadcast('task_event', { data: event });
    });

    this.permissionManager.onRequest((reqId, req) => {
      this.broadcast('permission_request', {
        reqId,
        tool: req.tool.name,
        arguments: req.args
      });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'run_task') {
            console.log(`[SERVER] received run_task: ${typeof msg.goal === 'string' ? msg.goal : 'multimodal'}`);
            let goalPayload: any = msg.goal;
            if (msg.image) {
              const hasVision = this.orchestrator['engine']['provider'].capabilities?.vision;
              if (!hasVision) {
                ws.send(JSON.stringify({ 
                  type: 'task_result', 
                  result: { metadata: { finalResponse: 'Error: The selected model does not support vision. Please remove the image or select a vision-capable model.' } } 
                }));
                return;
              }
              goalPayload = [
                { type: 'text', text: msg.goal },
                { type: 'image', image: msg.image }
              ];
            }
            try {
              console.log(`[SERVER] starting task (Mode: ${msg.mode || 'AUTO'})`);
              this.toolContext.latestGoal = typeof msg.goal === 'string' ? msg.goal : (msg.goal as any[]).find(g=>g.type==='text')?.text || '';
              const result = await this.orchestrator.runTask(goalPayload, this.toolContext, msg.mode);
              ws.send(JSON.stringify({ type: 'task_result', result }));
            } catch (err: any) {
              console.error(`[SERVER] task error: ${err.message}`);
              this.broadcast('task_event', {
                data: {
                  type: 'TASK_FAILED',
                  data: { reason: err.message }
                }
              });
              ws.send(JSON.stringify({
                type: 'task_result',
                result: {
                  status: 'FAILED',
                  metadata: { finalResponse: `Error: ${err.message}` }
                }
              }));
            }
          }
          if (msg.type === 'cancel_task') {
            console.log(`[SERVER] received cancel_task from UI`);
            this.orchestrator.cancelActiveTask();
          }
          if (msg.type === 'permission_response') {
            if (this.permissionManager) {
              this.permissionManager.resolveRequest(msg.reqId, { allowed: msg.allowed, data: msg.data });
            }
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  private setupRoutes() {
    this.app.get('/api/status', (req, res) => {
      res.json({ status: 'ok', version: '1.0.0' });
    });

    this.app.get('/api/config', (req, res) => {
      res.json({
        provider: process.env.VAYRIS_PROVIDER || 'openai-compatible',
        model: process.env.VAYRIS_MODEL || 'gpt-4o-mini',
        baseUrl: process.env.VAYRIS_BASE_URL || '',
        workspace: process.env.VAYRIS_WORKSPACE || process.cwd(),
        vision: this.orchestrator['engine']['provider'].capabilities?.vision || false
      });
    });

    this.app.get('/api/tools', (req, res) => {
      const tools = this.toolContext ? this.orchestrator['engine']['toolRegistry'].getToolDefinitions() : [];
      // we can also pull permission levels if we modify getToolDefinitions, but for now we just return names/desc
      res.json(tools);
    });

    // Real Memory Routes
    this.app.get('/api/memory', async (req, res) => {
      try {
        const query = (req.query.q as string) || '';
        const category = req.query.category as string | undefined;
        const memories = await this.memoryStore.search(query, category);
        res.json(memories);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to retrieve memories' });
      }
    });

    this.app.delete('/api/memory/:id', async (req, res) => {
      try {
        const success = await this.memoryStore.delete(req.params.id);
        if (success) {
          res.json({ success: true });
        } else {
          res.status(404).json({ error: 'Memory not found' });
        }
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to delete memory' });
      }
    });

    this.app.delete('/api/memory', async (req, res) => {
      try {
        await this.memoryStore.clear();
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to clear memory' });
      }
    });
  }

  private activeSockets: Set<import('net').Socket> = new Set();

  public close() {
    this.wss.close();
    this.activeSockets.forEach(s => s.destroy());
    this.activeSockets.clear();
    this.server.close();
  }
}
