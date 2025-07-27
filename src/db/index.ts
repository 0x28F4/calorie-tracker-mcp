import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
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

export class Database {
  private db: sqlite3.Database;

  constructor(config: AppConfig) {
    this.db = new sqlite3.Database(config.databasePath);
    this.db.run('PRAGMA foreign_keys = ON');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Read schema file
      const schemaPath = join(process.cwd(), 'src', 'db', 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');

      // Execute schema
      this.db.exec(schema, (error) => {
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
      const id = randomUUID();
      const now = new Date().toISOString();
      const loggedAtDate = format(input.loggedAt ?? new Date(), 'yyyy-MM-dd');

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
        function (error) {
          if (error) {
            logger.error('Failed to create weight entry', error);
            reject(error);
          } else {
            logger.info('Created weight entry', { id: weight.id, weightKg: weight.weightKg });
            resolve(weight);
          }
        },
      );
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
