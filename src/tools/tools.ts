import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/index.js';
import { startOfDay, endOfDay, format } from 'date-fns';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

// Zod schemas for input validation
const baseArgsSchema = z.object({
  userId: z.string().optional(),
});

const addMealArgsSchema = baseArgsSchema.extend({
  mealName: z.string().min(1, 'Meal name is required'),
  calories: z.number().min(0, 'Calories must be a positive number'),
  proteinGrams: z.number().min(0, 'Protein must be a positive number').optional(),
  carbsGrams: z.number().min(0, 'Carbs must be a positive number').optional(),
  fatGrams: z.number().min(0, 'Fat must be a positive number').optional(),
  loggedAt: z.string().datetime().optional(),
});

const getTodaySummaryArgsSchema = baseArgsSchema.extend({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
});

const checkWeightArgsSchema = baseArgsSchema.extend({
  weightKg: z.number().min(0, 'Weight must be a positive number').optional(),
  loggedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
});

export class Tools {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  getTools(): Tool[] {
    return [this.addMealTool, this.getTodaySummaryTool, this.checkWeightTool];
  }

  private addMealTool: Tool = {
    name: 'add_meal',
    description: 'Add a meal entry to the calorie tracker',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (optional, defaults to "user-1")',
        },
        mealName: {
          type: 'string',
          description: 'Name of the meal (e.g., "Breakfast", "Chicken Salad")',
        },
        calories: {
          type: 'number',
          description: 'Total calories in the meal',
          minimum: 0,
        },
        proteinGrams: {
          type: 'number',
          description: 'Protein content in grams (optional)',
          minimum: 0,
        },
        carbsGrams: {
          type: 'number',
          description: 'Carbohydrate content in grams (optional)',
          minimum: 0,
        },
        fatGrams: {
          type: 'number',
          description: 'Fat content in grams (optional)',
          minimum: 0,
        },
        loggedAt: {
          type: 'string',
          description: 'ISO timestamp when meal was consumed (optional, defaults to now)',
          format: 'date-time',
        },
      },
      required: ['mealName', 'calories'],
    },
  };

  private getTodaySummaryTool: Tool = {
    name: 'get_today_summary',
    description: 'Get summary of calories and nutrition for today',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (optional, defaults to "user-1")',
        },
        date: {
          type: 'string',
          description: 'Date to get summary for (YYYY-MM-DD format, optional, defaults to today)',
          format: 'date',
        },
      },
    },
  };

  private checkWeightTool: Tool = {
    name: 'check_weight',
    description: 'Add a weight entry or check recent weight history',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (optional, defaults to "user-1")',
        },
        weightKg: {
          type: 'number',
          description: 'Weight in kilograms to log (optional, if not provided will show recent history)',
          minimum: 0,
        },
        loggedAt: {
          type: 'string',
          description: 'Date for weight entry (YYYY-MM-DD format, optional, defaults to today)',
          format: 'date',
        },
      },
    },
  };

  async handleTool(toolName: string, args: unknown): Promise<{ content: { type: string; text: string }[] }> {
    try {
      switch (toolName) {
        case 'add_meal': {
          const validatedArgs = addMealArgsSchema.parse(args);
          const userId = validatedArgs.userId ?? 'user-1';
          return this.handleAddMeal(validatedArgs, userId);
        }
        case 'get_today_summary': {
          const validatedArgs = getTodaySummaryArgsSchema.parse(args);
          const userId = validatedArgs.userId ?? 'user-1';
          return this.handleGetTodaySummary(validatedArgs, userId);
        }
        case 'check_weight': {
          const validatedArgs = checkWeightArgsSchema.parse(args);
          const userId = validatedArgs.userId ?? 'user-1';
          return this.handleCheckWeight(validatedArgs, userId);
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        logger.error('Schema validation failed', { toolName, errors: error.errors });
        return {
          content: [
            {
              type: 'text',
              text: `❌ Invalid input: ${errorMessages}`,
            },
          ],
        };
      }
      throw error;
    }
  }

  private async handleAddMeal(
    input: z.infer<typeof addMealArgsSchema>,
    userId: string,
  ): Promise<{ content: { type: string; text: string }[] }> {
    try {
      // Ensure user exists
      await this.database.ensureUserExists(userId);

      // Create meal entry
      const meal = await this.database.createMeal(userId, {
        mealName: input.mealName,
        calories: input.calories,
        proteinGrams: input.proteinGrams,
        carbsGrams: input.carbsGrams,
        fatGrams: input.fatGrams,
        loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined,
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
  }

  private async handleGetTodaySummary(
    input: z.infer<typeof getTodaySummaryArgsSchema>,
    userId: string,
  ): Promise<{ content: { type: string; text: string }[] }> {
    try {
      // Parse target date (default to today)
      const targetDate = input.date ? new Date(input.date) : new Date();
      const startDate = startOfDay(targetDate);
      const endDate = endOfDay(targetDate);

      // Ensure user exists
      await this.database.ensureUserExists(userId);

      // Get meals for the target date
      const meals = await this.getMealsForDateRange(userId, startDate, endDate);

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
  }

  private async handleCheckWeight(
    input: z.infer<typeof checkWeightArgsSchema>,
    userId: string,
  ): Promise<{ content: { type: string; text: string }[] }> {
    try {
      // Ensure user exists
      await this.database.ensureUserExists(userId);

      if (input.weightKg !== undefined) {
        // Add weight entry

        const weight = await this.database.createWeight(userId, {
          weightKg: input.weightKg,
          loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined,
        });

        logger.info('Weight added successfully via MCP tool', {
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
        const recentWeights = await this.getRecentWeights(userId, 7);

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
  }

  private async getMealsForDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    {
      id: string;
      mealName: string;
      calories: number;
      proteinGrams: number | null;
      carbsGrams: number | null;
      fatGrams: number | null;
      loggedAt: Date;
    }[]
  > {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, meal_name, calories, protein_grams, carbs_grams, fat_grams, logged_at
        FROM meals 
        WHERE user_id = ? AND logged_at BETWEEN ? AND ?
        ORDER BY logged_at ASC
      `;

      this.database
        .getDb()
        .all(query, [userId, startDate.toISOString(), endDate.toISOString()], (error, rows: unknown[]) => {
          if (error) {
            reject(error);
            return;
          }

          const meals = rows.map((row) => {
            const dbRow = row as {
              id: string;
              meal_name: string;
              calories: number;
              protein_grams: number | null;
              carbs_grams: number | null;
              fat_grams: number | null;
              logged_at: string;
            };
            return {
              id: dbRow.id,
              mealName: dbRow.meal_name,
              calories: dbRow.calories,
              proteinGrams: dbRow.protein_grams,
              carbsGrams: dbRow.carbs_grams,
              fatGrams: dbRow.fat_grams,
              loggedAt: new Date(dbRow.logged_at),
            };
          });

          resolve(meals);
        });
    });
  }

  private async getRecentWeights(
    userId: string,
    limit: number,
  ): Promise<
    {
      id: string;
      weightKg: number;
      loggedAt: Date;
    }[]
  > {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, weight_kg, logged_at
        FROM weights 
        WHERE user_id = ?
        ORDER BY logged_at DESC
        LIMIT ?
      `;

      this.database.getDb().all(query, [userId, limit], (error, rows: unknown[]) => {
        if (error) {
          reject(error);
          return;
        }

        const weights = rows.map((row) => {
          const dbRow = row as {
            id: string;
            weight_kg: number;
            logged_at: string;
          };
          return {
            id: dbRow.id,
            weightKg: dbRow.weight_kg,
            loggedAt: new Date(dbRow.logged_at),
          };
        });

        resolve(weights);
      });
    });
  }
}
