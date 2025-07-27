import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/index.js';
import { startOfDay, endOfDay, format } from 'date-fns';
import { logger } from '../utils/logger.js';

export const getTodaySummaryTool: Tool = {
  name: 'get_today_summary',
  description: 'Get summary of calories and nutrition for today',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Date to get summary for (YYYY-MM-DD format, optional, defaults to today)',
        format: 'date',
      },
    },
  },
};

export async function handleGetTodaySummary(
  args: unknown,
  database: Database,
  userId = 'user-1',
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const input = args as {
      date?: string;
    };

    // Parse target date (default to today)
    const targetDate = input.date ? new Date(input.date) : new Date();
    const startDate = startOfDay(targetDate);
    const endDate = endOfDay(targetDate);

    // Ensure user exists
    await database.ensureUserExists(userId);

    // Get meals for the target date
    const meals = await getMealsForDateRange(database, userId, startDate, endDate);

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
    logger.info('Generated daily summary', { date: dateFormatted, totals });

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

async function getMealsForDateRange(
  database: Database,
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

    database.getDb().all(query, [userId, startDate.toISOString(), endDate.toISOString()], (error, rows: unknown[]) => {
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
