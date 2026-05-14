import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Schema skeleton — Phase 1 (BLUEPRINT.md §5). Mirrors cctc/convex/schema.ts
// but adapted to OpenAI Codex Responses semantics: tokens, prompt cache key,
// and the `chatgpt_account_id` carried inside the JWT id_token.
//
// Tables grow during Phase 2 (OAuth), Phase 3-4 (proxy logging), Phase 6
// (plan-usage). Indexes are intentionally minimal here — add them when the
// access pattern is concrete.
export default defineSchema({
  // Per-request analytics. Bodies are NEVER stored — only token + routing
  // metadata. Populated by the proxy handler (Phase 3+).
  requests: defineTable({
    timestamp: v.number(),
    model: v.string(),
    source: v.union(v.literal('cursor'), v.literal('error')),
    stream: v.boolean(),

    // OpenAI Responses usage. `total_tokens` mirrors the upstream summary;
    // `cached_tokens` comes from the SSE `response.completed.usage`
    // prompt-cache section (`cached_tokens` ≥ 0 when the upstream hits a
    // cached prefix keyed by `prompt_cache_key`).
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

  // Singleton: stored OAuth credentials from the Codex CLI flow.
  // `chatgptAccountId` is mandatory — `/backend-api/codex/responses` rejects
  // requests without the `Chatgpt-Account-Id` header (BLUEPRINT.md §6.1).
  oauthTokens: defineTable({
    key: v.literal('singleton'),
    accessToken: v.string(),
    refreshToken: v.string(),
    idToken: v.optional(v.string()),
    chatgptAccountId: v.string(),
    planType: v.optional(v.union(v.string(), v.null())),
    expiresAt: v.number(),
    scopes: v.array(v.string()),
    obtainedAt: v.number(),
  }).index('by_key', ['key']),

  // Active PKCE flows. Keyed by the OAuth `state` parameter, holds the
  // matching `code_verifier` until the callback exchanges it (BLUEPRINT.md
  // §8.1). Survives dev reloads; entries are GC'd after exchange.
  pkceState: defineTable({
    state: v.string(),
    codeVerifier: v.string(),
    createdAt: v.number(),
  }).index('by_state', ['state']),

  // Singleton: latest plan-usage snapshot from
  // `/backend-api/codex/usage`. Populated by Phase 6 dashboard polling.
  planUsageSnapshot: defineTable({
    key: v.literal('singleton'),
    capturedAt: v.number(),
    raw: v.optional(v.any()),
  }).index('by_key', ['key']),

  // Materialized counters (avoids O(n) scans like `.collect().length`).
  counters: defineTable({
    key: v.string(),
    count: v.number(),
  }).index('by_key', ['key']),

  // Singleton: dashboard-controlled overrides applied to every upstream call.
  // Cursor sends `model: "codex"` as a sentinel; shim swaps it for whatever
  // the user picked here and forces the matching reasoning effort. Unset
  // fields fall back to the hardcoded defaults in src/lib/server/settings.ts.
  shimSettings: defineTable({
    key: v.literal('singleton'),
    model: v.optional(v.string()),
    reasoningEffort: v.optional(v.string()), // none|low|medium|high
    // Public URL Cursor hits — Cursor BYOK refuses private networks
    // ("Access to private networks is forbidden"), so this MUST be a public
    // address (Cloudflare Tunnel domain or equivalent). Set by the onboarding
    // wizard. Override at deploy time with `CLOUDFLARE_TUNNEL_URL`.
    tunnelUrl: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
})
