import { v } from 'convex/values'
import { SINGLETON_KEY, upsertPlanUsageSnapshot } from './helpers'
import { mutation, query } from './_generated/server'

// Singleton snapshot of `/backend-api/codex/usage`. The poller in
// src/lib/server/plan-usage-poller.ts writes here every 5 min; the dashboard
// reads it via /api/usage so the UI doesn't depend on a live upstream call.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('planUsageSnapshot')
      .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
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
    capturedAt: v.number(),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await upsertPlanUsageSnapshot(ctx, args)
  },
})
