import type { Config } from '../types/config.js';

const defaultConfig: Config = {
  userId: 1,
  timezone: 'UTC',
  defaultMetabolicRate: 2000,
  databasePath: './data/calorie-tracker.db',
};

export function loadConfig(): Config {
  // For now, return default config
  // Later we can add environment variable support or config file loading
  return defaultConfig;
}

export function validateConfig(config: Config): void {
  if (config.userId <= 0) {
    throw new Error('User ID must be positive');
  }
  
  if (config.defaultMetabolicRate <= 0) {
    throw new Error('Default metabolic rate must be positive');
  }
  
  if (!config.timezone) {
    throw new Error('Timezone is required');
  }
  
  if (!config.databasePath) {
    throw new Error('Database path is required');
  }
}