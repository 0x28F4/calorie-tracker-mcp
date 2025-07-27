// App-level configuration (environment/deployment settings)
export interface AppConfig {
  readonly databasePath: string;
  readonly logLevel: 'info' | 'warn' | 'error';
  readonly serverTransport: 'stdio' | 'sse';
  readonly serverPort?: number;
}

// User-specific settings (stored in database per user)
export interface UserSettings {
  readonly userId: number;
  readonly timezone: string;
  readonly metabolicRate: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}