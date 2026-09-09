/**
 * Centralized logger utility
 * Only logs in development, sends to error tracking in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface LoggerConfig {
  enableConsole?: boolean;
  enableErrorTracking?: boolean;
  errorTrackingService?: (error: Error, context?: Record<string, unknown>) => void;
}

class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      enableConsole: isDevelopment,
      enableErrorTracking: isProduction,
      ...config,
    };
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return `${prefix} ${message}`;
  }

  log(message: string, ...args: unknown[]): void {
    if (this.config.enableConsole) {
      console.log(this.formatMessage('log', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.config.enableConsole) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.config.enableConsole) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.config.enableConsole) {
      console.error(this.formatMessage('error', message), error, context);
    }

    // In production, send to error tracking service
    if (this.config.enableErrorTracking && this.config.errorTrackingService) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.config.errorTrackingService(errorObj, {
        message,
        ...context,
      });
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.config.enableConsole && isDevelopment) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  // Specialized loggers for common use cases
  api(message: string, ...args: unknown[]): void {
    this.info(`🔌 API: ${message}`, ...args);
  }

  ssr(message: string, ...args: unknown[]): void {
    this.info(`🚀 SSR: ${message}`, ...args);
  }

  data(message: string, ...args: unknown[]): void {
    this.debug(`📊 Data: ${message}`, ...args);
  }

  performance(message: string, ...args: unknown[]): void {
    this.debug(`⚡ Performance: ${message}`, ...args);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for custom instances if needed
export { Logger };

// Export type for TypeScript
export type { LogLevel, LoggerConfig };
