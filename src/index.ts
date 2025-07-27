import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
const TRANSPORT_TYPE = process.env.TRANSPORT || 'stdio';
const HTTP_PORT = parseInt(process.env.PORT || '3000', 10);

async function main(): Promise<void> {
  try {
    // Load and validate app configuration
    const appConfig = loadAppConfig();
    validateAppConfig(appConfig);
    logger.info('App configuration loaded successfully');

    // Initialize database
    const database = new Database(appConfig);
    await database.initialize();

    // Create MCP server
    const server = new McpServer({
      name: 'calorie-tracker-mcp',
      version: '1.0.0',
    });

    // Register add_meal tool
    server.registerTool(
      'add_meal',
      {
        title: 'Add Meal',
        description: 'Add a meal entry to the calorie tracker',
        inputSchema: {
          userId: z.string().optional().describe('User ID (optional, defaults to "user-1")'),
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
        const userId = args.userId ?? 'user-1';

        try {
          // Ensure user exists
          await database.ensureUserExists(userId);

          // Create meal entry
          const meal = await database.createMeal(userId, {
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
    server.registerTool(
      'get_today_summary',
      {
        title: 'Get Today Summary',
        description: 'Get summary of calories and nutrition for today',
        inputSchema: {
          userId: z.string().optional().describe('User ID (optional, defaults to "user-1")'),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
            .optional()
            .describe('Date to get summary for (YYYY-MM-DD format, optional, defaults to today)'),
        },
      },
      async (args) => {
        const userId = args.userId ?? 'user-1';

        try {
          // Parse target date (default to today)
          const targetDate = args.date ? new Date(args.date) : new Date();
          const startDate = startOfDay(targetDate);
          const endDate = endOfDay(targetDate);

          // Ensure user exists
          await database.ensureUserExists(userId);

          // Get meals for the target date
          const meals = await database.getMealsForDateRange(userId, startDate, endDate);

          // Calculate totals
          const totals = {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            mealCount: meals.length,
          };

          for (const meal of meals) {
            totals.calories += meal.calories;
            totals.protein += meal.proteinGrams ?? 0;
            totals.carbs += meal.carbsGrams ?? 0;
            totals.fat += meal.fatGrams ?? 0;
          }

          const dateFormatted = format(targetDate, 'yyyy-MM-dd');
          logger.info('Generated daily summary', { date: dateFormatted, totals, userId });

          // Format output
          let summary = `📊 **Daily Summary for ${dateFormatted}**\n\n`;
          summary += `🍽️  **Meals logged:** ${totals.mealCount}\n`;
          summary += `🔥 **Total calories:** ${totals.calories}\n`;

          if (totals.protein > 0 || totals.carbs > 0 || totals.fat > 0) {
            summary += `\n**Macronutrients:**\n`;
            if (totals.protein > 0) summary += `• Protein: ${totals.protein.toFixed(1)}g\n`;
            if (totals.carbs > 0) summary += `• Carbs: ${totals.carbs.toFixed(1)}g\n`;
            if (totals.fat > 0) summary += `• Fat: ${totals.fat.toFixed(1)}g\n`;
          }

          if (totals.mealCount > 0) {
            summary += `\n**Meals:**\n`;
            for (const meal of meals) {
              const macros = [];
              if (meal.proteinGrams) macros.push(`${meal.proteinGrams}g protein`);
              if (meal.carbsGrams) macros.push(`${meal.carbsGrams}g carbs`);
              if (meal.fatGrams) macros.push(`${meal.fatGrams}g fat`);
              const macroText = macros.length > 0 ? ` (${macros.join(', ')})` : '';
              summary += `• ${meal.mealName}: ${meal.calories} cal${macroText}\n`;
            }
          } else {
            summary += `\nNo meals logged for this date.`;
          }

          return {
            content: [
              {
                type: 'text',
                text: summary,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to get today summary via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to get daily summary: ${String(error)}`,
              },
            ],
          };
        }
      },
    );

    // Register check_weight tool
    server.registerTool(
      'check_weight',
      {
        title: 'Check Weight',
        description:
          'Add/update a weight entry or check recent weight history. If a weight already exists for the date, it will be updated.',
        inputSchema: {
          userId: z.string().optional().describe('User ID (optional, defaults to "user-1")'),
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
        const userId = args.userId ?? 'user-1';

        try {
          // Ensure user exists
          await database.ensureUserExists(userId);

          if (args.weightKg !== undefined) {
            // Add or update weight entry
            const weight = await database.createWeight(userId, {
              weightKg: args.weightKg,
              loggedAt: args.loggedAt ? new Date(args.loggedAt) : undefined,
            });

            logger.info('Weight added/updated successfully via MCP tool', {
              weightId: weight.id,
              weightKg: weight.weightKg,
              userId,
            });

            const loggedAtText = format(weight.loggedAt, 'yyyy-MM-dd');

            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Weight logged: ${weight.weightKg} kg on ${loggedAtText}`,
                },
              ],
            };
          } else {
            // Show recent weight history
            const recentWeights = await database.getRecentWeights(userId, 7);

            if (recentWeights.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: '📊 No weight entries found. Use the weightKg parameter to log your weight.',
                  },
                ],
              };
            }

            const latestWeight = recentWeights[0]!;
            const previousWeight = recentWeights[1];

            let summary = `📊 **Recent Weight History**\n\n`;
            summary += `⚖️  **Current weight:** ${latestWeight.weightKg} kg (${format(latestWeight.loggedAt, 'yyyy-MM-dd')})\n`;

            if (previousWeight) {
              const change = latestWeight.weightKg - previousWeight.weightKg;
              const changeText = change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
              const emoji = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
              summary += `${emoji} **Change:** ${changeText} kg from ${format(previousWeight.loggedAt, 'yyyy-MM-dd')}\n`;
            }

            if (recentWeights.length > 1) {
              summary += `\n**Last ${recentWeights.length} entries:**\n`;
              for (const weight of recentWeights) {
                summary += `• ${format(weight.loggedAt, 'yyyy-MM-dd')}: ${weight.weightKg} kg\n`;
              }
            }

            logger.info('Generated weight history', { userId, entryCount: recentWeights.length });

            return {
              content: [
                {
                  type: 'text',
                  text: summary,
                },
              ],
            };
          }
        } catch (error) {
          logger.error('Failed to handle weight via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to handle weight: ${String(error)}`,
              },
            ],
          };
        }
      },
    );

    // Start server with selected transport
    if (TRANSPORT_TYPE === 'http') {
      await startHTTPServer(server);
    } else {
      // Default: Stdio Transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info('Calorie Tracker MCP Server started with stdio transport');
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function startHTTPServer(server: McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  // Store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      protocol: 'MCP',
      version: '2025-03-26',
      transport: 'Streamable HTTP'
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

    try {
      // Create new transport for new sessions
      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport!;
            logger.info('Created new MCP session', { sessionId: sid });
          }
        });

        // Set up close handler
        transport.onclose = () => {
          if (transport!.sessionId) {
            delete transports[transport!.sessionId];
            logger.info('MCP session closed', { sessionId: transport!.sessionId });
          }
        };

        // Connect server to transport
        await server.connect(transport);
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
      endpoint: `http://localhost:${HTTP_PORT}/mcp`
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
