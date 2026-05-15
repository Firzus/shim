import type { GenericMutationCtx } from 'convex/server'
import type { DataModel } from './_generated/dataModel'

export const SINGLETON_KEY = 'singleton' as const

type Ctx = GenericMutationCtx<DataModel>

// Upsert helpers for singleton tables (`by_key` indexed, one row keyed
// `"singleton"`). One helper per table keeps the types concrete; add a new
// helper when introducing a new singleton.

export async function upsertOauthTokens(
  ctx: Ctx,
  args: {
    accessToken: string
    refreshToken: string
    idToken?: string
    chatgptAccountId: string
    planType?: string | null
    expiresAt: number
    scopes: string[]
    obtainedAt: number
  },
): Promise<void> {
  const existing = await ctx.db
    .query('oauthTokens')
    .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
    .unique()
  if (existing) await ctx.db.patch(existing._id, args)
  else await ctx.db.insert('oauthTokens', { key: SINGLETON_KEY, ...args })
}

export async function upsertPlanUsageSnapshot(
  ctx: Ctx,
  args: { capturedAt: number; raw?: unknown },
): Promise<void> {
  const existing = await ctx.db
    .query('planUsageSnapshot')
    .withIndex('by_key', (q) => q.eq('key', SINGLETON_KEY))
    .unique()
  if (existing) await ctx.db.patch(existing._id, args)
  else await ctx.db.insert('planUsageSnapshot', { key: SINGLETON_KEY, ...args })
}

export async function upsertShimSettings(
  ctx: Ctx,
  args: { model?: string; reasoningEffort?: string; tunnelUrl?: string },
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
