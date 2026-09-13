import dotenv from 'dotenv';
dotenv.config();

import { AgentOrchestrator } from './src/core/orchestrator';
import { SQLiteVectorStore } from './src/rag/storage';
import { RagService } from './src/rag/service';
import { OpenAICompatibleProvider } from './src/providers/openai';
import { toolRegistry } from './src/tools/registry';
import { ServerPermissionManager } from './src/core/server_permissions';
import { ToolContext } from './src/tools/types';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as path from 'path';

async function main() {
  const provider = new OpenAICompatibleProvider();
  provider.initialize({
    model: process.env.FAST_MODEL || 'llama3.2:1b',
    apiKey: process.env.VAYRIS_API_KEY,
    baseUrl: process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1'
  });

  const ragDbPath = path.resolve(process.cwd(), 'vayris_rag.db');
  const ragDb = await open({ filename: ragDbPath, driver: sqlite3.Database });
  const vectorStore = new SQLiteVectorStore(ragDb);
  await vectorStore.initialize();
  
  const embedModel = process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text';
  const ragService = new RagService(vectorStore, provider, embedModel);

  const permissionManager = new ServerPermissionManager();
  const orchestrator = new AgentOrchestrator({
    provider,
    toolRegistry,
    permissionManager,
    fastModel: 'llama3.2:1b',
    deepModel: 'qwen3:4b',
    ragService
  });

  const ctx: ToolContext = { workspace: process.cwd(), permissions: { canExecuteRestricted: false, autoConfirm: true } };

  const queries = [
    "What is my name?",
    "What is Vayris?",
    "Who created Vayris?",
    "Who is Vayris's primary user?",
    "What model does Vayris use for FAST conversation?",
    "What model does Vayris use for DEEP reasoning?",
    "Should Vayris use an LLM to open YouTube?",
    "What does Vayris prioritize?",
    "Hello",
    "How are you?"
  ];

  for (const q of queries) {
      console.log(`\n================================`);
      console.log(`Q: ${q}`);
      console.log(`RAG TRIGGERED: ${ragService.shouldRetrieve(q)}`);
      
      const res = await orchestrator.runTask(q, ctx);
      console.log(`A: ${res.metadata.finalResponse}`);
  }
}

main().catch(console.error);
