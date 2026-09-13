// @ts-nocheck
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagIngester = exports.ALLOWED_EXTENSIONS = exports.EXCLUDED_FILES = exports.EXCLUDED_DIRS = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const chunker_1 = require("./chunker");
exports.EXCLUDED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    '.next',
    '.cache',
    'coverage'
]);
exports.EXCLUDED_FILES = new Set([
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
]);
exports.ALLOWED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx',
    '.md', '.mdx',
    '.txt',
    '.json'
]);
function getFileHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}
class RagIngester {
    store;
    provider;
    embeddingModel;
    constructor(store, provider, embeddingModel = 'nomic-embed-text') {
        this.store = store;
        this.provider = provider;
        this.embeddingModel = embeddingModel;
    }
    async indexDirectory(dirPath) {
        const files = this.walkDir(dirPath);
        let indexedCount = 0;
        for (const file of files) {
            const indexed = await this.indexFile(file);
            if (indexed)
                indexedCount++;
        }
        return indexedCount;
    }
    walkDir(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
            if (exports.EXCLUDED_DIRS.has(file))
                continue;
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(this.walkDir(filePath));
            }
            else {
                if (exports.EXCLUDED_FILES.has(file))
                    continue;
                const ext = path.extname(file).toLowerCase();
                if (exports.ALLOWED_EXTENSIONS.has(ext)) {
                    results.push(filePath);
                }
            }
        }
        return results;
    }
    async indexFile(filePath, customMetadata) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const hash = getFileHash(content);
        const existingDoc = await this.store.getDocument(filePath);
        if (existingDoc && existingDoc.hash === hash) {
            console.log(`[RAG] Skipping unchanged file: ${filePath}`);
            return false; // Not changed
        }
        console.log(`[RAG] Indexing file: ${filePath}`);
        const textChunks = (0, chunker_1.chunkText)(content, { maxTokens: 250, overlapTokens: 50 });
        // Batch embeddings to avoid provider rate limits/timeouts
        const embeddings = [];
        if (this.provider.generateEmbeddings) {
            for (let i = 0; i < textChunks.length; i += 10) {
                const batch = textChunks.slice(i, i + 10);
                const batchEmbeddings = await this.provider.generateEmbeddings(batch, { modelOverride: this.embeddingModel });
                embeddings.push(...batchEmbeddings);
            }
        }
        else {
            throw new Error("Provider does not support generateEmbeddings");
        }
        const doc = {
            id: filePath,
            hash,
            metadata: {
                filename: path.basename(filePath),
                extension: path.extname(filePath),
                ...customMetadata
            },
            updatedAt: Date.now()
        };
        const ragChunks = textChunks.map((text, idx) => ({
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
exports.RagIngester = RagIngester;
