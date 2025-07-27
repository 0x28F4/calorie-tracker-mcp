export interface Config {
  readonly userId: number;
  readonly timezone: string;
  readonly defaultMetabolicRate: number;
  readonly databasePath: string;
}

export interface DatabaseConfig {
  readonly path: string;
  readonly backupPath?: string;
}

export interface ServerConfig {
  readonly transport: 'stdio' | 'sse';
  readonly port?: number;
}