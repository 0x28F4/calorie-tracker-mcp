import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadAppConfig, validateAppConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { Database } from './db/index.js';

async function main(): Promise<void> {
  try {
    // Load and validate app configuration
    const appConfig = loadAppConfig();
    validateAppConfig(appConfig);
    logger.info('App configuration loaded successfully');

    // Initialize database
    const database = new Database(appConfig);
    await database.initialize();

    // Hard-coded user ID for now (will be configurable later)
    const userId = 'user-1';
    await database.ensureUserExists(userId);

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
      },
    );

    // Set up tool handlers
    server.setRequestHandler(ListToolsRequestSchema, () => {
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

    server.setRequestHandler(CallToolRequestSchema, (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'hello') {
        const nameArg = (args?.name as string) ?? 'World';
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
