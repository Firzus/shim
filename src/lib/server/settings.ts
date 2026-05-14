import { api } from '#/../convex/_generated/api'

import { convex } from './convex'
import { logger, toErrorMessage } from './logger'

// Short-lived cache around the dashboard-owned `shimSettings` singleton.

const CACHE_TTL_MS = 3_000

export const ACCEPTED_REASONING_EFFORTS = ['low', 'medium', 'high', 'extra-high'] as const

export type ReasoningEffort = (typeof ACCEPTED_REASONING_EFFORTS)[number]

export interface ShimSettings {
  model: string
  reasoningEffort: ReasoningEffort
}

const DEFAULTS: ShimSettings = {
  model: 'gpt-5.5',
  reasoningEffort: 'high',
}

let cache: { value: ShimSettings; expiresAt: number } | null = null

function isReasoningEffort(raw: string | null | undefined): raw is ReasoningEffort {
  return typeof raw === 'string' && (ACCEPTED_REASONING_EFFORTS as readonly string[]).includes(raw)
}

function normalizeEffort(raw: string | null | undefined): ReasoningEffort {
  return isReasoningEffort(raw) ? raw : DEFAULTS.reasoningEffort
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
