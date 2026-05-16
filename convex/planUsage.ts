import { v } from 'convex/values'
import { upsertPlanUsageSnapshot } from './helpers'
import { mutation, query } from './_generated/server'

// Plan-usage snapshot — one row per provider. The poller (Codex) and the
// chat handler (Anthropic, header-driven) write here; the dashboard reads it
// so the UI doesn't depend on a live upstream call.

const providerValidator = v.union(v.literal('codex'), v.literal('anthropic'))

export const get = query({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }) => {
    const row = await ctx.db
      .query('planUsageSnapshot')
      .withIndex('by_provider', (q) => q.eq('provider', provider))
      .unique()
    if (!row) return null
    return {
      capturedAt: row.capturedAt,
      raw: row.raw ?? null,
    }
  },
})

export const save = mutation({
  args: {
    provider: providerValidator,
    capturedAt: v.number(),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await upsertPlanUsageSnapshot(ctx, args)
  },
})

export const clear = mutation({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }) => {
    const existing = await ctx.db
      .query('planUsageSnapshot')
      .withIndex('by_provider', (q) => q.eq('provider', provider))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})
