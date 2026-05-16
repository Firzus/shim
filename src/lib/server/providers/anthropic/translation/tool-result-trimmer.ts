import { logger } from '../../../logger'

const DEFAULT_MAX_CHARS = 80_000

/**
 * Trim a tool result string that exceeds maxChars using a head+tail strategy.
 * Keeps the first 60% and last 40% of the budget, inserting a truncation
 * marker in between. Returns the original string unchanged if it fits.
 */
export function trimToolResult(content: string, maxChars: number = DEFAULT_MAX_CHARS): string {
  if (maxChars <= 0 || content.length <= maxChars) return content

  const headRatio = 0.6
  const markerBudget = 80
  const usable = maxChars - markerBudget
  const headLen = Math.floor(usable * headRatio)
  const tailLen = usable - headLen

  const removed = content.length - headLen - tailLen
  const marker = `\n\n[... truncated ${removed.toLocaleString()} chars ...]\n\n`

  logger.info(
    `[anthropic] trimmed tool result from ${content.length.toLocaleString()} to ~${maxChars.toLocaleString()} chars`,
  )

  return content.slice(0, headLen) + marker + content.slice(-tailLen)
}
