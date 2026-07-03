// Structured logger for Node.js API routes (not for Edge/middleware — use console there).
// Pino writes newline-delimited JSON in production; pretty-prints in development.
// Usage:  import logger from '@/lib/logger'
//         logger.info({ orderId }, 'order created')
//         logger.error({ err, userId }, 'profile fetch failed')

import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
    base: { service: 'dlm-engine' },
    // Redact secrets that should never appear in logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'token',
        'secret',
        'apiKey',
        'api_key',
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
    : undefined,
)

export default logger
