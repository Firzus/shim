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

import { api } from '@/../convex/_generated/api'
import { convex } from '@/lib/server/convex'
import { logger, toErrorMessage } from '@/lib/server/logger'
import { exchangeAndPersist } from '@/lib/server/oauth/exchange'
import { startCallbackListener } from '@/lib/server/oauth/listener'
import { generatePKCE } from '@/lib/server/oauth/pkce'
import { startPlanUsagePoller, tickPlanUsage } from '@/lib/server/plan-usage-poller'
import { getProvider } from '@/lib/server/providers'
import type { Provider, ProviderId } from '@/lib/server/providers'
import {
  getShimSettings,
  invalidateShimSettingsCache,
  normalizeTunnelUrl,
  resolveTunnelUrl,
} from '@/lib/server/settings'

import {
  AnalyticsQuerySchema,
  ExchangeCallbackSchema,
  ProviderActionSchema,
  ProviderIdSchema,
  SaveSettingsSchema,
} from './schemas'
import type { UsageRaw } from './schemas'

// A stored shimSettings row — the per-provider namespaced model/effort fields.
interface ShimSettingsRow {
  activeProvider?: ProviderId | null
  codexModel?: string | null
  codexEffort?: string | null
  anthropicModel?: string | null
  anthropicEffort?: string | null
}

// Resolve a provider's model/effort/allow-lists from the stored settings row.
function providerView(provider: Provider, row: ShimSettingsRow | null) {
  const isCodex = provider.meta.id === 'codex'
  const model = (isCodex ? row?.codexModel : row?.anthropicModel) || provider.meta.defaultModel
  const effort = (isCodex ? row?.codexEffort : row?.anthropicEffort) || provider.meta.defaultEffort
  return {
    model,
    effort,
    allowed: {
      models: Array.from(provider.meta.allowedModels),
      efforts: Array.from(provider.meta.allowedEfforts),
    },
  }
}

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

// Accepts either a full redirect URL (`...?code=X&state=Y`) or a bare
// `code#state` string — Anthropic's hosted callback page shows the latter.
function tryParseRedirectUrl(input: string): { code: string; state: string } | null {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (code && state) return { code, state }
  } catch {
    // not a URL — fall through to the bare `code#state` form
  }
  const hashIdx = trimmed.indexOf('#')
  if (hashIdx > 0) {
    const code = trimmed.slice(0, hashIdx)
    const state = trimmed.slice(hashIdx + 1)
    if (code && state) return { code, state }
  }
  return null
}

// --- Auth -----------------------------------------------------------------

// Polled by the dashboard every ~5s. The poll doubles as the plan-usage
// poller's bootstrap, so usage stays fresh even before any proxy traffic.
export const getAuthStatus = createServerFn({ method: 'GET' }).handler(async () => {
  startPlanUsagePoller()
  const [status, row] = await Promise.all([
    convex.query(api.oauthTokens.getStatus, {}),
    convex.query(api.shimSettings.get, {}),
  ])
  const activeProvider: ProviderId = row?.activeProvider ?? 'codex'
  // Back-compat: top-level fields mirror the *active* provider so the existing
  // status strip / dot / onboarding keep working; `providers` carries both.
  return {
    ...status[activeProvider],
    activeProvider,
    providers: status,
  }
})

// Drives a provider's OAuth/PKCE flow: persist the verifier, spin up the
// localhost listener (loopback providers only), and return the authorize URL.
// The listener's completion runs fire-and-forget — the dashboard polls
// getAuthStatus to learn the outcome. `provider` omitted ⇒ Codex.
export const initLogin = createServerFn({ method: 'POST' })
  .inputValidator(ProviderActionSchema)
  .handler(async ({ data }) => {
    const providerId: ProviderId = data.provider ?? 'codex'
    const provider = getProvider(providerId)

    const { codeVerifier, codeChallenge } = await generatePKCE()
    const state = crypto.randomUUID()

    await convex.mutation(api.pkceState.insert, { state, provider: providerId, codeVerifier })

    const authURL = provider.oauth.getAuthorizationURL(codeChallenge, state)

    let listenerActive = false
    if (provider.oauth.redirectStrategy === 'loopback' && provider.oauth.loopbackPort) {
      try {
        const callbackPromise = startCallbackListener(
          provider.oauth.loopbackPort,
          provider.oauth.loopbackCallbackPath ?? '/auth/callback',
        )
        listenerActive = true
        void callbackPromise.then(
          async ({ code, state: callbackState }) => {
            try {
              await exchangeAndPersist(providerId, code, callbackState)
              logger.info(`[auth] ${providerId} login completed via localhost listener`)
            } catch (error) {
              logger.error(`[auth] post-callback exchange failed: ${toErrorMessage(error)}`)
            }
          },
          (error: unknown) => {
            logger.warn(`[auth] listener rejected: ${toErrorMessage(error)}`)
          },
        )
      } catch (error) {
        logger.warn(
          `[auth] could not start listener (${toErrorMessage(error)}) — paste fallback only`,
        )
      }
    }

    return { authURL, state, listenerActive, fallbackAvailable: true }
  })

// Callback exchange: the user pastes the redirect URL (or bare `code#state`).
// Throws on failure so the mutation surfaces a precise message.
export const exchangeCallback = createServerFn({ method: 'POST' })
  .inputValidator(ExchangeCallbackSchema)
  .handler(async ({ data }) => {
    const providerId: ProviderId = data.provider ?? 'codex'
    const parsed = tryParseRedirectUrl(data.redirectUrl)
    if (!parsed) {
      throw new Error('Missing code or state — paste the full redirect URL or code.')
    }
    await exchangeAndPersist(providerId, parsed.code, parsed.state)
    return { success: true as const, message: 'Authentication successful.' }
  })

