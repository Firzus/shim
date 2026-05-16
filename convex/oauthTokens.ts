import { v } from 'convex/values'
import type { ProviderId } from './helpers'
import { upsertOauthTokens } from './helpers'
import { mutation, query } from './_generated/server'

// SECURITY: these functions hold OAuth access/refresh tokens. They are
// declared as public `mutation`/`query` only because the self-hosted Convex
// HTTP client doesn't expose `setAdminAuth` and we need a way to call them
// from TanStack Start server-only modules. The trust boundary is the docker
// network: port 3220 MUST stay bound to 127.0.0.1 (see docker-compose.yml).

const providerValidator = v.union(v.literal('codex'), v.literal('anthropic'))

export const get = query({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }) => {
    const row = await ctx.db
      .query('oauthTokens')
      .withIndex('by_provider', (q) => q.eq('provider', provider))
      .unique()

    if (!row) return null

    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      planType: row.planType ?? null,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      obtainedAt: row.obtainedAt,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }
  },
})

export const save = mutation({
  args: {
    provider: providerValidator,
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    obtainedAt: v.number(),
    scopes: v.array(v.string()),
    planType: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await upsertOauthTokens(ctx, args)
  },
})

export const clear = mutation({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }) => {
    const existing = await ctx.db
      .query('oauthTokens')
      .withIndex('by_provider', (q) => q.eq('provider', provider))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

// Public-but-redacted status for the auth-status endpoint: presence + expiry
// + account metadata for BOTH providers, never the tokens themselves.
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const statusFor = async (provider: ProviderId) => {
      const row = await ctx.db
        .query('oauthTokens')
        .withIndex('by_provider', (q) => q.eq('provider', provider))
        .unique()
      if (!row) {
        return {
          authenticated: false,
          expiresAt: null as number | null,
          accountId: null as string | null,
          planType: null as string | null,
          scopes: [] as string[],
        }
      }
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      const accountId =
        typeof metadata.chatgptAccountId === 'string' ? metadata.chatgptAccountId : null
      return {
        authenticated: true,
        expiresAt: row.expiresAt,
        accountId,
        planType: row.planType ?? null,
        scopes: row.scopes,
      }
    }

    return {
      codex: await statusFor('codex'),
      anthropic: await statusFor('anthropic'),
    }
  },
})
