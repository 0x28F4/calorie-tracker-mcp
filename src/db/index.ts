import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import type { AppConfig } from '../types/config.js';
import type {
  UserSettings,
  Meal,
  Weight,
  CreateMealInput,
  CreateWeightInput,
  CreateUserSettingsInput,
} from '../types/database.js';
import { logger } from '../utils/logger.js';

const DATABASE_SCHEMA = `
-- Calorie Tracker Database Schema

-- User Settings Table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    metabolic_rate INTEGER NOT NULL DEFAULT 2000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Meals Table
CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    meal_name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein_grams REAL,
    carbs_grams REAL,
    fat_grams REAL,
    logged_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_settings(user_id)
);

-- Weights Table
CREATE TABLE IF NOT EXISTS weights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    logged_at DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_settings(user_id),
    UNIQUE(user_id, logged_at)
);
`;

export class Database {
  private db: sqlite3.Database;

  constructor(config: AppConfig) {
    this.db = new sqlite3.Database(config.databasePath);
    this.db.run('PRAGMA foreign_keys = ON');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Execute embedded schema
      this.db.exec(DATABASE_SCHEMA, (error) => {
        if (error) {
          logger.error('Failed to initialize database schema', error);
          reject(error);
        } else {
          logger.info('Database schema initialized successfully');
          resolve();
        }
      });
    });
  }

  async ensureUserExists(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT user_id FROM user_settings WHERE user_id = ?', [userId], (error, row) => {
        if (error) {
          reject(error);
          return;
        }

        if (!row) {
          // Create default user settings
          this.createUserSettings({
            userId,
            timezone: 'UTC',
            metabolicRate: 2000,
          })
            .then(() => resolve())
            .catch(reject);
        } else {
          resolve();
        }
      });
    });
  }

  async createUserSettings(input: CreateUserSettingsInput): Promise<UserSettings> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const settings: UserSettings = {
        userId: input.userId,
        timezone: input.timezone ?? 'UTC',
        metabolicRate: input.metabolicRate ?? 2000,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };

      this.db.run(
        `INSERT INTO user_settings (user_id, timezone, metabolic_rate, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [settings.userId, settings.timezone, settings.metabolicRate, now, now],
        function (error) {
          if (error) {
            logger.error('Failed to create user settings', error);
            reject(error);
          } else {
            logger.info('Created user settings', { userId: input.userId });
            resolve(settings);
          }
        },
      );
    });
  }

  async createMeal(userId: string, input: CreateMealInput): Promise<Meal> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const loggedAt = (input.loggedAt ?? new Date()).toISOString();

      const meal: Meal = {
        id,
        userId,
        mealName: input.mealName,
        calories: input.calories,
        proteinGrams: input.proteinGrams,
        carbsGrams: input.carbsGrams,
        fatGrams: input.fatGrams,
        loggedAt: new Date(loggedAt),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };

      this.db.run(
        `INSERT INTO meals (id, user_id, meal_name, calories, protein_grams, carbs_grams, fat_grams, logged_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meal.id,
          meal.userId,
          meal.mealName,
          meal.calories,
          meal.proteinGrams,
          meal.carbsGrams,
          meal.fatGrams,
          loggedAt,
          now,
          now,
        ],
        function (error) {
          if (error) {
            logger.error('Failed to create meal', error);
            reject(error);
          } else {
            logger.info('Created meal', { id: meal.id, mealName: meal.mealName });
            resolve(meal);
          }
        },
      );
    });
  }

  async createWeight(userId: string, input: CreateWeightInput): Promise<Weight> {
    return new Promise((resolve, reject) => {
      const loggedAtDate = format(input.loggedAt ?? new Date(), 'yyyy-MM-dd');

      // Check if weight already exists for this user and date
      this.db.get(
        'SELECT id, weight_kg, logged_at, created_at FROM weights WHERE user_id = ? AND logged_at = ?',
        [userId, loggedAtDate],
        (error, existingRow: unknown) => {
          if (error) {
            logger.error('Failed to check existing weight', error);
            reject(error);
            return;
          }

          if (existingRow) {
            // Update existing weight entry
            const dbRow = existingRow as {
              id: string;
              weight_kg: number;
              logged_at: string;
              created_at: string;
            };

            this.db.run(
              'UPDATE weights SET weight_kg = ? WHERE user_id = ? AND logged_at = ?',
              [input.weightKg, userId, loggedAtDate],
              function (updateError) {
                if (updateError) {
                  logger.error('Failed to update weight entry', updateError);
                  reject(updateError);
                } else {
                  const weight: Weight = {
                    id: dbRow.id,
                    userId,
                    weightKg: input.weightKg,
                    loggedAt: new Date(dbRow.logged_at),
                    createdAt: new Date(dbRow.created_at),
                  };
                  logger.info('Updated weight entry', {
                    id: weight.id,
                    weightKg: weight.weightKg,
                    previousWeight: dbRow.weight_kg,
                  });
                  resolve(weight);
                }
              },
            );
          } else {
            // Create new weight entry
            const id = randomUUID();
            const now = new Date().toISOString();

            const weight: Weight = {
              id,
              userId,
              weightKg: input.weightKg,
              loggedAt: new Date(loggedAtDate),
              createdAt: new Date(now),
            };

            this.db.run(
              `INSERT INTO weights (id, user_id, weight_kg, logged_at, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [weight.id, weight.userId, weight.weightKg, loggedAtDate, now],
              function (insertError) {
                if (insertError) {
                  logger.error('Failed to create weight entry', insertError);
                  reject(insertError);
                } else {
                  logger.info('Created weight entry', { id: weight.id, weightKg: weight.weightKg });
                  resolve(weight);
                }
              },
            );
          }
        },
      );
    });
  }

  async getMealsForDateRange(
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

      this.db.all(query, [userId, startDate.toISOString(), endDate.toISOString()], (error, rows: unknown[]) => {
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

  async getMealsInDateRange(
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
    return this.getMealsForDateRange(userId, startDate, endDate);
  }

  async getWeightForDate(
    userId: string,
    date: string,
  ): Promise<{
    id: string;
    weightKg: number;
    loggedAt: Date;
  }> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, weight_kg, logged_at
        FROM weights 
        WHERE user_id = ? AND logged_at = ?
      `;

      this.db.get(query, [userId, date], (error, row: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        if (!row) {
          reject(new Error(`No weight found for date ${date}`));
          return;
        }

        const dbRow = row as {
          id: string;
          weight_kg: number;
          logged_at: string;
        };

        resolve({
          id: dbRow.id,
          weightKg: dbRow.weight_kg,
          loggedAt: new Date(dbRow.logged_at),
        });
      });
    });
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT user_id, timezone, metabolic_rate, created_at, updated_at
        FROM user_settings 
        WHERE user_id = ?
      `;

      this.db.get(query, [userId], (error, row: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        const dbRow = row as {
          user_id: string;
          timezone: string;
          metabolic_rate: number;
          created_at: string;
          updated_at: string;
        };

        resolve({
          userId: dbRow.user_id,
          timezone: dbRow.timezone,
          metabolicRate: dbRow.metabolic_rate,
          createdAt: new Date(dbRow.created_at),
          updatedAt: new Date(dbRow.updated_at),
        });
      });
    });
  }

  async getRecentWeights(
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

      this.db.all(query, [userId, limit], (error, rows: unknown[]) => {
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

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close((error) => {
        if (error) {
          logger.error('Error closing database', error);
        } else {
          logger.info('Database connection closed');
        }
        resolve();
      });
    });
  }
}
