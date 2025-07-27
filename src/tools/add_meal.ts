import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/index.js';
import { logger } from '../utils/logger.js';

export const addMealTool: Tool = {
  name: 'add_meal',
  description: 'Add a meal entry to the calorie tracker',
  inputSchema: {
    type: 'object',
    properties: {
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

export async function handleAddMeal(
  args: unknown,
  database: Database,
  userId = 'user-1',
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const input = args as {
      mealName: string;
      calories: number;
      proteinGrams?: number;
      carbsGrams?: number;
      fatGrams?: number;
      loggedAt?: string;
    };

    // Validate required fields
    if (!input.mealName || typeof input.mealName !== 'string') {
      throw new Error('mealName is required and must be a string');
    }

    if (!input.calories || typeof input.calories !== 'number' || input.calories < 0) {
      throw new Error('calories is required and must be a positive number');
    }

    // Ensure user exists
    await database.ensureUserExists(userId);

    // Create meal entry
    const meal = await database.createMeal(userId, {
      mealName: input.mealName,
      calories: input.calories,
      proteinGrams: input.proteinGrams,
      carbsGrams: input.carbsGrams,
      fatGrams: input.fatGrams,
      loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined,
    });

    logger.info('Meal added successfully via MCP tool', { mealId: meal.id, mealName: meal.mealName });

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
