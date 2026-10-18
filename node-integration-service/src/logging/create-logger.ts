import pino, { type Logger } from 'pino'

import type { AppConfig } from '../config/env.js'

/**
 * Structured logging configuration for Fastify.
 *
 * - Fastify v5 only accepts an options OBJECT here (an actual pino instance
 *   must go through `loggerInstance`), so we return a plain options object.
 * - Sensitive header paths are redacted defensively, even though the default
 *   request serializer only emits method/url (never headers or bodies).
 * - We deliberately do NOT use pino transports (e.g. pino-pretty): transports
 *   spawn worker threads, which this project intentionally avoids.
 */
export function createLoggerOptions(
  config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>,
): Record<string, unknown> {
  return {
    level: config.logLevel,
    base: { service: 'node-integration-service', env: config.nodeEnv },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    // Defense in depth: never serialize credentials into log lines.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'req.headers["proxy-authorization"]',
        '*.authorization',
        '*.cookie',
      ],
      censor: '[REDACTED]',
    },
    // Trim request logs: no headers, no remote address, no request body.
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req?.method, url: req?.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res?.statusCode }),
    },
  }
}

/** Pino logger type alias used by injectable components (clients, shutdown). */
export type AppLogger = Logger
