// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagSearchTool = exports.RagIngestTool = void 0;
const types_1 = require("../../types");
class RagIngestTool extends types_1.BaseTool {
    name = 'rag_ingest_folder';
    description = 'Index a folder into the local vector knowledge base. Do this when the user asks you to read or remember a project/folder.';
    permissionLevel = types_1.PermissionLevel.SAFE;
    parameters = {
        type: 'object',
        properties: {
            folderPath: { type: 'string', description: 'Absolute path to the folder to index' }
        },
        required: ['folderPath']
    };
    ingester;
    constructor(ingester) {
        super();
        this.ingester = ingester;
    }
    async execute(args, context) {
        try {
            const count = await this.ingester.indexDirectory(args.folderPath);
            return { success: true, data: `Successfully indexed ${count} files from ${args.folderPath} into the knowledge base.` };
        }
        catch (e) {
            return { success: false, data: `Failed to index folder: ${e.message}`, error: e.message };
        }
    }
}
exports.RagIngestTool = RagIngestTool;
class RagSearchTool extends types_1.BaseTool {
    name = 'rag_search_knowledge';
    description = 'Search the local vector knowledge base manually. Only use this if the automatic RAG context did not contain enough information.';
    permissionLevel = types_1.PermissionLevel.SAFE;
    parameters = {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'The search query or question' }
        },
        required: ['query']
    };
    ragService;
    constructor(ragService) {
        super();
        this.ragService = ragService;
    }
    async execute(args, context) {
        try {
            const contextStr = await this.ragService.retrieveContext(args.query, 10);
            if (!contextStr)
                return { success: true, data: "No relevant information found in the knowledge base." };
            return { success: true, data: contextStr };
        }
        catch (e) {
            return { success: false, data: `Failed to search knowledge base: ${e.message}`, error: e.message };
        }
    }
}
exports.RagSearchTool = RagSearchTool;
