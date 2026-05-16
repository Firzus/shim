import { v } from 'convex/values'
import { SINGLETON_KEY, upsertShimSettings } from './helpers'
import { mutation, query } from './_generated/server'

// Dashboard-driven overrides for upstream calls. `activeProvider` decides
// where the `shim` model name routes; model + effort are namespaced per
// provider so switching the active provider doesn't reset the model choice.
// Unset fields fall back to defaults in src/lib/server/settings.ts.

const providerValidator = v.union(v.literal('codex'), v.literal('anthropic'))

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('shimSettings')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
      .unique()
    if (!row) return null
    return {
      activeProvider: row.activeProvider ?? null,
      codexModel: row.codexModel ?? null,
      codexEffort: row.codexEffort ?? null,
      anthropicModel: row.anthropicModel ?? null,
      anthropicEffort: row.anthropicEffort ?? null,
      tunnelUrl: row.tunnelUrl ?? null,
      updatedAt: row.updatedAt,
    }
  },
})

export const save = mutation({
  args: {
    activeProvider: v.optional(providerValidator),
    codexModel: v.optional(v.string()),
    codexEffort: v.optional(v.string()),
    anthropicModel: v.optional(v.string()),
    anthropicEffort: v.optional(v.string()),
    tunnelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await upsertShimSettings(ctx, args)
  },
})

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('shimSettings')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})
