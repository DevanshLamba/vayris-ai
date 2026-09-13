import dotenv from 'dotenv';
dotenv.config();

import { SQLiteVectorStore } from './src/rag/storage';
import { RagIngester } from './src/rag/ingestion';
import { OpenAICompatibleProvider } from './src/providers/openai';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
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
  
  const embedModel = process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text';
  const ragIngester = new RagIngester(vectorStore, provider, embedModel);

  const knowledgeDir = path.resolve(process.cwd(), 'knowledge');
  if (!fs.existsSync(knowledgeDir)) {
      console.error("Knowledge directory not found!");
      process.exit(1);
  }

  const domains: Record<string, string[]> = {
    'vayris_identity.md': ['SYSTEM'],
    'vayris_architecture.md': ['SYSTEM', 'PROJECT'],
    'vayris_capabilities.md': ['SYSTEM'],
    'communication_style.md': ['SYSTEM'],
    'devansh_profile.md': ['PERSONAL'],
    'preferences.md': ['PERSONAL'],
    'projects.md': ['PERSONAL', 'PROJECT'],
    'vayris_decisions.md': ['PROJECT', 'SYSTEM'],
    'vayris_workflows.md': ['SYSTEM', 'PROJECT'],
    'vayris_glossary.md': ['SYSTEM', 'PROJECT']
  };

  const files = fs.readdirSync(knowledgeDir);
  for (const file of files) {
      if (file.endsWith('.md')) {
          const filePath = path.join(knowledgeDir, file);
          const domain = domains[file] || ['GENERAL'];
          console.log(`Indexing ${file} with domain: ${domain.join(', ')}`);
          await ragIngester.indexFile(filePath, { domain });
      }
  }

  console.log("Knowledge directory successfully indexed!");
}

main().catch(console.error);
