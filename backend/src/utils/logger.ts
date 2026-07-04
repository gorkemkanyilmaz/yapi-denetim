import winston from 'winston'

const { combine, timestamp, errors, json, colorize, simple, printf } = winston.format

const safeErr = (err: unknown) => {
  if (err instanceof Error) {
    return {
      message: err.message,
      code: (err as Error & { code?: string }).code,
      detail: (err as Error & { detail?: string }).detail,
      constraint: (err as Error & { constraint?: string }).constraint,
      stack: err.stack,
    }
  }
  return err
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json(),
  ),
  defaultMeta: { service: 'yapi-denetim-api' },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        printf(({ level, message, timestamp: ts, ...meta }) => {
          const tail = Object.keys(meta)
            .filter((k) => k !== 'service')
            .map((k) => {
              const v = meta[k]
              if (v instanceof Error) return `${k}=${v.message}`
              if (typeof v === 'string') return `${k}=${v}`
              return `${k}=${JSON.stringify(v)}`
            })
            .join(' ')
          return `${ts} ${level} ${message} ${tail}`.trim()
        }),
      ),
    }),
  ],
})

// Helper: structured hata logla (örnek: logger.logError('createSampleSet failed', err))
;(logger as unknown as { logError: (msg: string, err: unknown, extra?: Record<string, unknown>) => void }).logError = (
  msg: string,
  err: unknown,
  extra: Record<string, unknown> = {},
) => {
  logger.error(msg, { err: safeErr(err), ...extra })
}
