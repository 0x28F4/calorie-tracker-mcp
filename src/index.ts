import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { loadAppConfig, validateAppConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { Database } from './db/index.js';
import { startOfDay, endOfDay, format } from 'date-fns';

// Transport configuration
const TRANSPORT_TYPE = process.env.TRANSPORT ?? 'stdio';
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10);
const USER_ID = process.env.USER_ID;

let database: Database | null = null;
let httpServer: ReturnType<typeof express.application.listen> | null = null;
const sessionServers: Record<string, McpServer> = {};
const transports: Record<string, StreamableHTTPServerTransport> = {};

// User-contextual MCP Server that binds a user ID to all tools
class McpServer {
  private userId: string;
  private server: BaseMcpServer;
  private database: Database;

  constructor(userId: string, database: Database) {
    this.userId = userId;
    this.database = database;
    this.server = new BaseMcpServer({
      name: 'calorie-tracker-mcp',
      version: '1.0.0',
    });

    this.registerTools();
  }

  // Expose the underlying server for transport connection
  getServer(): BaseMcpServer {
    return this.server;
  }

  private registerTools(): void {
    // Register add_meal tool
    this.server.registerTool(
      'add_meal',
      {
        title: 'Add Meal',
        description: 'Add a meal entry to the calorie tracker',
        inputSchema: {
          mealName: z
            .string()
            .min(1, 'Meal name is required')
            .describe('Name of the meal (e.g., "Breakfast", "Chicken Salad")'),
          calories: z.number().min(0, 'Calories must be a positive number').describe('Total calories in the meal'),
          proteinGrams: z
            .number()
            .min(0, 'Protein must be a positive number')
            .optional()
            .describe('Protein content in grams (optional)'),
          carbsGrams: z
            .number()
            .min(0, 'Carbs must be a positive number')
            .optional()
            .describe('Carbohydrate content in grams (optional)'),
          fatGrams: z
            .number()
            .min(0, 'Fat must be a positive number')
            .optional()
            .describe('Fat content in grams (optional)'),
          loggedAt: z
            .string()
            .datetime()
            .optional()
            .describe('ISO timestamp when meal was consumed (optional, defaults to now)'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Create meal entry
          const meal = await this.database.createMeal(userId, {
            mealName: args.mealName,
            calories: args.calories,
            proteinGrams: args.proteinGrams,
            carbsGrams: args.carbsGrams,
            fatGrams: args.fatGrams,
            loggedAt: args.loggedAt ? new Date(args.loggedAt) : undefined,
          });

          logger.info('Meal added successfully via MCP tool', { mealId: meal.id, mealName: meal.mealName, userId });

          // Format macros for display
          const macros = [];
          if (meal.proteinGrams !== null && meal.proteinGrams !== undefined) {
            macros.push(`${meal.proteinGrams}g protein`);
          }
          if (meal.carbsGrams !== null && meal.carbsGrams !== undefined) {
            macros.push(`${meal.carbsGrams}g carbs`);
          }
          if (meal.fatGrams !== null && meal.fatGrams !== undefined) {
            macros.push(`${meal.fatGrams}g fat`);
          }
          const macroText = macros.length > 0 ? ` (${macros.join(', ')})` : '';

          // Format the logged date
          const loggedAtText = meal.loggedAt.toLocaleDateString();

          return {
            content: [
              {
                type: 'text',
                text: `✅ Added meal: ${meal.mealName} - ${meal.calories} calories${macroText}\nLogged for: ${loggedAtText}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to add meal via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to add meal: ${String(error)}`,
              },
            ],
          };
        }
      },
    );

    // Register check_weight tool
    this.server.registerTool(
      'check_weight',
      {
        title: 'Check Weight',
        description:
          'Add/update a weight entry or check recent weight history. If a weight already exists for the date, it will be updated.',
        inputSchema: {
          weightKg: z
            .number()
            .min(0, 'Weight must be a positive number')
            .optional()
            .describe('Weight in kilograms to log (optional, if not provided will show recent history)'),
          loggedAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
            .optional()
            .describe('Date for weight entry (YYYY-MM-DD format, optional, defaults to today)'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Ensure user exists
          await this.database.ensureUserExists(userId);

          if (args.weightKg !== undefined) {
            // Add or update weight entry
            const weight = await this.database.createWeight(userId, {
              weightKg: args.weightKg,
              loggedAt: args.loggedAt ? new Date(args.loggedAt) : new Date(),
            });

            logger.info('Weight logged successfully via MCP tool', {
              weightId: weight.id,
              weightKg: weight.weightKg,
              userId,
            });

            const weightDate = weight.loggedAt instanceof Date ? weight.loggedAt : new Date(weight.loggedAt);
            const dateDisplay = format(weightDate, 'MMMM do, yyyy');

            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Weight logged: ${weight.weightKg}kg for ${dateDisplay}`,
                },
              ],
            };
          } else {
            // Show recent weight history
            const recentWeights = await this.database.getRecentWeights(userId, 10);

            if (recentWeights.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: '📊 No weight entries found. Add your first weight entry!',
                  },
                ],
              };
            }

            let historyText = `📊 **Recent Weight History** (${recentWeights.length} entries):\n\n`;

            recentWeights.forEach((weight, index) => {
              const weightDate = weight.loggedAt instanceof Date ? weight.loggedAt : new Date(weight.loggedAt);
              const dateDisplay = format(weightDate, 'MMM do, yyyy');
              const isToday = format(weightDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              const todayMarker = isToday ? ' (today)' : '';

              if (index === 0) {
                historyText += `• **${dateDisplay}${todayMarker}**: ${weight.weightKg}kg ← Latest\n`;
              } else {
                const prevWeight = recentWeights[index - 1]?.weightKg ?? 0;
                const change = weight.weightKg - prevWeight;
                const changeText = change !== 0 ? ` (${change > 0 ? '+' : ''}${change.toFixed(1)}kg)` : '';
                historyText += `• ${dateDisplay}${todayMarker}: ${weight.weightKg}kg${changeText}\n`;
              }
            });

            // Add trend analysis if we have multiple entries
            if (recentWeights.length >= 2) {
              const latest = recentWeights[0]?.weightKg ?? 0;
              const oldest = recentWeights[recentWeights.length - 1]?.weightKg ?? 0;
              const totalChange = latest - oldest;
              const trend = totalChange > 0 ? '📈 trending up' : totalChange < 0 ? '📉 trending down' : '➡️ stable';

              historyText += `\n**Trend**: ${trend} (${totalChange > 0 ? '+' : ''}${totalChange.toFixed(1)}kg overall)`;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: historyText,
                },
              ],
            };
          }
        } catch (error) {
          logger.error('Failed to process weight check via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to process weight check: ${String(error)}`,
              },
            ],
          };
        }
      },
    );

    // Register update_user_settings tool
    this.server.registerTool(
      'update_user_settings',
      {
        title: 'Update User Settings',
        description: 'Update user timezone and/or metabolic rate settings',
        inputSchema: {
          timezone: z.string().optional().describe('Timezone (e.g., "America/New_York", "UTC", "Europe/London")'),
          metabolicRate: z
            .number()
            .min(0, 'Metabolic rate must be positive')
            .optional()
            .describe('Daily metabolic rate in calories'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Update settings with provided values
          const updatedSettings = await this.database.updateUserSettings(userId, {
            timezone: args.timezone,
            metabolicRate: args.metabolicRate,
          });

          logger.info('User settings updated successfully via MCP tool', { userId, updates: args });

          // Build response text
          let responseText = '✅ **User settings updated**\n\n';
          if (args.timezone !== undefined) {
            responseText += `🌍 **Timezone**: ${updatedSettings.timezone}\n`;
          }
          if (args.metabolicRate !== undefined) {
            responseText += `🔥 **Metabolic rate**: ${updatedSettings.metabolicRate} calories/day\n`;
          }

          responseText += `\n📅 Last updated: ${format(updatedSettings.updatedAt, 'PPP')}`;

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to update user settings via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to update settings: ${String(error)}`,
              },
            ],
          };
        }
      },
    );

    // Register get_summary tool
    this.server.registerTool(
      'get_summary',
      {
        title: 'Get Summary',
        description: 'Get multi-day summary with daily statistics and totals in JSON format',
        inputSchema: {
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
            .describe('Start date for the summary range (YYYY-MM-DD format)'),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
            .describe('End date for the summary range (YYYY-MM-DD format)'),
          weightMovingAvgDays: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe('Number of days for weight moving average calculation (default: 3)'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Parse dates
          const startDate = startOfDay(new Date(args.startDate));
          const endDate = endOfDay(new Date(args.endDate));

          // Validate date range
          if (startDate > endDate) {
            throw new Error('Start date must be before or equal to end date');
          }

          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Get user settings for metabolic rate
          const userSettings = await this.database.getUserSettings(userId);
          const metabolicRate = userSettings.metabolicRate;

          // Get daily meals and weights separately
          const dailyMeals = await this.database.getDailyMealsForDateRange(userId, startDate, endDate);
          const weightsInRange = await this.database.getWeightsForDateRange(userId, startDate, endDate);

          // Create a map of dates to weights for efficient lookup
          const weightMap = new Map<string, number>();
          weightsInRange.forEach((weight) => {
            weightMap.set(weight.date, weight.weightKg);
          });

          // Build daily stats by combining meals and weights
          const dailyStats = dailyMeals.map((meal) => {
            const deficit = metabolicRate - meal.totalCalories;
            const weight = weightMap.get(meal.date) ?? null;

            return {
              date: meal.date,
              totalCalories: meal.totalCalories,
              deficit,
              macros: {
                protein: meal.totalProtein,
                carbs: meal.totalCarbs,
                fat: meal.totalFat,
              },
              weight,
            };
          });

          // Calculate totals
          const totalCalories = dailyStats.reduce((sum, day) => sum + day.totalCalories, 0);
          const totalDeficit = dailyStats.reduce((sum, day) => sum + day.deficit, 0);

          // Calculate proper moving average for weight
          const movingAvgDays = args.weightMovingAvgDays ?? 3;
          const weightsWithData = dailyStats.filter((day) => day.weight !== null);
          const lastNWeights = weightsWithData.slice(-movingAvgDays); // Take last N weights (proper moving average)

          const weightMovingAvg =
            lastNWeights.length > 0
              ? Math.round((lastNWeights.reduce((sum, day) => sum + (day.weight ?? 0), 0) / lastNWeights.length) * 10) /
                10
              : null;

          // Build final summary
          const finalSummary = {
            dailyStats,
            totalStats: {
              totalCalories,
              totalDeficit,
              weightMovingAvg,
            },
          };

          // Format date range for display
          const dateRangeDisplay = `${format(startDate, 'MMM do')} - ${format(endDate, 'MMM do, yyyy')}`;

          return {
            content: [
              {
                type: 'text',
                text: `📊 **Summary Report: ${dateRangeDisplay}**\n\n\`\`\`json\n${JSON.stringify(finalSummary, null, 2)}\n\`\`\``,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to get summary via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to get summary: ${String(error)}`,
              },
            ],
          };
        }
      },
    );
  }
}

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
