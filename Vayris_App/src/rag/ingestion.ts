import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SQLiteVectorStore, RagDocument, RagChunk } from './storage';
import { chunkText } from './chunker';
import { ModelProvider } from '../providers/types';

export const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.cache',
  'coverage'
]);

export const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
]);

export const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.md', '.mdx',
  '.txt',
  '.json'
]);

function getFileHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export class RagIngester {
  private store: SQLiteVectorStore;
  private provider: ModelProvider;
  private embeddingModel: string;

  constructor(store: SQLiteVectorStore, provider: ModelProvider, embeddingModel: string = 'nomic-embed-text') {
    this.store = store;
    this.provider = provider;
    this.embeddingModel = embeddingModel;
  }

  async indexDirectory(dirPath: string): Promise<number> {
    const files = this.walkDir(dirPath);
    let indexedCount = 0;
    
    for (const file of files) {
      const indexed = await this.indexFile(file);
      if (indexed) indexedCount++;
    }

    return indexedCount;
  }

  private walkDir(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    
    for (const file of list) {
      if (EXCLUDED_DIRS.has(file)) continue;
      
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat && stat.isDirectory()) {
        results = results.concat(this.walkDir(filePath));
      } else {
        if (EXCLUDED_FILES.has(file)) continue;
        const ext = path.extname(file).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          results.push(filePath);
        }
      }
    }
    return results;
  }

  async indexFile(filePath: string, customMetadata?: Record<string, any>): Promise<boolean> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = getFileHash(content);

    const existingDoc = await this.store.getDocument(filePath);
    if (existingDoc && existingDoc.hash === hash) {
      console.log(`[RAG] Skipping unchanged file: ${filePath}`);
      return false; // Not changed
    }

    console.log(`[RAG] Indexing file: ${filePath}`);
    const textChunks = chunkText(content, { maxTokens: 250, overlapTokens: 50 });
    
    // Batch embeddings to avoid provider rate limits/timeouts
    const embeddings: number[][] = [];
    if (this.provider.generateEmbeddings) {
       for (let i = 0; i < textChunks.length; i += 10) {
         const batch = textChunks.slice(i, i + 10);
         const batchEmbeddings = await this.provider.generateEmbeddings(batch, { modelOverride: this.embeddingModel });
         embeddings.push(...batchEmbeddings);
       }
    } else {
       throw new Error("Provider does not support generateEmbeddings");
    }

    const doc: RagDocument = {
      id: filePath,
      hash,
      metadata: {
        filename: path.basename(filePath),
        extension: path.extname(filePath),
        ...customMetadata
      },
      updatedAt: Date.now()
    };

    const ragChunks: RagChunk[] = textChunks.map((text, idx) => ({
      id: `${filePath}#chunk${idx}`,
      documentId: filePath,
      text,
      embedding: embeddings[idx],
      metadata: {
        chunkIndex: idx,
        filename: path.basename(filePath),
        ...customMetadata
      }
    }));

    await this.store.upsertDocument(doc, ragChunks);
    return true;
  }
}
