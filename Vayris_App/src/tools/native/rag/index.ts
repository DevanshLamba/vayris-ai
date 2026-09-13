import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';
import { RagIngester } from '../../../rag/ingestion';
import { RagService } from '../../../rag/service';

export class RagIngestTool extends BaseTool {
  name = 'rag_ingest_folder';
  description = 'Index a folder into the local vector knowledge base. Do this when the user asks you to read or remember a project/folder.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      folderPath: { type: 'string', description: 'Absolute path to the folder to index' }
    },
    required: ['folderPath']
  };

  private ingester: RagIngester;

  constructor(ingester: RagIngester) {
    super();
    this.ingester = ingester;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const count = await this.ingester.indexDirectory(args.folderPath as string);
      return { success: true, data: `Successfully indexed ${count} files from ${args.folderPath} into the knowledge base.` };
    } catch (e: any) {
      return { success: false, data: `Failed to index folder: ${e.message}`, error: e.message };
    }
  }
}

export class RagSearchTool extends BaseTool {
  name = 'rag_search_knowledge';
  description = 'Search the local vector knowledge base manually. Only use this if the automatic RAG context did not contain enough information.';
  permissionLevel = PermissionLevel.SAFE;
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query or question' }
    },
    required: ['query']
  };

  private ragService: RagService;

  constructor(ragService: RagService) {
    super();
    this.ragService = ragService;
  }

  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    try {
      const contextStr = await this.ragService.retrieveContext(args.query as string, 10);
      if (!contextStr) return { success: true, data: "No relevant information found in the knowledge base." };
      return { success: true, data: contextStr };
    } catch (e: any) {
      return { success: false, data: `Failed to search knowledge base: ${e.message}`, error: e.message };
    }
  }
}
