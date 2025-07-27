import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/index.js';
import { format } from 'date-fns';
import { logger } from '../utils/logger.js';

export const checkWeightTool: Tool = {
  name: 'check_weight',
  description: 'Add a weight entry or check recent weight history',
  inputSchema: {
    type: 'object',
    properties: {
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

export async function handleCheckWeight(
  args: unknown,
  database: Database,
  userId = 'user-1',
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const input = args as {
      weightKg?: number;
      loggedAt?: string;
    };

    // Ensure user exists
    await database.ensureUserExists(userId);

    if (input.weightKg !== undefined) {
      // Add weight entry
      if (input.weightKg <= 0) {
        throw new Error('Weight must be a positive number');
      }

      const weight = await database.createWeight(userId, {
        weightKg: input.weightKg,
        loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined,
      });

      logger.info('Weight added successfully via MCP tool', { weightId: weight.id, weightKg: weight.weightKg });

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
      const recentWeights = await getRecentWeights(database, userId, 7);

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

async function getRecentWeights(
  database: Database,
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

    database.getDb().all(query, [userId, limit], (error, rows: unknown[]) => {
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
