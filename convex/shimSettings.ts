import { v } from 'convex/values'
import { SINGLETON_KEY, upsertShimSettings } from './helpers'
import { mutation, query } from './_generated/server'

// Dashboard-driven overrides for upstream calls (model, reasoning, verbosity).
// Cursor sends `model: "codex"` as a sentinel; the proxy reads this singleton
// and stamps the user's chosen Codex model + reasoning config onto the body
// before forwarding. Unset fields fall back to defaults in
// src/lib/server/settings.ts.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('shimSettings')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
      .unique()
    if (!row) return null
    return {
      model: row.model ?? null,
      reasoningEffort: row.reasoningEffort ?? null,
      updatedAt: row.updatedAt,
    }
  },
})

export const save = mutation({
  args: {
    model: v.optional(v.string()),
    reasoningEffort: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await upsertShimSettings(ctx, args)
  },
})
