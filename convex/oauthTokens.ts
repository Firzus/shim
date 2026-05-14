import { v } from 'convex/values'
import { SINGLETON_KEY, upsertOauthTokens } from './helpers'
import { mutation, query } from './_generated/server'

// SECURITY: these functions hold OAuth access/refresh tokens. They are
// declared as public `mutation`/`query` only because the self-hosted Convex
// HTTP client doesn't expose `setAdminAuth` and we need a way to call them
// from TanStack Start server-only modules. The trust boundary is the docker
// network: port 3220 MUST stay bound to 127.0.0.1 (see docker-compose.yml).

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('oauthTokens')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
      .unique()

    if (!row) return null

    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      idToken: row.idToken ?? null,
      chatgptAccountId: row.chatgptAccountId,
      planType: row.planType ?? null,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      obtainedAt: row.obtainedAt,
    }
  },
})

export const save = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.string(),
    idToken: v.optional(v.string()),
    chatgptAccountId: v.string(),
    planType: v.optional(v.union(v.string(), v.null())),
    expiresAt: v.number(),
    scopes: v.array(v.string()),
    obtainedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await upsertOauthTokens(ctx, args)
  },
})

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('oauthTokens')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

// Public-but-redacted variant for the auth-status endpoint: returns only
// presence + expiry + account metadata, never the tokens themselves.
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('oauthTokens')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
      .unique()

    if (!row) {
      return {
        authenticated: false,
        expiresAt: null as number | null,
        accountId: null as string | null,
        planType: null as string | null,
      }
    }
    return {
      authenticated: true,
      expiresAt: row.expiresAt,
      accountId: row.chatgptAccountId,
      planType: row.planType ?? null,
    }
  },
})
