import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  try {
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);
    logger.info('Configuration loaded successfully');

    // Create MCP server
    const server = new Server(
      {
        name: 'calorie-tracker-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'hello',
            description: 'A simple hello tool for testing',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Name to greet',
                },
              },
            },
          },
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'hello') {
        const nameArg = args?.name || 'World';
        return {
          content: [
            {
              type: 'text',
              text: `Hello, ${nameArg}! This is the Calorie Tracker MCP Server.`,
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });

    // Start the server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Calorie Tracker MCP Server started with stdio transport');

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
