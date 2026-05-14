// Minimal structured logger — stdout-only (no file rotation needed; we run
// behind `vp dev` or `node .output/server/index.mjs` and let the orchestrator
// capture stdout). Levels via LOG_LEVEL env var.

const LOG_LEVELS = { VERBOSE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 } as const
type LogLevel = keyof typeof LOG_LEVELS

const envLevel = (process.env.LOG_LEVEL?.toUpperCase() ?? 'INFO') as LogLevel
const currentLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.INFO

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel
}

function format(level: LogLevel, message: string): string {
  return `[${new Date().toISOString()}] [${level}] ${message}`
}

export const logger = {
  verbose(message: string): void {
    if (shouldLog('VERBOSE')) console.log(format('VERBOSE', message))
  },
  debug(message: string): void {
    if (shouldLog('DEBUG')) console.log(format('DEBUG', message))
  },
  info(message: string): void {
    if (shouldLog('INFO')) console.log(format('INFO', message))
  },
  warn(message: string): void {
    if (shouldLog('WARN')) console.warn(format('WARN', message))
  },
  error(message: string): void {
    if (shouldLog('ERROR')) console.error(format('ERROR', message))
  },
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
