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
    // Register add_meals tool
    this.server.registerTool(
      'add_meals',
      {
        title: 'Add Meals',
        description: 'Add one or more meal entries to the calorie tracker',
        inputSchema: {
          meals: z
            .array(
              z.object({
                mealName: z
                  .string()
                  .min(1, 'Meal name is required')
                  .describe('Name of the meal (e.g., "Breakfast", "Chicken Salad")'),
                calories: z
                  .number()
                  .min(0, 'Calories must be a positive number')
                  .describe('Total calories in the meal'),
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
              }),
            )
            .min(1, 'At least one meal is required')
            .describe('Array of meals to add'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Create meal entries
          const meals = await this.database.createMeals(
            userId,
            args.meals.map((meal) => ({
              mealName: meal.mealName,
              calories: meal.calories,
              proteinGrams: meal.proteinGrams,
              carbsGrams: meal.carbsGrams,
              fatGrams: meal.fatGrams,
              loggedAt: meal.loggedAt ? new Date(meal.loggedAt) : undefined,
            })),
          );

          logger.info('Meals added successfully via MCP tool', { count: meals.length, userId });

          // Format results
          const results = meals.map((meal) => {
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

            return `✅ Added meal: ${meal.mealName} - ${meal.calories} calories${macroText}\nLogged for: ${loggedAtText}`;
          });

          const summary = `Successfully added ${meals.length} meal${meals.length > 1 ? 's' : ''}`;

          return {
            content: [
              {
                type: 'text',
                text: `${results.join('\n\n')}\n\n${summary}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to add meals via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to add meals: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

          // Get moving average configuration
          const movingAvgDays = args.weightMovingAvgDays ?? 3;

          // Fetch weights for extended range (N additional days before start date for moving average)
          const extendedStartDate = new Date(startDate);
          extendedStartDate.setDate(extendedStartDate.getDate() - movingAvgDays);
          const weightsInExtendedRange = await this.database.getWeightsForDateRange(userId, extendedStartDate, endDate);

          // Create a map of dates to weights for efficient lookup
          const weightMap = new Map<string, number>();
          weightsInExtendedRange.forEach((weight) => {
            weightMap.set(weight.date, weight.weightKg);
          });

          // Build daily stats by combining meals and weights with moving averages
          const dailyStats = dailyMeals.map((meal) => {
            const deficit = metabolicRate - meal.totalCalories;
            const rawWeight = weightMap.get(meal.date) ?? null;

            // Calculate moving average for this day
            let weightMovingAvg: number | null = null;
            if (rawWeight !== null) {
              // Get all weights up to this date for moving average calculation
              const currentDate = new Date(meal.date);
              const relevantWeights: number[] = [];

              // Look back N days from current date
              for (let i = 0; i < movingAvgDays; i++) {
                const lookbackDate = new Date(currentDate);
                lookbackDate.setDate(lookbackDate.getDate() - i);
                const dateStr = lookbackDate.toISOString().split('T')[0] ?? '';
                const weight = weightMap.get(dateStr);
                if (weight !== undefined) {
                  relevantWeights.push(weight);
                }
              }

              if (relevantWeights.length > 0) {
                weightMovingAvg =
                  Math.round((relevantWeights.reduce((sum, w) => sum + w, 0) / relevantWeights.length) * 10) / 10;
              }
            }

            return {
              date: meal.date,
              totalCalories: meal.totalCalories,
              deficit,
              macros: {
                protein: meal.totalProtein,
                carbs: meal.totalCarbs,
                fat: meal.totalFat,
              },
              weight: rawWeight,
              weightMovingAvg,
            };
          });

          // Calculate totals
          const totalCalories = dailyStats.reduce((sum, day) => sum + day.totalCalories, 0);
          const totalDeficit = dailyStats.reduce((sum, day) => sum + day.deficit, 0);

          // Calculate weight difference using moving averages from first and last days
          let weightDifference: number | null = null;
          const firstDayWithWeight = dailyStats.find((day) => day.weightMovingAvg !== null);
          const lastDayWithWeight = dailyStats
            .slice()
            .reverse()
            .find((day) => day.weightMovingAvg !== null);

          if (
            firstDayWithWeight?.weightMovingAvg !== null &&
            lastDayWithWeight?.weightMovingAvg !== null &&
            firstDayWithWeight !== undefined &&
            lastDayWithWeight !== undefined
          ) {
            weightDifference =
              Math.round(((lastDayWithWeight.weightMovingAvg ?? 0) - (firstDayWithWeight.weightMovingAvg ?? 0)) * 10) /
              10;
          }

          // Build final summary
          const finalSummary = {
            dailyStats,
            totalStats: {
              totalCalories,
              totalDeficit,
              weightDifference,
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

    // Register calculate_metabolic_rate tool
    this.server.registerTool(
      'calculate_metabolic_rate',
      {
        title: 'Calculate Metabolic Rate',
        description: 'Calculate metabolic rate from historical data using a 7-day analysis window',
        inputSchema: {
          startDate: z.string().describe('Start date for 7-day analysis window (ISO format: YYYY-MM-DD)'),
          updateSettings: z
            .boolean()
            .optional()
            .describe('Whether to update user settings with calculated rate (default: false)'),
        },
      },
      async (args) => {
        const userId = this.userId;

        try {
          // Parse start date and calculate 7-day window
          const startDate = startOfDay(new Date(args.startDate));
          const endDate = endOfDay(new Date(startDate));
          endDate.setDate(endDate.getDate() + 6); // 7-day window

          logger.info('Calculating metabolic rate', { userId, startDate, endDate });

          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Get current user settings for comparison
          const currentSettings = await this.database.getUserSettings(userId);

          // Get daily meals and weights for the 7-day period
          const dailyMeals = await this.database.getDailyMealsForDateRange(userId, startDate, endDate);

          // Fetch weights with extended range for moving averages (3 days before)
          const extendedStartDate = new Date(startDate);
          extendedStartDate.setDate(extendedStartDate.getDate() - 3);
          const weightsInExtendedRange = await this.database.getWeightsForDateRange(userId, extendedStartDate, endDate);

          // Check if we have sufficient data
          if (dailyMeals.length === 0) {
            throw new Error('No meal data found for the specified 7-day period');
          }

          // Create weight map for efficient lookup
          const weightMap = new Map<string, number>();
          weightsInExtendedRange.forEach((weight) => {
            weightMap.set(weight.date, weight.weightKg);
          });

          // Calculate moving averages for first and last days
          const calculateMovingAvg = (date: Date): number | null => {
            const relevantWeights: number[] = [];
            for (let i = 0; i < 3; i++) {
              const lookbackDate = new Date(date);
              lookbackDate.setDate(lookbackDate.getDate() - i);
              const dateStr = lookbackDate.toISOString().split('T')[0] ?? '';
              const weight = weightMap.get(dateStr);
              if (weight !== undefined) {
                relevantWeights.push(weight);
              }
            }
            return relevantWeights.length > 0
              ? Math.round((relevantWeights.reduce((sum, w) => sum + w, 0) / relevantWeights.length) * 10) / 10
              : null;
          };

          const firstDayMovingAvg = calculateMovingAvg(startDate);
          const lastDayMovingAvg = calculateMovingAvg(endDate);

          // Calculate weight change
          let weightChange = 0;
          if (firstDayMovingAvg !== null && lastDayMovingAvg !== null) {
            weightChange = Math.round((lastDayMovingAvg - firstDayMovingAvg) * 10) / 10;
          }

          // Calculate average daily calories
          const totalCalories = dailyMeals.reduce((sum, meal) => sum + meal.totalCalories, 0);
          const averageDailyCalories = Math.round(totalCalories / dailyMeals.length);

          // Calculate metabolic rate using weight change factor
          // 1 kg = ~7700 calories, so daily factor = (weight change * 7700) / 7 days
          const weightChangeFactor = Math.round((weightChange * 7700) / 7);
          const calculatedMetabolicRate = averageDailyCalories + weightChangeFactor;

          // Build response
          const result = {
            calculatedMetabolicRate,
            analysisWindow: {
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate.toISOString().split('T')[0],
              averageDailyCalories,
              weightChange,
              daysWithData: dailyMeals.length,
            },
            currentSettingRate: currentSettings.metabolicRate,
          };

          // Update settings if requested
          let settingsUpdated = false;
          if (args.updateSettings) {
            await this.database.updateUserSettings(userId, {
              metabolicRate: calculatedMetabolicRate,
            });
            settingsUpdated = true;
          }

          // Format response
          const analysisText = `**Metabolic Rate Analysis (7-day window)**

📊 **Results:**
- **Calculated Rate**: ${calculatedMetabolicRate} cal/day
- **Current Setting**: ${currentSettings.metabolicRate} cal/day
- **Difference**: ${calculatedMetabolicRate - currentSettings.metabolicRate > 0 ? '+' : ''}${calculatedMetabolicRate - currentSettings.metabolicRate} cal/day

📈 **Analysis Window**: ${result.analysisWindow.startDate} to ${result.analysisWindow.endDate}
- **Average Daily Intake**: ${averageDailyCalories} calories
- **Weight Change**: ${weightChange > 0 ? '+' : ''}${weightChange}kg
- **Days with Data**: ${dailyMeals.length}/7

💡 **Calculation**: Based on average intake (${averageDailyCalories}) + weight change factor (${weightChangeFactor})

${settingsUpdated ? '✅ **Settings Updated**: Your metabolic rate has been updated to ' + calculatedMetabolicRate + ' cal/day' : ''}

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``;

          return {
            content: [
              {
                type: 'text',
                text: analysisText,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to calculate metabolic rate', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to calculate metabolic rate: ${String(error)}`,
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
