import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadAppConfig, validateAppConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { Database } from './db/index.js';
import { Tools } from './tools/tools.js';

async function main(): Promise<void> {
  try {
    // Load and validate app configuration
    const appConfig = loadAppConfig();
    validateAppConfig(appConfig);
    logger.info('App configuration loaded successfully');

    // Initialize database
    const database = new Database(appConfig);
    await database.initialize();

    // Initialize tools with database
    const tools = new Tools(database);

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
        tools: tools.getTools(),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await tools.handleTool(name, args);
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
