import type { AppConfig } from '../types/config.js';

const defaultAppConfig: AppConfig = {
  databasePath: './data/calorie_tracker.db',
  logLevel: 'info',
  serverTransport: 'stdio',
  serverPort: undefined, // Only used for HTTP transport
};

export function loadAppConfig(): AppConfig {
  // Load from environment variables or use defaults
  return {
    databasePath: process.env.DATABASE_PATH ?? defaultAppConfig.databasePath,
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) || defaultAppConfig.logLevel,
    serverTransport: (process.env.SERVER_TRANSPORT as AppConfig['serverTransport']) || defaultAppConfig.serverTransport,
    serverPort: process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : defaultAppConfig.serverPort,
  };
}

export function validateAppConfig(config: AppConfig): void {
  if (!config.databasePath) {
    throw new Error('Database path is required');
  }

  if (!['info', 'warn', 'error'].includes(config.logLevel)) {
    throw new Error('Log level must be info, warn, or error');
  }

  if (!['stdio', 'sse'].includes(config.serverTransport)) {
    throw new Error('Server transport must be stdio or sse');
  }

  if (config.serverTransport === 'sse' && !config.serverPort) {
    throw new Error('Server port is required for HTTP transport');
  }
}
