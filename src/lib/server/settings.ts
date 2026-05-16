import { api } from '#/../convex/_generated/api'

import { convex } from './convex'
import { logger, toErrorMessage } from './logger'
import { getProvider } from './providers'
import type { ProviderId } from './providers/types'

// Short-lived cache around the dashboard-owned `shimSettings` singleton.

const CACHE_TTL_MS = 3_000

// The model + effort resolved for the *active* provider. The active provider's
// translation layer interprets `reasoningEffort` (the vocabularies differ).
export interface ShimSettings {
  activeProvider: ProviderId
  model: string
  reasoningEffort: string
}

let cache: { value: ShimSettings; expiresAt: number } | null = null

function defaultsFor(provider: ProviderId): ShimSettings {
  const meta = getProvider(provider).meta
  return { activeProvider: provider, model: meta.defaultModel, reasoningEffort: meta.defaultEffort }
}

export async function getShimSettings(): Promise<ShimSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  let value: ShimSettings = defaultsFor('codex')
  try {
    const row = await convex.query(api.shimSettings.get, {})
    const activeProvider: ProviderId = row?.activeProvider ?? 'codex'
    const meta = getProvider(activeProvider).meta
    const storedModel = activeProvider === 'codex' ? row?.codexModel : row?.anthropicModel
    const storedEffort = activeProvider === 'codex' ? row?.codexEffort : row?.anthropicEffort
    value = {
      activeProvider,
      model: storedModel && storedModel.length > 0 ? storedModel : meta.defaultModel,
      reasoningEffort: storedEffort && storedEffort.length > 0 ? storedEffort : meta.defaultEffort,
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

// Validate & normalize a tunnel URL string. Cursor BYOK rejects private
// networks ("Access to private networks is forbidden"), so we accept only
// https://… (or http://… for non-loopback hosts in dev) and strip any
// trailing slash / path / query so the wizard always shows `<origin>/v1`.
export function normalizeTunnelUrl(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'tunnel URL is required' }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'invalid URL — expected https://your-domain' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'protocol must be https or http' }
  }
  const host = url.hostname.toLowerCase()
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (isLoopback) {
    return {
      ok: false,
      error: 'localhost is a private network — Cursor BYOK refuses it. Use a public domain.',
    }
  }
  return { ok: true, value: `${url.protocol}//${url.host}` }
}

// The effective tunnel URL: a `CLOUDFLARE_TUNNEL_URL` env var wins over the
// dashboard-stored value, and the source is reported so the UI can lock the
// field when it is env-driven.
export function resolveTunnelUrl(stored: string | null | undefined): {
  tunnelUrl: string | null
  tunnelUrlSource: 'env' | 'settings' | null
} {
  const envUrl = process.env.CLOUDFLARE_TUNNEL_URL?.trim()
  if (envUrl) return { tunnelUrl: envUrl, tunnelUrlSource: 'env' }
  if (stored) return { tunnelUrl: stored, tunnelUrlSource: 'settings' }
  return { tunnelUrl: null, tunnelUrlSource: null }
}
