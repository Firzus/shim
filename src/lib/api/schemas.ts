// Zod schemas for the dashboard server functions' inputs — the single
// runtime + compile-time source of truth for what crosses the client → server
// boundary. Return types are inferred end-to-end from the server functions
// themselves (see ./server-fns.ts and ./types.ts), so only inputs live here.

import { z } from 'zod'

// Which upstream provider an auth/login action targets.
export const ProviderIdSchema = z.enum(['codex', 'anthropic'])
export type ProviderIdInput = z.infer<typeof ProviderIdSchema>

// `initLogin` / `logout` target a provider; omitted ⇒ Codex (back-compat).
export const ProviderActionSchema = z.object({
  provider: ProviderIdSchema.optional(),
})

// Patch sent to `saveSettings`. `provider` selects which provider's model /
// effort to write (omitted ⇒ active provider). Field-level validity is
// enforced server-side in the handler, which owns the per-provider allow-lists.
export const SaveSettingsSchema = z.object({
  provider: ProviderIdSchema.optional(),
  model: z.string().optional(),
  reasoningEffort: z.string().optional(),
  tunnelUrl: z.string().optional(),
})
export type SaveSettingsInput = z.infer<typeof SaveSettingsSchema>

// Analytics window. The dashboard always passes a value; 1h–90d is a sane guard.
export const AnalyticsQuerySchema = z.object({
  sinceHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90),
})

// OAuth callback exchange: the user pastes either the full redirect URL or a
// bare `code#state` string (Anthropic's hosted page shows the latter).
export const ExchangeCallbackSchema = z.object({
  provider: ProviderIdSchema.optional(),
  redirectUrl: z.string().min(1, 'paste the redirect URL or code'),
})
export type ExchangeCallbackInput = z.infer<typeof ExchangeCallbackSchema>

// --- Upstream Codex rate-limit shapes -------------------------------------
// These describe the opaque `raw` blob the plan-usage poller persists (Convex
// types it as `any`). Not Zod-validated — it is external data we only read.

export interface RateLimitWindow {
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
  used_percent: number
}

export interface RateLimit {
  allowed: boolean
  limit_reached: boolean
  primary_window: RateLimitWindow | null
  secondary_window: RateLimitWindow | null
}

export interface UsageRaw {
  plan_type?: string | null
  rate_limit?: RateLimit | null
}
