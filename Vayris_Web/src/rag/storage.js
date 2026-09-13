// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteVectorStore = void 0;
// In-memory dot product
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0)
        return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
class SQLiteVectorStore {
    db;
    constructor(db) {
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
    async getDocument(id) {
        const row = await this.db.get('SELECT * FROM rag_documents WHERE id = ?', [id]);
        if (!row)
            return null;
        return {
            id: row.id,
            hash: row.hash,
            metadata: JSON.parse(row.metadata),
            updatedAt: row.updatedAt
        };
    }
    async deleteDocument(id) {
        // Delete chunks first
        await this.db.run('DELETE FROM rag_chunks WHERE documentId = ?', [id]);
        // Delete document
        await this.db.run('DELETE FROM rag_documents WHERE id = ?', [id]);
    }
    async upsertDocument(doc, chunks) {
        await this.deleteDocument(doc.id); // clear existing first
        await this.db.run('INSERT INTO rag_documents (id, hash, metadata, updatedAt) VALUES (?, ?, ?, ?)', [doc.id, doc.hash, JSON.stringify(doc.metadata), doc.updatedAt]);
        const stmt = await this.db.prepare('INSERT INTO rag_chunks (id, documentId, text, embedding, metadata) VALUES (?, ?, ?, ?, ?)');
        for (const chunk of chunks) {
            await stmt.run(chunk.id, chunk.documentId, chunk.text, JSON.stringify(chunk.embedding), // Float arrays are serialized
            JSON.stringify(chunk.metadata));
        }
        await stmt.finalize();
    }
    async search(queryEmbedding, topK = 5, threshold = 0.5) {
        // Fetch all chunks
        const rows = await this.db.all('SELECT id, documentId, text, embedding, metadata FROM rag_chunks');
        const results = [];
        for (const row of rows) {
            const embedding = JSON.parse(row.embedding);
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
exports.SQLiteVectorStore = SQLiteVectorStore;
