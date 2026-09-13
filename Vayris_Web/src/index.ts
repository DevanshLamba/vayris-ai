/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';

import { AgentOrchestrator } from './core/orchestrator';
import { OpenAICompatibleProvider } from './providers/openai';
import { providerRegistry } from './providers/registry';
import { toolRegistry } from './tools/registry';
import { SaveMemoryTool, SearchMemoryTool } from './tools/native/memoryTools';
import { ToolContext } from './tools/types';
import { MCPManager } from './mcp/manager';
import { DefaultPermissionManager } from './core/permissions';
import { ServerPermissionManager } from './core/server_permissions';
import { VayrisServer } from './server';
import { SQLiteVectorStore } from './rag/storage';
import { RagService } from './rag/service';
import { RagIngester } from './rag/ingestion';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { SQLiteMemoryStore } from './memory/store';

import { FileSystemSecurity } from './tools/native/filesystem/utils';
import { ListDirectoryTool } from './tools/native/filesystem/list_directory';
import { ReadFileTool } from './tools/native/filesystem/read_file';
import { SearchFilesTool } from './tools/native/filesystem/search_files';
import { WriteFileTool } from './tools/native/filesystem/write_file';
import { DeleteFileTool } from './tools/native/filesystem/delete_file';
import { SystemInfoTool } from './tools/native/system/system_info';
import { SystemTimeTool } from './tools/native/system/system_time';
import { OpenApplicationTool } from './tools/native/applications/open_application';

import { browserManager } from './browser/manager';
import { 
  BrowserOpenTool, BrowserReadPageTool, BrowserFindTool, 
  BrowserClickTool, BrowserTypeTool, BrowserScreenshotTool, BrowserGoBackTool 
} from './tools/native/browser/browser_tools';

import {
  GitStatusTool, GitDiffTool, ProjectInfoTool, RunTestsTool, RunBuildTool
} from './tools/native/developer/developer_tools';

// Load environment variables
dotenv.config();

