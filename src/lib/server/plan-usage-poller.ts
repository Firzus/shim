import { api } from '#/../convex/_generated/api'

import { convex } from './convex'
import { logger, toErrorMessage } from './logger'
import { getRegisteredProviders } from './providers'

// Background poller that captures plan-usage snapshots into the
// `planUsageSnapshot` table (one row per provider). Only providers whose
// `usageStrategy` is `'poll'` are fetched here — `'headers'` providers
// (Anthropic) capture usage from response headers on every proxied request.
//
// Lifecycle: module-load schedules the first tick. The poller is idempotent —
// `start()` short-circuits if the interval is already wired up.

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
  let anyOk = false
  let lastError: string | undefined

  for (const provider of getRegisteredProviders()) {
    if (provider.upstream.usageStrategy !== 'poll') continue
    try {
      const response = await provider.upstream.fetchPlanUsage()
      if (!response) continue
      if (!response.ok) {
        const text = await response
          .clone()
          .text()
          .catch(() => '')
        lastError = `${provider.meta.id} ${response.status} ${text.substring(0, 120)}`
        logger.warn(`[plan-usage] ${lastError}`)
        continue
      }
      const raw: unknown = await response.json()
      await convex.mutation(api.planUsage.save, {
        provider: provider.meta.id,
        capturedAt: Date.now(),
        raw,
      })
      anyOk = true
    } catch (err) {
      lastError = `${provider.meta.id}: ${toErrorMessage(err)}`
      logger.warn(`[plan-usage] tick skipped: ${lastError}`)
    }
  }

  return anyOk
    ? { ok: true, capturedAt: Date.now() }
    : { ok: false, capturedAt: null, error: lastError }
}

function scheduleNext(delayMs: number): void {
  if (state.intervalHandle) clearTimeout(state.intervalHandle)
  state.intervalHandle = setTimeout(() => {
    void tickPlanUsage().then((result) => {
      // Exponential-ish backoff on failure, snap back on success.
      state.currentDelayMs = result.ok
        ? BASE_INTERVAL_MS
        : Math.min(state.currentDelayMs * 2, MAX_BACKOFF_MS)
      scheduleNext(state.currentDelayMs)
    })
  }, delayMs)
}

export function startPlanUsagePoller(): void {
  if (state.intervalHandle) return
  logger.info(`[plan-usage] poller starting (interval=${BASE_INTERVAL_MS}ms)`)
  scheduleNext(INITIAL_DELAY_MS)
}

// Auto-start on module load. Any server-only route importing this file kicks
// off the loop.
startPlanUsagePoller()
