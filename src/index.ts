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
const STDIO_USER_ID = process.env.USER_ID ?? 'user-1';

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

    // Register get_today_summary tool
    this.server.registerTool(
      'get_today_summary',
      {
        title: 'Get Today Summary',
        description: 'Get summary of calories and nutrition for today',
        inputSchema: {
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
            .optional()
            .describe('Date to get summary for (YYYY-MM-DD format, optional, defaults to today)'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Parse target date (default to today)
          const targetDate = args.date ? new Date(args.date) : new Date();
          const startDate = startOfDay(targetDate);
          const endDate = endOfDay(targetDate);

          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Get meals for the day
          const meals = await this.database.getMealsInDateRange(userId, startDate, endDate);

          // Get weight for the date (try exact date first, then most recent)
          let weight;
          try {
            weight = await this.database.getWeightForDate(userId, format(targetDate, 'yyyy-MM-dd'));
          } catch {
            // If no weight for exact date, get the most recent weight
            const recentWeights = await this.database.getRecentWeights(userId, 1);
            weight = recentWeights.length > 0 ? recentWeights[0] : null;
          }

          // Calculate totals
          const totalCalories = meals.reduce((total, meal) => total + meal.calories, 0);
          const totalProtein = meals.reduce((total, meal) => total + (meal.proteinGrams ?? 0), 0);
          const totalCarbs = meals.reduce((total, meal) => total + (meal.carbsGrams ?? 0), 0);
          const totalFat = meals.reduce((total, meal) => total + (meal.fatGrams ?? 0), 0);

          // Get user settings for metabolic rate
          const userSettings = await this.database.getUserSettings(userId);
          const metabolicRate = userSettings?.metabolicRate ?? 2000;
          const deficit = metabolicRate - totalCalories;

          // Format date for display
          const dateDisplay = format(targetDate, 'MMMM do, yyyy');

          // Build summary text
          let summaryText = `📊 **Summary for ${dateDisplay}**\n\n`;
          summaryText += `🔥 **Calories**: ${totalCalories} / ${metabolicRate} (${deficit > 0 ? 'deficit' : 'surplus'}: ${Math.abs(deficit)})\n`;

          if (totalProtein > 0 || totalCarbs > 0 || totalFat > 0) {
            summaryText += `📈 **Macros**: `;
            const macros = [];
            if (totalProtein > 0) macros.push(`${totalProtein.toFixed(1)}g protein`);
            if (totalCarbs > 0) macros.push(`${totalCarbs.toFixed(1)}g carbs`);
            if (totalFat > 0) macros.push(`${totalFat.toFixed(1)}g fat`);
            summaryText += macros.join(', ') + '\n';
          }

          if (weight) {
            const weightDate = weight.loggedAt instanceof Date ? weight.loggedAt : new Date(weight.loggedAt);
            const weightDateDisplay = format(weightDate, 'MMM do');
            summaryText += `⚖️ **Weight**: ${weight.weightKg}kg (${weightDateDisplay})\n`;
          }

          summaryText += `\n📋 **Meals** (${meals.length}):\n`;
          if (meals.length === 0) {
            summaryText += '• No meals logged';
          } else {
            meals.forEach((meal) => {
              const mealTime = meal.loggedAt instanceof Date ? meal.loggedAt : new Date(meal.loggedAt);
              const timeDisplay = format(mealTime, 'HH:mm');
              summaryText += `• ${timeDisplay} - ${meal.mealName}: ${meal.calories} cal\n`;
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: summaryText,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to get today summary via MCP tool', error);
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
  }
}

async function main(): Promise<void> {
  try {
    // Load and validate app configuration
    const appConfig = loadAppConfig();
    validateAppConfig(appConfig);
    logger.info('App configuration loaded successfully');

    // Initialize database
    const database = new Database(appConfig);
    await database.initialize();

    // Start server with selected transport
    if (TRANSPORT_TYPE === 'http') {
      startHTTPServer(database);
    } else {
      // Default: Stdio Transport with single user
      const mcpServer = new McpServer(STDIO_USER_ID, database);
      const transport = new StdioServerTransport();
      await mcpServer.getServer().connect(transport);
      logger.info('Calorie Tracker MCP Server started with stdio transport', { userId: STDIO_USER_ID });
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function startHTTPServer(database: Database): void {
  const app = express();
  app.use(express.json());

  // Store user-contextual servers by session ID
  const sessionServers: Record<string, McpServer> = {};
  // Store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

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
  const httpServer = app.listen(HTTP_PORT, () => {
    logger.info('Calorie Tracker MCP Server started with HTTP transport', {
      port: HTTP_PORT,
      protocol: 'Streamable HTTP (2025-03-26)',
      endpoint: `http://localhost:${HTTP_PORT}/mcp`,
    });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down HTTP server gracefully...');

    httpServer.close(() => {
      logger.info('HTTP server stopped');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down HTTP server gracefully...');

    httpServer.close(() => {
      logger.info('HTTP server stopped');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
