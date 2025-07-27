// Database type definitions

export interface UserSettings {
  readonly userId: string;
  readonly timezone: string;
  readonly metabolicRate: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Meal {
  readonly id: string;
  readonly userId: string;
  readonly mealName: string;
  readonly calories: number;
  readonly proteinGrams?: number;
  readonly carbsGrams?: number;
  readonly fatGrams?: number;
  readonly loggedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Weight {
  readonly id: string;
  readonly userId: string;
  readonly weightKg: number;
  readonly loggedAt: Date;
  readonly createdAt: Date;
}

// Input types for creating records
export interface CreateMealInput {
  readonly mealName: string;
  readonly calories: number;
  readonly proteinGrams?: number;
  readonly carbsGrams?: number;
  readonly fatGrams?: number;
  readonly loggedAt?: Date; // Optional, defaults to now
}

export interface CreateWeightInput {
  readonly weightKg: number;
  readonly loggedAt?: Date; // Optional, defaults to today
}

export interface CreateUserSettingsInput {
  readonly userId: string;
  readonly timezone?: string;
  readonly metabolicRate?: number;
}
