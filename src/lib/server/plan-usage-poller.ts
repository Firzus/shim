import { api } from '#/../convex/_generated/api'

import { fetchPlanUsage } from './codex-client'
import { convex } from './convex'
import { logger, toErrorMessage } from './logger'

// Background poller that captures `/backend-api/codex/usage` snapshots into
// the `planUsageSnapshot` singleton. The dashboard reads from there so the
// UI never has to wait on a live upstream call.
//
// Lifecycle: module-load schedules the first tick. The poller is idempotent
// — `start()` short-circuits if the interval is already wired up, so multiple
// importing modules don't multiply the cadence.

const BASE_INTERVAL_MS = 5 * 60_000 // 5 min — quota changes slowly
const MAX_BACKOFF_MS = 30 * 60_000 // cap retries at 30 min after repeated fails
const INITIAL_DELAY_MS = 5_000 // give the server a moment to come up

interface PollerState {
  intervalHandle: ReturnType<typeof setTimeout> | null
  currentDelayMs: number
  inFlight: Promise<TickResult> | null
}

const state: PollerState = {
  intervalHandle: null,
  currentDelayMs: BASE_INTERVAL_MS,
  inFlight: null,
}

export interface TickResult {
  ok: boolean
  capturedAt: number | null
  status?: number
  error?: string
}

export async function tickPlanUsage(): Promise<TickResult> {
  // Coalesce concurrent ticks (manual refresh + scheduled tick colliding).
  if (state.inFlight) return state.inFlight

  state.inFlight = runTick()
  try {
    return await state.inFlight
  } finally {
    state.inFlight = null
  }
}

async function runTick(): Promise<TickResult> {
  let response: Response
  try {
    response = await fetchPlanUsage()
  } catch (err) {
    const message = toErrorMessage(err)
    logger.warn(`[plan-usage] tick skipped: ${message}`)
    return { ok: false, capturedAt: null, error: message }
  }

  if (!response.ok) {
    const text = await response
      .clone()
      .text()
      .catch(() => '')
    logger.warn(`[plan-usage] tick failed status=${response.status} body=${text.substring(0, 200)}`)
    return {
      ok: false,
      capturedAt: null,
      status: response.status,
      error: text.substring(0, 500),
    }
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch (err) {
    const message = toErrorMessage(err)
    logger.warn(`[plan-usage] tick parse error: ${message}`)
    return { ok: false, capturedAt: null, error: message }
  }

  const capturedAt = Date.now()
  try {
    await convex.mutation(api.planUsage.save, { capturedAt, raw })
  } catch (err) {
    const message = toErrorMessage(err)
    logger.warn(`[plan-usage] tick persist failed: ${message}`)
    return { ok: false, capturedAt: null, error: message }
  }

  logger.info(`[plan-usage] tick ok captured=${new Date(capturedAt).toISOString()}`)
  return { ok: true, capturedAt }
}

function scheduleNext(delayMs: number): void {
  if (state.intervalHandle) clearTimeout(state.intervalHandle)
  state.intervalHandle = setTimeout(() => {
    void tickPlanUsage().then((result) => {
      // Exponential-ish backoff on failure, snap back on success.
      if (result.ok) {
        state.currentDelayMs = BASE_INTERVAL_MS
      } else {
        state.currentDelayMs = Math.min(state.currentDelayMs * 2, MAX_BACKOFF_MS)
      }
      scheduleNext(state.currentDelayMs)
    })
  }, delayMs)
}

export function startPlanUsagePoller(): void {
  if (state.intervalHandle) return
  logger.info(`[plan-usage] poller starting (interval=${BASE_INTERVAL_MS}ms)`)
  scheduleNext(INITIAL_DELAY_MS)
}

// Auto-start on module load. Any server-only route importing this file
// (transitively via convex/api or directly) kicks off the loop. The handler
// in chat-completions.ts pulls this in via auth-status import; the dashboard
// hits /api/auth/status every 5s so the poller is alive within seconds of
// the first dashboard load.
startPlanUsagePoller()