export const logout = createServerFn({ method: 'POST' })
  .inputValidator(ProviderActionSchema)
  .handler(async ({ data }) => {
    const providerId: ProviderId = data.provider ?? 'codex'
    await convex.mutation(api.oauthTokens.clear, { provider: providerId })
    getProvider(providerId).clearCachedToken()
    return { success: true as const }
  })

// --- Settings -------------------------------------------------------------

export const getSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const row = await convex.query(api.shimSettings.get, {})
  const { tunnelUrl, tunnelUrlSource } = resolveTunnelUrl(row?.tunnelUrl)
  const activeProvider: ProviderId = row?.activeProvider ?? 'codex'

  // `providers` carries both providers' model/effort/allow-lists so the
  // dashboard can render a per-provider picker for each.
  return {
    activeProvider,
    tunnelUrl,
    tunnelUrlSource,
    updatedAt: row?.updatedAt ?? null,
    providers: {
      codex: providerView(getProvider('codex'), row),
      anthropic: providerView(getProvider('anthropic'), row),
    },
  }
})

// Zod guards the patch shape; the handler owns the allow-lists (it can return
// precise messages) and the tunnel-URL normalization. `provider` omitted ⇒ the
// active provider.
export const saveSettings = createServerFn({ method: 'POST' })
  .inputValidator(SaveSettingsSchema)
  .handler(async ({ data }) => {
    // `provider` omitted ⇒ write to whichever provider is currently active;
    // only then do we need to read the row to resolve it.
    const target: ProviderId =
      data.provider ?? (await convex.query(api.shimSettings.get, {}))?.activeProvider ?? 'codex'
    const meta = getProvider(target).meta

    if (data.model !== undefined && !meta.allowedModels.includes(data.model)) {
      throw new Error(`unsupported model for ${target}: ${data.model}`)
    }
    if (data.reasoningEffort !== undefined && !meta.allowedEfforts.includes(data.reasoningEffort)) {
      throw new Error(`unsupported effort for ${target}: ${data.reasoningEffort}`)
    }

    let normalizedTunnel: string | undefined
    if (data.tunnelUrl !== undefined) {
      const result = normalizeTunnelUrl(data.tunnelUrl)
      if (!result.ok) throw new Error(result.error)
      normalizedTunnel = result.value
    }

    await convex.mutation(api.shimSettings.save, {
      ...(target === 'codex'
        ? { codexModel: data.model, codexEffort: data.reasoningEffort }
        : { anthropicModel: data.model, anthropicEffort: data.reasoningEffort }),
      tunnelUrl: normalizedTunnel,
    })
    invalidateShimSettingsCache()
    return { ok: true as const }
  })

// One-click active-provider switch — both providers stay authenticated, so no
// re-login is needed; the next `shim` request routes to the chosen provider.
export const setActiveProvider = createServerFn({ method: 'POST' })
  .inputValidator(ProviderIdSchema)
  .handler(async ({ data }) => {
    await convex.mutation(api.shimSettings.save, { activeProvider: data })
    invalidateShimSettingsCache()
    return { ok: true as const, activeProvider: data }
  })

// --- Analytics + plan usage ----------------------------------------------

export const getAnalytics = createServerFn({ method: 'GET' })
  .inputValidator(AnalyticsQuerySchema)
  .handler(async ({ data }) => {
    const now = Date.now()
    const since = now - data.sinceHours * 60 * 60 * 1000
    return convex.query(api.requests.getAnalytics, { since, now })
  })

// Both providers' usage in one shot — the Console renders Codex and Anthropic
// side by side, so it never wants just the active one.
async function bothUsageSnapshots() {
  const [codex, anthropic] = await Promise.all([
    convex.query(api.planUsage.get, { provider: 'codex' }),
    convex.query(api.planUsage.get, { provider: 'anthropic' }),
  ])
  return { codex: snapshotToUsage(codex), anthropic: snapshotToUsage(anthropic) }
}

export const getUsage = createServerFn({ method: 'GET' }).handler(() => bothUsageSnapshots())

// Manual refresh: the POST returns the fresh snapshots so the dashboard writes
// them straight into the query cache. `tickPlanUsage` only polls Codex —
// Anthropic usage is header-driven and refreshes on real proxy traffic.
export const refreshUsage = createServerFn({ method: 'POST' }).handler(async () => {
  await tickPlanUsage()
  return bothUsageSnapshots()
})

// --- Connection test ------------------------------------------------------

// Synthetic upstream ping for the onboarding wizard. Routes through the active
// provider so it confirms whichever upstream the dashboard is set to. Never
// throws — the outcome (including failures) is the return value.
export const runTestConnection = createServerFn({ method: 'POST' }).handler(async () => {
  const startedAt = performance.now()
  const settings = await getShimSettings()
  const provider = getProvider(settings.activeProvider)
  const testConnectionId = 'shim-test-connection'

  // A minimal OpenAI-chat request the provider's translator converts to its
  // own upstream shape.
  const rawBody: Record<string, unknown> = {
    model: 'shim',
    messages: [
      { role: 'system', content: 'You are a connection test. Reply with exactly one word.' },
      { role: 'user', content: 'ping' },
    ],
    stream: true,
  }

  try {
    const built = provider.translation.buildUpstreamBody(rawBody, {
      model: settings.model,
      effort: settings.reasoningEffort,
    })
    const upstream = await provider.upstream.postChatRequest({
      body: built.body,
      sessionId: built.promptCacheKey || testConnectionId,
      conversationId: built.promptCacheKey || testConnectionId,
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
