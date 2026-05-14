import { v } from 'convex/values'
import { mutation } from './_generated/server'

// Active PKCE flows live here while the user is bouncing between OpenAI's
// authorize page and the proxy's callback. Each row is keyed by `state` and
// expires after PKCE_TTL_MS — stale rows are swept lazily on every write.

const PKCE_TTL_MS = 10 * 60 * 1000

export const insert = mutation({
  args: { state: v.string(), codeVerifier: v.string() },
  handler: async (ctx, { state, codeVerifier }) => {
    const cutoff = Date.now() - PKCE_TTL_MS
    const stale = await ctx.db
      .query('pkceState')
      .filter((q) => q.lt(q.field('createdAt'), cutoff))
      .collect()
    for (const row of stale) await ctx.db.delete(row._id)

    await ctx.db.insert('pkceState', {
      state,
      codeVerifier,
      createdAt: Date.now(),
    })
  },
})

export const consume = mutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query('pkceState')
      .withIndex('by_state', (q) => q.eq('state', state))
      .unique()

    if (!row) return null

    await ctx.db.delete(row._id)

    if (Date.now() - row.createdAt > PKCE_TTL_MS) return null
    return { codeVerifier: row.codeVerifier }
  },
})
