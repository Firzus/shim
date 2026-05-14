import { api } from '#/../convex/_generated/api'

import { convex } from './convex'
import { logger, toErrorMessage } from './logger'

// Server-side cache around the `shimSettings` singleton. The dashboard mutates
// it; the proxy reads it on every request. We cache for a short window so
// rapid agent-loop turns don't hammer Convex, but keep the TTL low enough
// that toggling the dashboard reflects quickly (TTL ms below).
//
// All upstream calls take their final `model`, `reasoning`, and `verbosity`
// from here — Cursor's body is treated as best-effort hint, not source of
// truth (the user explicitly opted into dashboard-driven control).

const CACHE_TTL_MS = 3_000

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export interface ShimSettings {
  model: string
  reasoningEffort: ReasoningEffort
}

const DEFAULTS: ShimSettings = {
  model: 'gpt-5.5',
  reasoningEffort: 'medium',
}

let cache: { value: ShimSettings; expiresAt: number } | null = null

function normalizeEffort(raw: string | null | undefined): ReasoningEffort {
  switch (raw) {
    case 'none':
    case 'low':
    case 'medium':
    case 'high':
      return raw
    default:
      return DEFAULTS.reasoningEffort
  }
}

export async function getShimSettings(): Promise<ShimSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  let value: ShimSettings = DEFAULTS
  try {
    const row = await convex.query(api.shimSettings.get, {})
    if (row) {
      value = {
        model: row.model && row.model.length > 0 ? row.model : DEFAULTS.model,
        reasoningEffort: normalizeEffort(row.reasoningEffort),
      }
    }
  } catch (err) {
    logger.warn(`[settings] failed to load shimSettings: ${toErrorMessage(err)}`)
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export function invalidateShimSettingsCache(): void {
  cache = null
}

export const SHIM_SETTINGS_DEFAULTS: ShimSettings = DEFAULTS
