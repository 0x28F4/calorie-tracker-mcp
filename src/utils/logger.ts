import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class FileLogger implements Logger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;

    // Ensure log directory exists
    const logDir = dirname(logFile);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  private writeLog(level: string, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    const logEntry = `${timestamp} [${level}] ${message}${formattedArgs}\n`;

    try {
      writeFileSync(this.logFile, logEntry, { flag: 'a' });
    } catch (error) {
      // Fallback to console if file writing fails (only for critical errors)
      console.error(`Logging failed: ${String(error)}`);
    }
  }

  info(message: string, ...args: unknown[]): void {
    this.writeLog('INFO', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.writeLog('WARN', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.writeLog('ERROR', message, ...args);
  }
}

class NoopLogger implements Logger {
  info(_message: string, ..._args: unknown[]): void {
    // No-op for tests
  }

  warn(_message: string, ..._args: unknown[]): void {
    // No-op for tests
  }

  error(_message: string, ..._args: unknown[]): void {
    // No-op for tests
  }
}

// Singleton logger instance
let loggerInstance: Logger;

// Initialize with default file logger
const defaultLogFile = join(process.cwd(), 'data', 'calorie_tracker.log');
loggerInstance = new FileLogger(defaultLogFile);

// Configure the global logger (useful for tests)
export function configureLogger(newLogger: Logger): void {
  loggerInstance = newLogger;
}

// Export singleton logger
export const logger: Logger = {
  info: (message: string, ...args: unknown[]): void => {
    loggerInstance.info(message, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    loggerInstance.warn(message, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    loggerInstance.error(message, ...args);
  },
};

// Export NoopLogger for test usage
export { NoopLogger };
