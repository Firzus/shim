import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Provider discriminator — shim proxies to one of two upstreams (Codex or
// Anthropic). OAuth sessions, plan-usage snapshots, and PKCE flows are all
// keyed/tagged by provider so both can be authenticated in parallel.
const providerValidator = v.union(v.literal('codex'), v.literal('anthropic'))

export default defineSchema({
  // Per-request analytics. Bodies are NEVER stored — only token + routing
  // metadata. Populated by the proxy handler.
  requests: defineTable({
    timestamp: v.number(),
    model: v.string(),
    source: v.union(v.literal('cursor'), v.literal('error')),
    stream: v.boolean(),

    // Which upstream served the request. Optional: pre-multi-provider rows
    // predate the column.
    provider: v.optional(providerValidator),

    // Token usage. `total_tokens` mirrors the upstream summary; `cached_tokens`
    // comes from the provider's prompt-cache accounting.
    inputTokens: v.optional(v.union(v.number(), v.null())),
    outputTokens: v.optional(v.union(v.number(), v.null())),
    totalTokens: v.optional(v.union(v.number(), v.null())),
    cachedTokens: v.optional(v.union(v.number(), v.null())),

    promptCacheKey: v.optional(v.union(v.string(), v.null())),
    latencyMs: v.optional(v.union(v.number(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),

    // Translator outcome.
    requestedModel: v.optional(v.union(v.string(), v.null())),
    appliedModel: v.optional(v.union(v.string(), v.null())),
    toolDefsCount: v.optional(v.union(v.number(), v.null())),
    toolCallCount: v.optional(v.union(v.number(), v.null())),
  })
    .index('by_timestamp', ['timestamp'])
    .index('by_source_timestamp', ['source', 'timestamp']),

  // OAuth credentials — one row per provider, so Codex and Anthropic stay
  // authenticated in parallel. Provider-specific extras (Codex's
  // `chatgptAccountId` / `idToken`) live in `metadata` to keep the columns
  // generic.
  oauthTokens: defineTable({
    provider: providerValidator,
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    obtainedAt: v.number(),
    scopes: v.array(v.string()),
    planType: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
  }).index('by_provider', ['provider']),

  // Active PKCE flows. Keyed by the OAuth `state` parameter, holds the
  // matching `code_verifier` (and which provider it belongs to) until the
  // callback exchanges it. Survives dev reloads; GC'd after exchange.
  pkceState: defineTable({
    state: v.string(),
    provider: providerValidator,
    codeVerifier: v.string(),
    createdAt: v.number(),
  }).index('by_state', ['state']),

  // Latest plan-usage snapshot — one row per provider. Codex stores its
  // `/usage` JSON; Anthropic stores parsed rate-limit-header data.
  planUsageSnapshot: defineTable({
    provider: providerValidator,
    capturedAt: v.number(),
    raw: v.optional(v.any()),
  }).index('by_provider', ['provider']),

  // Materialized counters (avoids O(n) scans like `.collect().length`).
  counters: defineTable({
    key: v.string(),
    count: v.number(),
  }).index('by_key', ['key']),

  // Singleton: dashboard-controlled overrides applied to every upstream call.
  // `activeProvider` decides where the `shim` model name routes. Model +
  // effort are namespaced per provider so switching the active provider does
  // not force the user to re-pick a model.
  shimSettings: defineTable({
    key: v.literal('singleton'),
    activeProvider: v.optional(providerValidator),
    codexModel: v.optional(v.string()),
    codexEffort: v.optional(v.string()),
    anthropicModel: v.optional(v.string()),
    anthropicEffort: v.optional(v.string()),
    // Public URL Cursor hits — Cursor BYOK refuses private networks, so this
    // MUST be a public address (Cloudflare Tunnel domain or equivalent).
    tunnelUrl: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
})
