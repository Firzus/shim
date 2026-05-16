import type { GenericMutationCtx } from 'convex/server'
import type { DataModel } from './_generated/dataModel'

export const SINGLETON_KEY = 'singleton' as const

export type ProviderId = 'codex' | 'anthropic'

type Ctx = GenericMutationCtx<DataModel>

// Upsert helpers for the dashboard-owned tables. `oauthTokens` and
// `planUsageSnapshot` hold one row per provider (`by_provider` indexed);
// `shimSettings` is a true singleton (`by_key`).

export async function upsertOauthTokens(
  ctx: Ctx,
  args: {
    provider: ProviderId
    accessToken: string
    refreshToken: string
    expiresAt: number
    obtainedAt: number
    scopes: string[]
    planType?: string | null
    metadata?: unknown
  },
): Promise<void> {
  const existing = await ctx.db
    .query('oauthTokens')
    .withIndex('by_provider', (q) => q.eq('provider', args.provider))
    .unique()
  if (existing) await ctx.db.patch(existing._id, args)
  else await ctx.db.insert('oauthTokens', args)
}

export async function upsertPlanUsageSnapshot(
  ctx: Ctx,
  args: { provider: ProviderId; capturedAt: number; raw?: unknown },
): Promise<void> {
  const existing = await ctx.db
    .query('planUsageSnapshot')
    .withIndex('by_provider', (q) => q.eq('provider', args.provider))
    .unique()
  if (existing) await ctx.db.patch(existing._id, args)
  else await ctx.db.insert('planUsageSnapshot', args)
}

export async function upsertShimSettings(
  ctx: Ctx,
  args: {
    activeProvider?: ProviderId
    codexModel?: string
    codexEffort?: string
    anthropicModel?: string
    anthropicEffort?: string
    tunnelUrl?: string
  },
): Promise<void> {
  const existing = await ctx.db
    .query('shimSettings')
    .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
    .unique()
  const payload = { ...args, updatedAt: Date.now() }
  if (existing) await ctx.db.patch(existing._id, payload)
  else await ctx.db.insert('shimSettings', { key: SINGLETON_KEY, ...payload })
}

// Adjust a named counter atomically. Negative deltas decrement; the counter
// is clamped at zero so a -N bump on a fresh counter lands at 0, not below.
export async function bumpCounter(ctx: Ctx, key: string, delta: number): Promise<void> {
  const existing = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()
  if (existing) await ctx.db.patch(existing._id, { count: Math.max(0, existing.count + delta) })
  else await ctx.db.insert('counters', { key, count: Math.max(0, delta) })
}

export async function setCounter(ctx: Ctx, key: string, count: number): Promise<void> {
  const existing = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()
  if (existing) await ctx.db.patch(existing._id, { count })
  else await ctx.db.insert('counters', { key, count })
}
