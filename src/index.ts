import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { loadAppConfig, validateAppConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { Database } from './db/index.js';
import { McpServer } from './mcp/index.js';

// Transport configuration
const TRANSPORT_TYPE = process.env.TRANSPORT ?? 'stdio';
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10);
const USER_ID = process.env.USER_ID;

let database: Database | null = null;
let httpServer: ReturnType<typeof express.application.listen> | null = null;
const sessionServers: Record<string, McpServer> = {};
const transports: Record<string, StreamableHTTPServerTransport> = {};

async function main(): Promise<void> {
  try {
    // Load and validate app configuration
    const appConfig = loadAppConfig();
    validateAppConfig(appConfig);
    logger.info('App configuration loaded successfully');

    // Initialize database
    database = new Database(appConfig);
    await database.initialize();

    // Start server with selected transport
    if (TRANSPORT_TYPE === 'http') {
      startHTTPServer(database);
    } else {
      // Default: Stdio Transport with single user
      if (!USER_ID) {
        logger.error('USER_ID environment variable is required for stdio transport');
        throw new Error('USER_ID environment variable is required for stdio transport');
      }

      const mcpServer = new McpServer(USER_ID, database);
      const transport = new StdioServerTransport();
      await mcpServer.getServer().connect(transport);
      logger.info('Calorie Tracker MCP Server started with stdio transport', { userId: USER_ID });
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function startHTTPServer(database: Database): void {
  const app = express();
  app.use(express.json());

  // Debug middleware: inject X-User-ID header if USER_ID is set (optional for HTTP)
  if (USER_ID) {
    app.use((req, res, next) => {
      if (!req.headers['x-user-id']) {
        req.headers['x-user-id'] = USER_ID;
        logger.info('Debug middleware: injected X-User-ID header', { userId: USER_ID });
      }
      next();
    });
  }

  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      protocol: 'MCP',
      version: '2025-03-26',
      transport: 'Streamable HTTP',
    });
  });

  // GET endpoint for server-to-client notifications
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    try {
      await transport.handleRequest(req, res, null);
    } catch (error) {
      logger.error('Error handling GET request', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // DELETE endpoint for session termination
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    try {
      await transport.handleRequest(req, res, null);
    } catch (error) {
      logger.error('Error handling DELETE request', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // POST endpoint for client-to-server messages
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    let transport = sessionId ? transports[sessionId] : undefined;
    let mcpServer = sessionId ? sessionServers[sessionId] : undefined;

    try {
      // Create new transport and server for new sessions
      if (!transport || !mcpServer) {
        // Require X-User-ID header
        const userId = req.headers['x-user-id'] as string;
        if (!userId) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32602,
              message: 'X-User-ID header is required for HTTP transport',
            },
            id: null,
          });
          return;
        }

        // Create user-contextual MCP server
        mcpServer = new McpServer(userId, database);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport!;
            sessionServers[sid] = mcpServer!;
            logger.info('Created new MCP session', { sessionId: sid, userId });
          },
        });

        // Set up close handler
        transport.onclose = () => {
          if (transport!.sessionId) {
            delete transports[transport!.sessionId];
            delete sessionServers[transport!.sessionId];
            logger.info('MCP session closed', { sessionId: transport!.sessionId });
          }
        };

        // Connect server to transport
        await mcpServer.getServer().connect(transport);
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Start HTTP server
  httpServer = app.listen(HTTP_PORT, () => {
    logger.info('Calorie Tracker MCP Server started with HTTP transport', {
      port: HTTP_PORT,
      protocol: 'Streamable HTTP (2025-03-26)',
      endpoint: `http://localhost:${HTTP_PORT}/mcp`,
    });
  });
}

// Graceful shutdown handler
const handleShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections if HTTP server is running
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server stopped accepting new connections');
      cleanupResources();
    });
  } else {
    // For stdio transport, cleanup immediately
    cleanupResources();
  }

  // Force exit after 10 seconds if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);
};

// Cleanup function for all resources
function cleanupResources(): void {
  (async () => {
    // Close all active transports
    const sessionIds = Object.keys(transports);
    if (sessionIds.length > 0) {
      logger.info(`Closing ${sessionIds.length} active sessions...`);

      for (const sessionId of sessionIds) {
        try {
          logger.info(`Closing transport for session ${sessionId}`);
          const transport = transports[sessionId];
          if (transport) {
            await transport.close();
            delete transports[sessionId];
            delete sessionServers[sessionId];
          }
        } catch (error) {
          logger.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
    }

    // Close database connection
    if (database) {
      try {
        await database.closeDatabase();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Error closing database:', error);
      }
    }

    logger.info('All resources cleaned up, exiting...');
    process.exit(0);
  })().catch((error) => {
    logger.error('Error during cleanup:', error);
    process.exit(1);
  });
}

// Register shutdown handlers
process.on('SIGINT', () => {
  handleShutdown('SIGINT');
});
process.on('SIGTERM', () => {
  handleShutdown('SIGTERM');
});

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
