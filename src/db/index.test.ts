import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Database } from './index.js';
import type { AppConfig } from '../types/config.js';

describe('Database', () => {
  let database: Database;
  const testUserId = 'test-user';

  const testConfig: AppConfig = {
    databasePath: ':memory:',
    logLevel: 'error',
    serverTransport: 'stdio',
  };

  beforeEach(async () => {
    database = new Database(testConfig);
    await database.initialize();
  });

  afterEach(async () => {
    await database.closeDatabase();
  });

  describe('User Settings', () => {
    test('createUserSettings and getUserSettings', async () => {
      const settings = await database.createUserSettings({
        userId: testUserId,
        timezone: 'America/New_York',
        metabolicRate: 2200,
      });

      expect(settings.userId).toBe(testUserId);
      expect(settings.timezone).toBe('America/New_York');
      expect(settings.metabolicRate).toBe(2200);

      const retrieved = await database.getUserSettings(testUserId);
      expect(retrieved.userId).toBe(testUserId);
      expect(retrieved.timezone).toBe('America/New_York');
      expect(retrieved.metabolicRate).toBe(2200);
    });

    test('updateUserSettings', async () => {
      await database.createUserSettings({
        userId: testUserId,
        timezone: 'UTC',
        metabolicRate: 2000,
      });

      const updated = await database.updateUserSettings(testUserId, {
        timezone: 'Europe/London',
        metabolicRate: 2400,
      });

      expect(updated.timezone).toBe('Europe/London');
      expect(updated.metabolicRate).toBe(2400);
    });

    test('ensureUserExists creates user if not exists', async () => {
      await database.ensureUserExists(testUserId);

      const settings = await database.getUserSettings(testUserId);
      expect(settings.userId).toBe(testUserId);
      expect(settings.timezone).toBe('UTC');
      expect(settings.metabolicRate).toBe(2000);
    });
  });

  describe('Meals', () => {
    beforeEach(async () => {
      await database.ensureUserExists(testUserId);
    });

    test('createMeals batch insert', async () => {
      await database.ensureUserExists(testUserId);

      const mealsToCreate = [
        {
          mealName: 'Breakfast',
          calories: 400,
          proteinGrams: 20,
          carbsGrams: 50,
          fatGrams: 15,
          loggedAt: new Date('2024-01-01T08:00:00Z'),
        },
        {
          mealName: 'Lunch',
          calories: 600,
          proteinGrams: 30,
          carbsGrams: 60,
          fatGrams: 20,
          loggedAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          mealName: 'Dinner',
          calories: 800,
          proteinGrams: 40,
          carbsGrams: 70,
          fatGrams: 25,
          loggedAt: new Date('2024-01-01T18:00:00Z'),
        },
      ];

      const createdMeals = await database.createMeals(testUserId, mealsToCreate);

      expect(createdMeals).toHaveLength(3);
      expect(createdMeals[0]?.mealName).toBe('Breakfast');
      expect(createdMeals[0]?.calories).toBe(400);
      expect(createdMeals[1]?.mealName).toBe('Lunch');
      expect(createdMeals[1]?.calories).toBe(600);
      expect(createdMeals[2]?.mealName).toBe('Dinner');
      expect(createdMeals[2]?.calories).toBe(800);

      // Verify they were actually saved
      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-01T23:59:59Z');
      const savedMeals = await database.getMealsForDateRange(testUserId, startDate, endDate);

      expect(savedMeals).toHaveLength(3);
      expect(savedMeals.map((m) => m.mealName).sort()).toEqual(['Breakfast', 'Dinner', 'Lunch']);
    });

    test('createMeals with empty array', async () => {
      await database.ensureUserExists(testUserId);

      const createdMeals = await database.createMeals(testUserId, []);

      expect(createdMeals).toHaveLength(0);
    });

    test('createMeals transaction rollback on error', async () => {
      // Don't create the user to trigger a foreign key constraint error
      const nonExistentUserId = 'non-existent-user';

      const mealsToCreate = [
        {
          mealName: 'Valid Meal',
          calories: 400,
        },
        {
          mealName: 'Another Valid Meal',
          calories: 500,
        },
      ];

      // The entire transaction should fail due to foreign key constraint
      await expect(database.createMeals(nonExistentUserId, mealsToCreate)).rejects.toThrow();

      // Verify no meals were created for either user
      await database.ensureUserExists(testUserId);
      const savedMeals = await database.getMealsForDateRange(
        testUserId,
        new Date('2020-01-01'),
        new Date('2030-01-01'),
      );

      expect(savedMeals).toHaveLength(0);
    });
  });

  describe('Weights', () => {
    beforeEach(async () => {
      await database.ensureUserExists(testUserId);
    });

    test('createWeight and getRecentWeights', async () => {
      const weight = await database.createWeight(testUserId, {
        weightKg: 75.5,
        loggedAt: new Date('2024-01-01'),
      });

      expect(weight.weightKg).toBe(75.5);

      const recent = await database.getRecentWeights(testUserId, 5);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.weightKg).toBe(75.5);
    });

    test('createWeight updates existing weight for same date', async () => {
      await database.createWeight(testUserId, {
        weightKg: 75.0,
        loggedAt: new Date('2024-01-01'),
      });

      const updated = await database.createWeight(testUserId, {
        weightKg: 75.5,
        loggedAt: new Date('2024-01-01'),
      });

      expect(updated.weightKg).toBe(75.5);

      const recent = await database.getRecentWeights(testUserId, 5);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.weightKg).toBe(75.5);
    });
  });

  describe('Aggregations', () => {
    beforeEach(async () => {
      await database.ensureUserExists(testUserId);
    });

    test('getDailyMealsForDateRange with 2 days', async () => {
      await database.createMeals(testUserId, [
        {
          mealName: 'Breakfast',
          calories: 400,
          proteinGrams: 20,
          loggedAt: new Date('2024-01-01T08:00:00Z'),
        },
        {
          mealName: 'Lunch',
          calories: 600,
          proteinGrams: 30,
          loggedAt: new Date('2024-01-02T12:00:00Z'),
        },
      ]);

      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-02T23:59:59Z');

      const dailyMeals = await database.getDailyMealsForDateRange(testUserId, startDate, endDate);

      expect(dailyMeals).toHaveLength(2);
      expect(dailyMeals[0]?.date).toBe('2024-01-01');
      expect(dailyMeals[0]?.totalCalories).toBe(400);
      expect(dailyMeals[1]?.date).toBe('2024-01-02');
      expect(dailyMeals[1]?.totalCalories).toBe(600);
    });

    test('getWeightsForDateRange with 2 weights', async () => {
      await database.createWeight(testUserId, {
        weightKg: 75.0,
        loggedAt: new Date('2024-01-01'),
      });

      await database.createWeight(testUserId, {
        weightKg: 74.8,
        loggedAt: new Date('2024-01-02'),
      });

      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-02T23:59:59Z');

      const weights = await database.getWeightsForDateRange(testUserId, startDate, endDate);

      expect(weights).toHaveLength(2);
      expect(weights[0]?.date).toBe('2024-01-01');
      expect(weights[0]?.weightKg).toBe(75.0);
      expect(weights[1]?.date).toBe('2024-01-02');
      expect(weights[1]?.weightKg).toBe(74.8);
    });
  });
});
