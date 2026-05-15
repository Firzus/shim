// Zod schemas for the dashboard server functions' inputs — the single
// runtime + compile-time source of truth for what crosses the client → server
// boundary. Return types are inferred end-to-end from the server functions
// themselves (see ./server-fns.ts and ./types.ts), so only inputs live here.

import { z } from 'zod'

// Patch sent to `saveSettings`. Field-level validity (allowed model / effort,
// tunnel-URL shape) is enforced server-side in the handler, which owns the
// allow-lists and can return precise messages.
export const SaveSettingsSchema = z.object({
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

// OAuth fallback: the user pastes the full redirect URL from their browser.
export const ExchangeCallbackSchema = z.object({
  redirectUrl: z.string().min(1, 'paste the full redirect URL'),
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
