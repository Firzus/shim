// Anthropic plan-usage capture. Unlike Codex (a pollable endpoint), Anthropic
// exposes quota via `anthropic-ratelimit-unified-*` response headers on every
// /v1/messages call. The client calls `captureAnthropicUsage` after each
// upstream response; the parsed snapshot is throttled into Convex.

import { api } from '#/../convex/_generated/api'
import { convex } from '../../convex'
import { logger, toErrorMessage } from '../../logger'

export interface RateLimitWindow {
  utilization: number
  resetAt: number
  status: string
}

export interface RateLimitSnapshot {
  capturedAt: number
  overallStatus: string | null
  representativeClaim: 'five_hour' | 'seven_day' | null
  fiveHour: RateLimitWindow | null
  weekly: RateLimitWindow | null
  fallbackPercentage: number | null
  overageStatus: string | null
}

function parseUtilization(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function parseResetEpoch(value: string | null): number | null {
  if (!value) return null
  const seconds = Number.parseInt(value, 10)
  if (!Number.isFinite(seconds)) return null
  return seconds * 1000
}

function parseWindow(headers: Headers, prefix: '5h' | '7d'): RateLimitWindow | null {
  const utilization = parseUtilization(
    headers.get(`anthropic-ratelimit-unified-${prefix}-utilization`),
  )
  const resetAt = parseResetEpoch(headers.get(`anthropic-ratelimit-unified-${prefix}-reset`))
  if (utilization === null || resetAt === null) return null
  return {
    utilization,
    resetAt,
    status: headers.get(`anthropic-ratelimit-unified-${prefix}-status`) ?? 'unknown',
  }
}

export function parseAnthropicRateLimitHeaders(headers: Headers): RateLimitSnapshot | null {
  const fiveHour = parseWindow(headers, '5h')
  const weekly = parseWindow(headers, '7d')
  if (!fiveHour && !weekly) return null

  const claim = headers.get('anthropic-ratelimit-unified-representative-claim')
  return {
    capturedAt: Date.now(),
    overallStatus: headers.get('anthropic-ratelimit-unified-status'),
    representativeClaim: claim === 'five_hour' || claim === 'seven_day' ? claim : null,
    fiveHour,
    weekly,
    fallbackPercentage: parseUtilization(
      headers.get('anthropic-ratelimit-unified-fallback-percentage'),
    ),
    overageStatus: headers.get('anthropic-ratelimit-unified-overage-status'),
  }
}

// Throttle Convex writes — the headers arrive on every request and rarely
// change between adjacent calls. Persist on status-change or every 5s.
const PERSIST_THROTTLE_MS = 5000
let lastPersistedAt = 0
let lastPersistedStatus: string | null = null

/** Parse + persist the rate-limit headers from an Anthropic response. */
export function captureAnthropicUsage(headers: Headers): void {
  let snapshot: RateLimitSnapshot | null
  try {
    snapshot = parseAnthropicRateLimitHeaders(headers)
  } catch (error) {
    logger.debug(`[anthropic] header capture failed: ${toErrorMessage(error)}`)
    return
  }
  if (!snapshot) return

  const now = Date.now()
  const statusChanged = snapshot.overallStatus !== lastPersistedStatus
  if (!statusChanged && now - lastPersistedAt < PERSIST_THROTTLE_MS) return

  lastPersistedAt = now
  lastPersistedStatus = snapshot.overallStatus
  void convex
    .mutation(api.planUsage.save, {
      provider: 'anthropic',
      capturedAt: snapshot.capturedAt,
      raw: snapshot,
    })
    .catch((error) => {
      logger.debug(`[anthropic] failed to persist usage snapshot: ${toErrorMessage(error)}`)
    })
}
