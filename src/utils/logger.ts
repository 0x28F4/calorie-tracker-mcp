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

// Create logger with log file in data directory
const logFile = join(process.cwd(), 'data', 'calorie_tracker.log');
export const logger: Logger = new FileLogger(logFile);
