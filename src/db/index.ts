import { open, Database as SqliteDatabase } from 'sqlite';
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
  private _db: SqliteDatabase | null = null;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  private get db(): SqliteDatabase {
    if (!this._db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this._db;
  }

  async initialize(): Promise<void> {
    try {
      this._db = await open({
        filename: this.config.databasePath,
        driver: sqlite3.Database,
      });

      await this.db.exec('PRAGMA foreign_keys = ON');
      await this.db.exec(DATABASE_SCHEMA);

      logger.info('Database schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database schema', error);
      throw error;
    }
  }

  async ensureUserExists(userId: string): Promise<void> {
    const existingUser = await this.db.get<{ user_id: string }>('SELECT user_id FROM user_settings WHERE user_id = ?', [
      userId,
    ]);

    if (!existingUser) {
      await this.createUserSettings({
        userId,
        timezone: 'UTC',
        metabolicRate: 2000,
      });
    }
  }

  async createUserSettings(input: CreateUserSettingsInput): Promise<UserSettings> {
    const now = new Date().toISOString();
    const settings: UserSettings = {
      userId: input.userId,
      timezone: input.timezone ?? 'UTC',
      metabolicRate: input.metabolicRate ?? 2000,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    try {
      await this.db.run(
        `INSERT INTO user_settings (user_id, timezone, metabolic_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [settings.userId, settings.timezone, settings.metabolicRate, now, now],
      );
      logger.info('Created user settings', { userId: input.userId });
      return settings;
    } catch (error) {
      logger.error('Failed to create user settings', error);
      throw error;
    }
  }

  async createMeal(userId: string, input: CreateMealInput): Promise<Meal> {
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

    try {
      await this.db.run(
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
      );
      logger.info('Created meal', { id: meal.id, mealName: meal.mealName });
      return meal;
    } catch (error) {
      logger.error('Failed to create meal', error);
      throw error;
    }
  }

  async createWeight(userId: string, input: CreateWeightInput): Promise<Weight> {
    const loggedAtDate = format(input.loggedAt ?? new Date(), 'yyyy-MM-dd');

    try {
      // Check if weight already exists for this user and date
      const existingRow = await this.db.get<{
        id: string;
        weight_kg: number;
        logged_at: string;
        created_at: string;
      }>('SELECT id, weight_kg, logged_at, created_at FROM weights WHERE user_id = ? AND logged_at = ?', [
        userId,
        loggedAtDate,
      ]);

      if (existingRow) {
        // Update existing weight entry
        await this.db.run('UPDATE weights SET weight_kg = ? WHERE user_id = ? AND logged_at = ?', [
          input.weightKg,
          userId,
          loggedAtDate,
        ]);

        const weight: Weight = {
          id: existingRow.id,
          userId,
          weightKg: input.weightKg,
          loggedAt: new Date(existingRow.logged_at),
          createdAt: new Date(existingRow.created_at),
        };

        logger.info('Updated weight entry', {
          id: weight.id,
          weightKg: weight.weightKg,
          previousWeight: existingRow.weight_kg,
        });
        return weight;
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

        await this.db.run(
          `INSERT INTO weights (id, user_id, weight_kg, logged_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [weight.id, weight.userId, weight.weightKg, loggedAtDate, now],
        );

        logger.info('Created weight entry', { id: weight.id, weightKg: weight.weightKg });
        return weight;
      }
    } catch (error) {
      logger.error('Failed to create/update weight entry', error);
      throw error;
    }
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
    const query = `
      SELECT id, meal_name, calories, protein_grams, carbs_grams, fat_grams, logged_at
      FROM meals 
      WHERE user_id = ? AND logged_at BETWEEN ? AND ?
      ORDER BY logged_at ASC
    `;

    try {
      const rows = await this.db.all<
        {
          id: string;
          meal_name: string;
          calories: number;
          protein_grams: number | null;
          carbs_grams: number | null;
          fat_grams: number | null;
          logged_at: string;
        }[]
      >(query, [userId, startDate.toISOString(), endDate.toISOString()]);

      const meals = rows.map((row) => ({
        id: row.id,
        mealName: row.meal_name,
        calories: row.calories,
        proteinGrams: row.protein_grams,
        carbsGrams: row.carbs_grams,
        fatGrams: row.fat_grams,
        loggedAt: new Date(row.logged_at),
      }));

      return meals;
    } catch (error) {
      logger.error('Failed to get meals for date range', error);
      throw error;
    }
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

  async getUserSettings(userId: string): Promise<UserSettings> {
    const query = `
      SELECT user_id, timezone, metabolic_rate, created_at, updated_at
      FROM user_settings 
      WHERE user_id = ?
    `;

    try {
      const row = await this.db.get<{
        user_id: string;
        timezone: string;
        metabolic_rate: number;
        created_at: string;
        updated_at: string;
      }>(query, [userId]);

      if (!row) {
        throw new Error(`User settings not found for user: ${userId}`);
      }

      return {
        userId: row.user_id,
        timezone: row.timezone,
        metabolicRate: row.metabolic_rate,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      logger.error('Failed to get user settings', error);
      throw error;
    }
  }

  async updateUserSettings(
    userId: string,
    updates: {
      timezone?: string;
      metabolicRate?: number;
    },
  ): Promise<UserSettings> {
    // Build dynamic update query
    const updateFields: string[] = [];
    const values: unknown[] = [];

    if (updates.timezone !== undefined) {
      updateFields.push('timezone = ?');
      values.push(updates.timezone);
    }

    if (updates.metabolicRate !== undefined) {
      updateFields.push('metabolic_rate = ?');
      values.push(updates.metabolicRate);
    }

    if (updateFields.length === 0) {
      // No updates provided, just return current settings
      return await this.getUserSettings(userId);
    }

    updateFields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);

    const query = `
      UPDATE user_settings 
      SET ${updateFields.join(', ')} 
      WHERE user_id = ?
    `;

    try {
      await this.db.run(query, values);
      logger.info('Updated user settings', { userId, updates });

      // Return updated settings
      return await this.getUserSettings(userId);
    } catch (error) {
      logger.error('Failed to update user settings', error);
      throw error;
    }
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
    const query = `
      SELECT id, weight_kg, logged_at
      FROM weights 
      WHERE user_id = ?
      ORDER BY logged_at DESC
      LIMIT ?
    `;

    try {
      const rows = await this.db.all<
        {
          id: string;
          weight_kg: number;
          logged_at: string;
        }[]
      >(query, [userId, limit]);

      const weights = rows.map((row) => ({
        id: row.id,
        weightKg: row.weight_kg,
        loggedAt: new Date(row.logged_at),
      }));

      return weights;
    } catch (error) {
      logger.error('Failed to get recent weights', error);
      throw error;
    }
  }

  async getDailyMealsForDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    {
      date: string;
      totalCalories: number;
      totalProtein: number;
      totalCarbs: number;
      totalFat: number;
    }[]
  > {
    const query = `
      SELECT 
        DATE(m.logged_at) as meal_date,
        SUM(m.calories) as total_calories,
        SUM(COALESCE(m.protein_grams, 0)) as total_protein,
        SUM(COALESCE(m.carbs_grams, 0)) as total_carbs,
        SUM(COALESCE(m.fat_grams, 0)) as total_fat
      FROM meals m
      WHERE m.user_id = ? 
        AND m.logged_at BETWEEN ? AND ?
      GROUP BY DATE(m.logged_at)
      ORDER BY DATE(m.logged_at) ASC
    `;

    const rows = await this.db.all<
      {
        meal_date: string;
        total_calories: number;
        total_protein: number;
        total_carbs: number;
        total_fat: number;
      }[]
    >(query, [userId, startDate.toISOString(), endDate.toISOString()]);

    return rows.map((row) => ({
      date: row.meal_date,
      totalCalories: row.total_calories,
      totalProtein: row.total_protein,
      totalCarbs: row.total_carbs,
      totalFat: row.total_fat,
    }));
  }

  async getWeightsForDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    {
      date: string;
      weightKg: number;
    }[]
  > {
    const query = `
      SELECT 
        w.logged_at as weight_date,
        w.weight_kg
      FROM weights w
      WHERE w.user_id = ?
        AND w.logged_at BETWEEN DATE(?) AND DATE(?)
      ORDER BY w.logged_at ASC
    `;

    const rows = await this.db.all<
      {
        weight_date: string;
        weight_kg: number;
      }[]
    >(query, [userId, startDate.toISOString(), endDate.toISOString()]);

    return rows.map((row) => ({
      date: row.weight_date,
      weightKg: row.weight_kg,
    }));
  }

  async closeDatabase(): Promise<void> {
    try {
      if (this._db) {
        await this._db.close();
        this._db = null;
        logger.info('Database connection closed');
      }
    } catch (error) {
      // Log error but don't throw since we're closing anyway
      logger.error('Error closing database', error);
    }
  }
}
