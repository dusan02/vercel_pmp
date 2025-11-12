/**
 * Centralized logger using pino
 * Replace all console.log/error/warn with logger
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

// Create logger - use standard pino output (works in all environments)
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
  base: {
    env: process.env.NODE_ENV,
    service: 'pmp'
  },
  // Use pretty printing only if explicitly requested via env var
  ...(process.env.PINO_PRETTY === 'true' && isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname'
          }
        }
      }
    : {})
});

// Export convenience methods
export const log = {
  debug: (msg: string, ...args: unknown[]) => logger.debug({ args }, msg),
  info: (msg: string, ...args: unknown[]) => logger.info({ args }, msg),
  warn: (msg: string, ...args: unknown[]) => logger.warn({ args }, msg),
  error: (msg: string, err?: Error | unknown, ...args: unknown[]) => {
    if (err instanceof Error) {
      logger.error({ err, args }, msg);
    } else {
      logger.error({ err, args }, msg);
    }
  }
};

