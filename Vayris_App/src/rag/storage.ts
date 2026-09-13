import { Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';

export interface RagDocument {
  id: string; // e.g. file path
  hash: string;
  metadata: Record<string, any>;
  updatedAt: number;
}

export interface RagChunk {
  id: string;
  documentId: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface RetrievalResult {
  chunk: RagChunk;
  score: number;
}

// In-memory dot product
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SQLiteVectorStore {
  private db: Database;
  
  constructor(db: Database) {
    this.db = db;
  }

  async initialize() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        metadata TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS rag_chunks (
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT NOT NULL,
        FOREIGN KEY(documentId) REFERENCES rag_documents(id) ON DELETE CASCADE
      );
    `);
  }

  async close() {
    await this.db.close();
  }

  async getDocument(id: string): Promise<RagDocument | null> {
    const row = await this.db.get('SELECT * FROM rag_documents WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      hash: row.hash,
      metadata: JSON.parse(row.metadata),
      updatedAt: row.updatedAt
    };
  }

  async deleteDocument(id: string): Promise<void> {
    // Delete chunks first
    await this.db.run('DELETE FROM rag_chunks WHERE documentId = ?', [id]);
    // Delete document
    await this.db.run('DELETE FROM rag_documents WHERE id = ?', [id]);
  }

  async upsertDocument(doc: RagDocument, chunks: RagChunk[]): Promise<void> {
    await this.deleteDocument(doc.id); // clear existing first

    await this.db.run(
      'INSERT INTO rag_documents (id, hash, metadata, updatedAt) VALUES (?, ?, ?, ?)',
      [doc.id, doc.hash, JSON.stringify(doc.metadata), doc.updatedAt]
    );

    const stmt = await this.db.prepare(
      'INSERT INTO rag_chunks (id, documentId, text, embedding, metadata) VALUES (?, ?, ?, ?, ?)'
    );

    for (const chunk of chunks) {
      await stmt.run(
        chunk.id,
        chunk.documentId,
        chunk.text,
        JSON.stringify(chunk.embedding), // Float arrays are serialized
        JSON.stringify(chunk.metadata)
      );
    }
    await stmt.finalize();
  }

  async search(queryEmbedding: number[], topK: number = 5, threshold: number = 0.5): Promise<RetrievalResult[]> {
    // Fetch all chunks
    const rows = await this.db.all('SELECT id, documentId, text, embedding, metadata FROM rag_chunks');
    
    const results: RetrievalResult[] = [];
    
    for (const row of rows) {
      const embedding = JSON.parse(row.embedding) as number[];
      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= threshold) {
        results.push({
          chunk: {
            id: row.id,
            documentId: row.documentId,
            text: row.text,
            embedding: embedding,
            metadata: JSON.parse(row.metadata)
          },
          score
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
