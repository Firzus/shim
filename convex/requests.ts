import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { bumpCounter, setCounter } from './helpers'

const REQUESTS_COUNTER_KEY = 'requests'

export const recordRequest = mutation({
  args: {
    timestamp: v.number(),
    model: v.string(),
    provider: v.optional(v.union(v.literal('codex'), v.literal('anthropic'))),
    source: v.union(v.literal('cursor'), v.literal('error')),
    stream: v.boolean(),
    inputTokens: v.optional(v.union(v.number(), v.null())),
    outputTokens: v.optional(v.union(v.number(), v.null())),
    totalTokens: v.optional(v.union(v.number(), v.null())),
    cachedTokens: v.optional(v.union(v.number(), v.null())),
    promptCacheKey: v.optional(v.union(v.string(), v.null())),
    latencyMs: v.optional(v.union(v.number(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    requestedModel: v.optional(v.union(v.string(), v.null())),
    appliedModel: v.optional(v.union(v.string(), v.null())),
    toolDefsCount: v.optional(v.union(v.number(), v.null())),
    toolCallCount: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('requests', args)
    await bumpCounter(ctx, REQUESTS_COUNTER_KEY, 1)
  },
})

const HOUR_MS = 60 * 60 * 1000
const HOURLY_BUCKETS = 24

// Aggregated summary over [since, until]. `now` is passed in (Date.now() in
// queries breaks Convex caching). Alongside the flat totals, `hourly` carries
// 24 fixed buckets covering the last 24h before `periodEnd` (oldest first),
// for the dashboard sparkline; rows older than that window are still counted
// in the totals but fall outside every bucket.
export const getAnalytics = query({
  args: {
    since: v.number(),
    until: v.optional(v.number()),
    now: v.number(),
  },
  handler: async (ctx, { since, until, now }) => {
    const periodEnd = until ?? now

    const rows = await ctx.db
      .query('requests')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', since).lte('timestamp', periodEnd))
      .collect()

    let totalRequests = 0
    let cursorRequests = 0
    let errorRequests = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let lastRequestAt: number | null = null

    const windowStart = periodEnd - HOURLY_BUCKETS * HOUR_MS
    const hourly = Array.from({ length: HOURLY_BUCKETS }, (_, i) => ({
      hour: windowStart + i * HOUR_MS,
      requests: 0,
      errors: 0,
    }))

    for (const row of rows) {
      totalRequests++
      if (row.source === 'cursor') cursorRequests++
      else if (row.source === 'error') errorRequests++
      totalInputTokens += row.inputTokens ?? 0
      totalOutputTokens += row.outputTokens ?? 0
      if (lastRequestAt === null || row.timestamp > lastRequestAt) lastRequestAt = row.timestamp

      const idx = Math.floor((row.timestamp - windowStart) / HOUR_MS)
      if (idx >= 0 && idx < HOURLY_BUCKETS) {
        if (row.source === 'cursor') hourly[idx].requests++
        else if (row.source === 'error') hourly[idx].errors++
      }
    }

    return {
      totalRequests,
      cursorRequests,
      errorRequests,
      totalInputTokens,
      totalOutputTokens,
      periodStart: since,
      periodEnd,
      lastRequestAt,
      hourly,
    }
  },
})

export const getRecentRequests = query({
  args: {
    paginationOpts: paginationOptsValidator,
    since: v.optional(v.number()),
  },
  handler: async (ctx, { paginationOpts, since = 0 }) => {
    const result = await ctx.db
      .query('requests')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', since))
      .order('desc')
      .paginate(paginationOpts)

    const counter = await ctx.db
      .query('counters')
      .withIndex('by_key', (q) => q.eq('key', REQUESTS_COUNTER_KEY))
      .unique()

    return {
      total: counter?.count ?? 0,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      requests: result.page.map((row) => ({
        id: row._id,
        timestamp: row.timestamp,
        model: row.model,
        provider: row.provider ?? null,
        source: row.source,
        stream: row.stream,
        inputTokens: row.inputTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        totalTokens: row.totalTokens ?? null,
        cachedTokens: row.cachedTokens ?? null,
        latencyMs: row.latencyMs ?? null,
        error: row.error ?? null,
        requestedModel: row.requestedModel ?? null,
        appliedModel: row.appliedModel ?? null,
        toolDefsCount: row.toolDefsCount ?? null,
        toolCallCount: row.toolCallCount ?? null,
      })),
    }
  },
})

export const resetAnalytics = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('requests').collect()
    for (const row of all) await ctx.db.delete(row._id)
    await setCounter(ctx, REQUESTS_COUNTER_KEY, 0)
    return { deletedCount: all.length }
  },
})
