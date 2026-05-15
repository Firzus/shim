// TanStack Start server functions — the dashboard's typed RPC surface.
//
// Each function is callable directly from client code; TanStack Start extracts
// the `.handler()` body into a server-only bundle and replaces the client call
// with an RPC. The return type is inferred and flows to the caller unchanged,
// so the dashboard is typed end-to-end with no hand-written response mirror
// (see ./types.ts). Inputs are validated at the boundary with Zod (./schemas).
//
// Server-only modules below are referenced only inside handlers, so the
// compiler drops them from the client bundle.

import { createServerFn } from '@tanstack/react-start'

import { api } from '#/../convex/_generated/api'
import { postCodexResponses } from '#/lib/server/codex-client'
import { convex } from '#/lib/server/convex'
import { logger, toErrorMessage } from '#/lib/server/logger'
import { clearCachedToken, getAuthorizationURL } from '#/lib/server/oauth/codex-oauth'
import { exchangeAndPersist } from '#/lib/server/oauth/exchange'
import { startCallbackListener } from '#/lib/server/oauth/listener'
import { generatePKCE } from '#/lib/server/oauth/pkce'
import { startPlanUsagePoller, tickPlanUsage } from '#/lib/server/plan-usage-poller'
import {
  ACCEPTED_REASONING_EFFORTS,
  getShimSettings,
  invalidateShimSettingsCache,
  normalizeTunnelUrl,
  resolveTunnelUrl,
  SHIM_SETTINGS_DEFAULTS,
} from '#/lib/server/settings'
import { ACCEPTED_CODEX_MODELS } from '#/lib/server/translation/model-map'

import { AnalyticsQuerySchema, ExchangeCallbackSchema, SaveSettingsSchema } from './schemas'
import type { UsageRaw } from './schemas'

const ALLOWED_MODELS = new Set(ACCEPTED_CODEX_MODELS)
const ALLOWED_EFFORTS = new Set<string>(ACCEPTED_REASONING_EFFORTS)

// Derive the `stalenessMs` field server-side so the dashboard doesn't keep a
// clock in sync. Shared by the GET and the manual-refresh POST.
function snapshotToUsage(snapshot: { capturedAt: number; raw?: unknown } | null) {
  if (!snapshot) return { capturedAt: null, raw: null, stalenessMs: null }
  return {
    capturedAt: snapshot.capturedAt,
    raw: (snapshot.raw ?? null) as UsageRaw | null,
    stalenessMs: Date.now() - snapshot.capturedAt,
  }
}

function tryParseRedirectUrl(input: string): { code: string; state: string } | null {
  try {
    const url = new URL(input)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return null
    return { code, state }
  } catch {
    return null
  }
}

// --- Auth -----------------------------------------------------------------

// Polled by the dashboard every ~5s. The poll doubles as the plan-usage
// poller's bootstrap, so usage stays fresh even before any proxy traffic.
export const getAuthStatus = createServerFn({ method: 'GET' }).handler(async () => {
  startPlanUsagePoller()
  return convex.query(api.oauthTokens.getStatus, {})
})

// Drives the full Codex OAuth/PKCE flow: persist the verifier, spin up the
// localhost:1455 listener, and return the authorize URL. The listener's
// completion runs fire-and-forget after the response — the dashboard polls
// getAuthStatus to learn the outcome.
export const initLogin = createServerFn({ method: 'POST' }).handler(async () => {
  const { codeVerifier, codeChallenge } = await generatePKCE()
  const state = crypto.randomUUID()

  await convex.mutation(api.pkceState.insert, { state, codeVerifier })

  const authURL = getAuthorizationURL(codeChallenge, state)

  let listenerActive = false
  try {
    const callbackPromise = startCallbackListener()
    listenerActive = true
    void callbackPromise.then(
      async ({ code, state: callbackState }) => {
        try {
          await exchangeAndPersist(code, callbackState)
          logger.info('[auth] login flow completed via localhost:1455 listener')
        } catch (error) {
          logger.error(`[auth] post-callback exchange failed: ${toErrorMessage(error)}`)
        }
      },
      (error: unknown) => {
        logger.warn(`[auth] listener rejected: ${toErrorMessage(error)}`)
      },
    )
  } catch (error) {
    logger.warn(`[auth] could not start listener (${toErrorMessage(error)}) — paste fallback only`)
  }

  return { authURL, state, listenerActive, fallbackAvailable: true }
})

// Fallback "paste-the-URL" exchange, used when port 1455 is unavailable. The
// user copies the full redirect URL from their browser's address bar. Throws
// on failure so the mutation surfaces a precise message.
export const exchangeCallback = createServerFn({ method: 'POST' })
  .inputValidator(ExchangeCallbackSchema)
  .handler(async ({ data }) => {
    const parsed = tryParseRedirectUrl(data.redirectUrl)
    if (!parsed) {
      throw new Error('Missing code or state — paste the full redirect URL.')
    }
    await exchangeAndPersist(parsed.code, parsed.state)
    return { success: true as const, message: 'Authentication successful.' }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await convex.mutation(api.oauthTokens.clear, {})
  clearCachedToken()
  return { success: true as const }
})

