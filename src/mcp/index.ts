import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { addDays, format, startOfDay, endOfDay } from 'date-fns';
import { logger } from '../utils/logger.js';
import { Database } from '../db/index.js';

// User-contextual MCP Server that binds a user ID to all tools
export class McpServer {
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

    // Register list_meals tool
    this.server.registerTool(
      'list_meals',
      {
        title: 'List Meals',
        description: 'List recent meal entries with their IDs',
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe('Number of meals to return (default: 10, max: 100)'),
        },
      },
      async (args) => {
        const userId = this.userId;
        const limit = args.limit ?? 10;

        try {
          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Get recent meals
          const meals = await this.database.getRecentMeals(userId, limit);

          logger.info('Listed meals successfully via MCP tool', { count: meals.length, userId });

          if (meals.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: '📭 No meals found.',
                },
              ],
            };
          }

          // Format meals for display
          const mealsList = meals.map((meal) => {
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
            const macroText = macros.length > 0 ? `\n   Macros: ${macros.join(', ')}` : '';

            // Format the logged date
            const loggedAtText = format(meal.loggedAt, 'PPpp');

            return `🍽️ **${meal.mealName}** - ${meal.calories} calories
   ID: ${meal.id}
   Logged: ${loggedAtText}${macroText}`;
          });

          const summary = `📋 **Recent Meals** (showing ${meals.length} of last ${limit})`;

          return {
            content: [
              {
                type: 'text',
                text: `${summary}\n\n${mealsList.join('\n\n')}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to list meals via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to list meals: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );

    // Register add_weights tool
    this.server.registerTool(
      'add_weights',
      {
        title: 'Add Weights',
        description:
          'Add one or more weight entries to the calorie tracker with required timestamps. Updates existing entries for the same date.',
        inputSchema: {
          weights: z
            .array(
              z.object({
                weightKg: z.number().min(0, 'Weight must be a positive number').describe('Weight in kilograms'),
                loggedAt: z
                  .string()
                  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
                  .refine(
                    (dateString) => {
                      const date = new Date(dateString);
                      // Check if it's a valid date and the string representation matches
                      return !isNaN(date.getTime()) && date.toISOString().startsWith(dateString);
                    },
                    { message: 'Date must be a valid date in YYYY-MM-DD format' },
                  )
                  .describe('Date for weight entry (YYYY-MM-DD format, date only)'),
              }),
            )
            .min(1, 'At least one weight entry is required')
            .describe('Array of weight entries to add'),
        },
      },
      async (args) => {
        const userId = this.userId; // Bound to this instance!

        try {
          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Create weight entries
          const weights = await this.database.createWeights(
            userId,
            args.weights.map((weight) => ({
              weightKg: weight.weightKg,
              loggedAt: weight.loggedAt, // Pass date string directly
            })),
          );

          logger.info('Weights added successfully via MCP tool', { count: weights.length, userId });

          // Format results
          const results = weights.map((weight) => {
            const weightDate = weight.loggedAt instanceof Date ? weight.loggedAt : new Date(weight.loggedAt);
            const dateDisplay = format(weightDate, 'MMMM do, yyyy');

            return `✅ Weight logged: ${weight.weightKg}kg for ${dateDisplay}`;
          });

          const summary = `Successfully added ${weights.length} weight entr${weights.length > 1 ? 'ies' : 'y'}`;

          return {
            content: [
              {
                type: 'text',
                text: `${results.join('\n\n')}\n\n${summary}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to add weights via MCP tool', error);
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to add weights: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          const extendedStartDateStr = format(extendedStartDate, 'yyyy-MM-dd');
          const endDateStr = format(endDate, 'yyyy-MM-dd');
          const weightsInExtendedRange = await this.database.getWeightsForDateRange(
            userId,
            extendedStartDateStr,
            endDateStr,
          );

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
        },
      },
      async (args) => {
        const userId = this.userId;

        try {
          // Helper function for date-only operations
          const addDaysToDateString = (dateStr: string, days: number): string => {
            const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone edge cases
            const newDate = addDays(date, days);
            return format(newDate, 'yyyy-MM-dd');
          };

          // Work with pure date strings
          const startDateStr = args.startDate; // e.g. '2024-01-03'
          const endDateStr = addDaysToDateString(startDateStr, 6); // 7-day window

          logger.info('Calculating metabolic rate', { userId, startDateStr, endDateStr });

          // Ensure user exists
          await this.database.ensureUserExists(userId);

          // Get current user settings for comparison
          const currentSettings = await this.database.getUserSettings(userId);

          // Get daily meals for the 7-day period
          const startDateObj = new Date(startDateStr + 'T00:00:00Z');
          const endDateObj = new Date(endDateStr + 'T23:59:59Z');
          const dailyMeals = await this.database.getDailyMealsForDateRange(userId, startDateObj, endDateObj);

          // Fetch weights with extended range for moving averages (3 days before)
          const extendedStartDateStr = addDaysToDateString(startDateStr, -3);
          const weightsInExtendedRange = await this.database.getWeightsForDateRange(
            userId,
            extendedStartDateStr,
            endDateStr,
          );

          // Check if we have sufficient data
          if (dailyMeals.length === 0) {
            throw new Error('No meal data found for the specified 7-day period');
          }

          // Create weight map for efficient lookup
          const weightMap = new Map<string, number>();
          weightsInExtendedRange.forEach((weight) => {
            weightMap.set(weight.date, weight.weightKg);
          });

          // Calculate moving averages for first and last days using pure date strings
          const calculateMovingAvg = (dateStr: string): number | null => {
            const relevantWeights: number[] = [];

            for (let i = 0; i < 3; i++) {
              const lookbackDateStr = addDaysToDateString(dateStr, -i);
              const weight = weightMap.get(lookbackDateStr);
              if (weight !== undefined) {
                relevantWeights.push(weight);
              }
            }
            return relevantWeights.length > 0
              ? Math.round((relevantWeights.reduce((sum, w) => sum + w, 0) / relevantWeights.length) * 10) / 10
              : null;
          };

          const firstDayMovingAvg = calculateMovingAvg(startDateStr);
          const lastDayMovingAvg = calculateMovingAvg(endDateStr);

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
          const calculatedMetabolicRate = averageDailyCalories - weightChangeFactor;

          // Build response
          const result = {
            calculatedMetabolicRate,
            analysisWindow: {
              startDate: startDateStr,
              endDate: endDateStr,
              averageDailyCalories,
              weightChange,
              daysWithData: dailyMeals.length,
            },
            currentSettingRate: currentSettings.metabolicRate,
          };

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