async function main() {
  console.log('Initializing VAYRIS...');

  // Pre-index installed Windows applications in the background
  const { warmUpAppCache } = require('./tools/native/applications/launcher');
  warmUpAppCache();

  // 0. Initialize Security & Storage
  const allowedRoots = [process.env.VAYRIS_WORKSPACE || process.cwd()];
  const fsSecurity = new FileSystemSecurity(allowedRoots);
  
  const memoryDbPath = path.resolve(process.cwd(), 'vayris_memory.db');
  const memoryStore = new SQLiteMemoryStore(memoryDbPath);

  const ragDbPath = path.resolve(process.cwd(), 'vayris_rag.db');
  const ragDb = await open({
    filename: ragDbPath,
    driver: sqlite3.Database
  });
  const vectorStore = new SQLiteVectorStore(ragDb);
  await vectorStore.initialize();

  // 1. Initialize native tools
  // FileSystem
  toolRegistry.register(new ListDirectoryTool(fsSecurity));
  toolRegistry.register(new ReadFileTool(fsSecurity));
  toolRegistry.register(new SearchFilesTool(fsSecurity));
  toolRegistry.register(new WriteFileTool(fsSecurity));
  toolRegistry.register(new DeleteFileTool(fsSecurity));
  
  // System
  toolRegistry.register(new SystemInfoTool());
  toolRegistry.register(new SystemTimeTool());
  
  const { CaptureScreenTool } = require('./tools/native/system/capture_screen');
  const { AnalyzeImageTool } = require('./tools/native/system/analyze_image');
  toolRegistry.register(new CaptureScreenTool());
  toolRegistry.register(new AnalyzeImageTool());
  
  // Applications
  toolRegistry.register(new OpenApplicationTool());

  // Browser
  toolRegistry.register(new BrowserOpenTool(browserManager));
  toolRegistry.register(new BrowserReadPageTool(browserManager));
  toolRegistry.register(new BrowserFindTool(browserManager));
  toolRegistry.register(new BrowserClickTool(browserManager));
  toolRegistry.register(new BrowserTypeTool(browserManager));
  toolRegistry.register(new BrowserScreenshotTool(browserManager));
  toolRegistry.register(new BrowserGoBackTool(browserManager));
  const { BrowserCloseTool } = await import('./tools/native/browser/browser_tools');
  toolRegistry.register(new BrowserCloseTool(browserManager));

  // Developer
  toolRegistry.register(new GitStatusTool(fsSecurity));
  toolRegistry.register(new GitDiffTool(fsSecurity));
  toolRegistry.register(new ProjectInfoTool(fsSecurity));
  toolRegistry.register(new RunTestsTool(fsSecurity));
  toolRegistry.register(new RunBuildTool(fsSecurity));
  
  // Memory
  toolRegistry.register(new SaveMemoryTool(memoryStore));
  toolRegistry.register(new SearchMemoryTool(memoryStore));

  // Productivity
  const { ProductivityStorage } = require('./tools/native/productivity/storage');
  await ProductivityStorage.getInstance().initialize();
  const { productivityTools } = require('./tools/native/productivity/tools');
  for (const t of productivityTools) toolRegistry.register(t);
  
  const { ProductivityScheduler } = require('./tools/native/productivity/scheduler');
  ProductivityScheduler.getInstance().start();

  // 2. Initialize MCP Manager and load external tools
  const mcpManager = new MCPManager(toolRegistry);
  
  const mcpConfigPath = path.resolve(process.cwd(), 'mcp.config.json');
  if (fs.existsSync(mcpConfigPath)) {
    try {
      console.log('Loading MCP servers from configuration...');
      const configData = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      
      if (configData.mcpServers) {
        for (const [name, serverConfig] of Object.entries<any>(configData.mcpServers)) {
          await mcpManager.registerServer({
            name,
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env,
          });
        }
      }
    } catch (error: any) {
      console.warn(`Warning: Failed to load MCP configuration: ${error.message}`);
    }
  } else {
    console.log('No mcp.config.json found. Skipping MCP initialization.');
  }

  // 3. Initialize provider
  const providerName = process.env.VAYRIS_PROVIDER;
  if (!providerName) {
    console.log('\nNo model provider is configured.');
    console.log('Configure the required environment variables (VAYRIS_PROVIDER, VAYRIS_MODEL, etc.) before starting Vayris.\n');
    process.exit(1);
  }

  // Register providers
  providerRegistry.register(new OpenAICompatibleProvider());
  const { GeminiProvider } = require('./providers/gemini/index');
  providerRegistry.register(new GeminiProvider());

  let provider: any;
  try {
    provider = providerRegistry.getProvider(providerName);
  } catch (e: any) {
    console.log(`\nError: ${e.message}\n`);
    process.exit(1);
  }

  const fastModel = process.env.FAST_MODEL;
  const deepModel = process.env.DEEP_MODEL;
  
  if (!fastModel || !deepModel) {
    console.error('\nError: FAST_MODEL and DEEP_MODEL must be configured in your .env file.');
    console.error('See .env.example for an example configuration.\n');
    process.exit(1);
  }

  const modelName = fastModel;
  
  provider.initialize({
    model: modelName,
    apiKey: process.env.VAYRIS_API_KEY,
    baseUrl: process.env.LOCAL_MODEL_BASE_URL || process.env.VAYRIS_BASE_URL
  });

  console.log(`\nProvider: ${providerName}\nStatus: verifying connection...`);
  try {
    await provider.checkConnection();
    console.log('Status: connected\n');
    
    if (provider.checkModelAvailability) {
      console.log(`Verifying models...`);
      const missing = await provider.checkModelAvailability([fastModel, deepModel]);
      if (missing.length > 0) {
        console.error(`\nError: The following models are missing from your provider (${providerName}):`);
        missing.forEach((m: string) => console.error(`  - ${m}`));
        console.error('\nPlease pull or install these models before continuing, or update your .env to use models that are currently available.');
        console.error('Example: ollama pull ' + missing[0] + '\n');
        process.exit(1);
      }
      console.log(`Models verified: ${fastModel} (FAST), ${deepModel} (DEEP)\n`);
    }
  } catch (e: any) {
    console.log(`Status: error (${e.message})\n`);
    console.log('Please check your provider configuration (baseUrl, API key, etc).\n');
    process.exit(1);
  }

  // 4. Interactive CLI loop setup
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // 5. Initialize Server Permission Manager
  const basePermissionManager = new ServerPermissionManager();

  const ragService = new RagService(vectorStore, provider, process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text');
  const ragIngester = new RagIngester(vectorStore, provider, process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text');

  // Register RAG Tools
  const { RagIngestTool, RagSearchTool } = require('./tools/native/rag/index');
  toolRegistry.register(new RagIngestTool(ragIngester));
  toolRegistry.register(new RagSearchTool(ragService));

  const { GuardrailsPermissionManager } = require('./core/guardrails');
  const permissionManager = new GuardrailsPermissionManager(basePermissionManager);

  const orchestrator = new AgentOrchestrator({
    provider,
    toolRegistry,
    permissionManager,
    fastModel,
    deepModel
  });

  const toolContext: ToolContext = {
    workspace: process.cwd(),
    permissions: {
      canExecuteRestricted: false,
      autoConfirm: false // Must be false for real permission checking
    }
  };

  const server = new VayrisServer(orchestrator, toolContext, basePermissionManager, memoryStore, process.cwd(), 3000);

  orchestrator.onTaskEvent((event) => {
    // Simple event logging for UX
    switch (event.type) {
      case 'TASK_STARTED':
        console.log(`\n[Task Started] ${event.data.goal}`);
        break;
      case 'PLAN_CREATED':
        console.log(`[Plan Created] ${event.data.steps.length} steps.`);
        break;
      case 'TOOL_CALLED':
        console.log(`[Tool Called] ${event.data.tool}`);
        break;
      case 'STEP_FAILED':
        console.log(`[Step Failed] ${event.data.tool}: ${event.data.error}`);
        break;
      case 'TASK_COMPLETED':
        console.log(`\n[Task Completed]`);
        break;
      case 'TASK_FAILED':
        console.log(`\n[Task Failed] ${event.data.reason}`);
        break;
      case 'TASK_CANCELLED':
        console.log(`\n[Task Cancelled]`);
        break;
    }
  });

  console.log('\nVAYRIS is ready. Local Server is running. CLI is still active (enter your goal, or "exit" to quit).');

  const askQuestion = () => {
    rl.question('\n> ', async (input) => {
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        rl.close();
        await mcpManager.disconnectAll();
        await memoryStore.close();
        await browserManager.close();
        server.close();
        return;
      }

      if (input.trim() === '') {
        askQuestion();
        return;
      }

      try {
        const result = await orchestrator.runTask(input, toolContext);
        if (result.metadata.finalResponse) {
          console.log(`\nVAYRIS: ${result.metadata.finalResponse}`);
        }
      } catch (error: any) {
        console.error(`\nError: ${error.message}`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
}