// --- Settings -------------------------------------------------------------

export const getSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const row = await convex.query(api.shimSettings.get, {})
  const { tunnelUrl, tunnelUrlSource } = resolveTunnelUrl(row?.tunnelUrl)
  return {
    model: row?.model ?? SHIM_SETTINGS_DEFAULTS.model,
    reasoningEffort: (row?.reasoningEffort ?? SHIM_SETTINGS_DEFAULTS.reasoningEffort) as string,
    tunnelUrl,
    tunnelUrlSource,
    updatedAt: row?.updatedAt ?? null,
    allowed: {
      models: Array.from(ALLOWED_MODELS),
      efforts: Array.from(ALLOWED_EFFORTS),
    },
  }
})

// Zod guards the patch shape; the handler owns the allow-lists (it can return
// precise messages) and the tunnel-URL normalization.
export const saveSettings = createServerFn({ method: 'POST' })
  .inputValidator(SaveSettingsSchema)
  .handler(async ({ data }) => {
    if (data.model !== undefined && !ALLOWED_MODELS.has(data.model)) {
      throw new Error(`unsupported model: ${data.model}`)
    }
    if (data.reasoningEffort !== undefined && !ALLOWED_EFFORTS.has(data.reasoningEffort)) {
      throw new Error(`unsupported effort: ${data.reasoningEffort}`)
    }

    let normalizedTunnel: string | undefined
    if (data.tunnelUrl !== undefined) {
      const result = normalizeTunnelUrl(data.tunnelUrl)
      if (!result.ok) throw new Error(result.error)
      normalizedTunnel = result.value
    }

    await convex.mutation(api.shimSettings.save, {
      model: data.model,
      reasoningEffort: data.reasoningEffort,
      tunnelUrl: normalizedTunnel,
    })
    invalidateShimSettingsCache()
    return { ok: true as const }
  })

// --- Analytics + plan usage ----------------------------------------------

export const getAnalytics = createServerFn({ method: 'GET' })
  .inputValidator(AnalyticsQuerySchema)
  .handler(async ({ data }) => {
    const now = Date.now()
    const since = now - data.sinceHours * 60 * 60 * 1000
    return convex.query(api.requests.getAnalytics, { since, now })
  })

export const getUsage = createServerFn({ method: 'GET' }).handler(async () => {
  const snapshot = await convex.query(api.planUsage.get, {})
  return snapshotToUsage(snapshot)
})

// Manual refresh: the POST returns the fresh snapshot so the dashboard writes
// it straight into the query cache. A failed upstream poll still resolves with
// the last-known (stale) snapshot rather than throwing.
export const refreshUsage = createServerFn({ method: 'POST' }).handler(async () => {
  await tickPlanUsage()
  const snapshot = await convex.query(api.planUsage.get, {})
  return snapshotToUsage(snapshot)
})

// --- Connection test ------------------------------------------------------

// Synthetic upstream ping for the onboarding wizard. Confirms tokens present,
// upstream reachable, settings applied. Never throws — the outcome (including
// failures) is the return value so the wizard can show details.
export const runTestConnection = createServerFn({ method: 'POST' }).handler(async () => {
  const startedAt = performance.now()
  const settings = await getShimSettings()
  const testConnectionId = 'shim-test-connection'

  const body: Record<string, unknown> = {
    model: settings.model,
    instructions: 'You are a connection test. Reply with exactly one word.',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
    stream: true,
    store: false,
    prompt_cache_key: testConnectionId,
    reasoning: { effort: settings.reasoningEffort },
  }

  try {
    const upstream = await postCodexResponses({
      body,
      sessionId: testConnectionId,
      conversationId: testConnectionId,
    })
    if (!upstream.ok) {
      const text = await upstream
        .clone()
        .text()
        .catch(() => '')
      logger.warn(`[test-connection] upstream ${upstream.status}: ${text.slice(0, 200)}`)
      return {
        ok: false,
        latencyMs: null,
        model: null,
        status: upstream.status,
        message: text.slice(0, 200) || upstream.statusText,
      }
    }
    // Drain the SSE briefly so the connection completes cleanly; we don't need
    // the content — just confirmation that the stream opens.
    if (upstream.body) {
      const reader = upstream.body.getReader()
      await reader.read()
      await reader.cancel().catch(() => null)
    }
    const latencyMs = Math.round(performance.now() - startedAt)
    logger.info(`[test-connection] ok latency=${latencyMs}ms model=${settings.model}`)
    return { ok: true, latencyMs, model: settings.model, status: 200, message: null }
  } catch (error) {
    const message = toErrorMessage(error)
    logger.error(`[test-connection] transport: ${message}`)
    return { ok: false, latencyMs: null, model: null, status: 0, message }
  }
})
