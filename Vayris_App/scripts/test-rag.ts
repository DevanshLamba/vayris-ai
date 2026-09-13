import dotenv from 'dotenv';
dotenv.config();

import { SQLiteVectorStore } from './src/rag/storage';
import { RagService } from './src/rag/service';
import { RagIngester } from './src/rag/ingestion';
import { OpenAICompatibleProvider } from './src/providers/openai';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log("1. Initializing Provider and RAG...");
  const provider = new OpenAICompatibleProvider();
  provider.initialize({
    model: process.env.FAST_MODEL || 'llama3.2:1b',
    apiKey: process.env.VAYRIS_API_KEY,
    baseUrl: process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1'
  });

  const ragDbPath = path.resolve(process.cwd(), 'vayris_rag.db');
  const ragDb = await open({
    filename: ragDbPath,
    driver: sqlite3.Database
  });
  
  const vectorStore = new SQLiteVectorStore(ragDb);
  await vectorStore.initialize();
  
  const ragService = new RagService(vectorStore, provider, process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text');
  const ragIngester = new RagIngester(vectorStore, provider, process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text');

  console.log("\n2. Testing Routing Heuristics...");
  console.log(`- 'How are you?': RAG = ${ragService.shouldRetrieve('How are you?')}`);
  console.log(`- 'Open YouTube.': RAG = ${ragService.shouldRetrieve('Open YouTube.')}`);
  console.log(`- 'What does my architecture.md say about model routing?': RAG = ${ragService.shouldRetrieve('What does my architecture.md say about model routing?')}`);

  console.log("\n3. Testing Ingestion...");
  const testDir = path.resolve(process.cwd(), 'scratch_test_rag');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
  
  fs.writeFileSync(path.join(testDir, 'architecture.md'), 'Vayris Architecture: Model routing is handled by the AgentOrchestrator which uses a regex heuristic to route simple queries to the fast model and complex goals to the deep agent task engine.');
  
  const count = await ragIngester.indexDirectory(testDir);
  console.log(`Indexed ${count} files.`);

  console.log("\n4. Testing Retrieval...");
  const context = await ragService.retrieveContext("What does my architecture.md say about model routing?", 1);
  console.log("Context retrieved:\n" + context);

  console.log("\n5. Testing Incremental Indexing...");
  const count2 = await ragIngester.indexDirectory(testDir);
  console.log(`Indexed ${count2} files (should be 0 because it's unchanged).`);
  
  fs.writeFileSync(path.join(testDir, 'architecture.md'), 'Vayris Architecture V2: We now use a neural network for routing.');
  const count3 = await ragIngester.indexDirectory(testDir);
  console.log(`Indexed ${count3} files (should be 1 because it changed).`);

  const context2 = await ragService.retrieveContext("What does my architecture.md say about model routing?", 1);
  console.log("Context retrieved after update:\n" + context2);

  console.log("\n6. Testing Deletion...");
  await vectorStore.deleteDocument(path.join(testDir, 'architecture.md'));
  const context3 = await ragService.retrieveContext("What does my architecture.md say about model routing?", 1);
  console.log("Context retrieved after deletion:\n" + (context3 || '(None)'));

  fs.rmSync(testDir, { recursive: true, force: true });
}

main().catch(console.error);
