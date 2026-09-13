import { MCPClient } from '../src/mcp/client';
import { MCPToolAdapter } from '../src/mcp/adapter';
import { MCPManager } from '../src/mcp/manager';
import { ToolRegistry } from '../src/tools/registry';
import { PermissionLevel, ToolContext } from '../src/tools/types';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            {
              name: 'mock_mcp_tool',
              description: 'A mock MCP tool',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        }),
        callTool: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'mcp_success' }],
          isError: false
        }),
      };
    })
  };
});

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: jest.fn().mockImplementation(() => {
      return {
        close: jest.fn().mockResolvedValue(undefined)
      };
    })
  };
});

describe('MCPClient Integration Layer', () => {
  const mockConfig = {
    name: 'test-server',
    command: 'node',
    args: ['mock.js']
  };

  describe('MCPClient', () => {
    let client: MCPClient;

    beforeEach(() => {
      client = new MCPClient(mockConfig);
    });

    afterEach(async () => {
      await client.disconnect();
    });

    it('should initialize and connect successfully', async () => {
      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should throw when listing tools before connection', async () => {
      await expect(client.getTools()).rejects.toThrow(/not connected/);
    });

    it('should list tools after connection', async () => {
      await client.connect();
      const tools = await client.getTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('mock_mcp_tool');
    });

    it('should call a tool successfully', async () => {
      await client.connect();
      const result = await client.callTool('mock_mcp_tool', {});
      expect(result.content[0].text).toBe('mcp_success');
    });
  });

  describe('MCPToolAdapter', () => {
    let client: MCPClient;
    let adapter: MCPToolAdapter;
    let mockContext: ToolContext;

    beforeEach(async () => {
      client = new MCPClient(mockConfig);
      await client.connect();
      const tools = await client.getTools();
      adapter = new MCPToolAdapter(tools[0], client);
      mockContext = { permissions: { canExecuteRestricted: false, autoConfirm: true }, workspace: process.cwd() };
    });

    afterEach(async () => {
      await client.disconnect();
    });

    it('should map MCP tool fields correctly', () => {
      expect(adapter.name).toBe('mcp.test-server.mock_mcp_tool');
      expect(adapter.description).toBe('A mock MCP tool');
      expect(adapter.permissionLevel).toBe(PermissionLevel.CONFIRM); // Enforces conservative default
    });

    it('should execute and wrap result in ToolResult format', async () => {
      const result = await adapter.execute({}, mockContext);
      expect(result.success).toBe(true);
      expect(result.data[0].text).toBe('mcp_success');
    });
  });

  describe('MCPManager', () => {
    let registry: ToolRegistry;
    let manager: MCPManager;

    beforeEach(() => {
      registry = new ToolRegistry();
      manager = new MCPManager(registry);
    });

    afterEach(async () => {
      await manager.disconnectAll();
    });

    it('should register server and inject tools into ToolRegistry', async () => {
      await manager.registerServer(mockConfig);
      
      const tools = registry.getToolDefinitions();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('mcp.test-server.mock_mcp_tool');
      
      // Ensure the orchestrator can fetch and execute it normally
      const tool = registry.getTool('mcp.test-server.mock_mcp_tool');
      expect(tool).toBeDefined();
      expect(tool?.permissionLevel).toBe(PermissionLevel.CONFIRM);
    });
    
    it('should prevent duplicate server registration', async () => {
      await manager.registerServer(mockConfig);
      await expect(manager.registerServer(mockConfig)).rejects.toThrow(/already registered/);
    });
  });
});
