// Response types for the dashboard's API — derived, never hand-written.
//
// Each type is the inferred return of its server function (./server-fns.ts),
// so the client and server share one definition: change a handler and every
// consumer is re-checked by TypeScript. Components keep importing from here.

import type {
  exchangeCallback,
  getAnalytics,
  getAuthStatus,
  getSettings,
  getUsage,
  initLogin,
  runTestConnection,
} from './server-fns'

// Upstream Codex rate-limit shapes + the settings-patch input — re-exported so
// consumers have a single import surface.
export type { RateLimit, RateLimitWindow, UsageRaw } from './schemas'
export type { SaveSettingsInput } from './schemas'

export type AuthStatus = Awaited<ReturnType<typeof getAuthStatus>>
export type Settings = Awaited<ReturnType<typeof getSettings>>
export type Analytics = Awaited<ReturnType<typeof getAnalytics>>
// getUsage now returns both providers; `ProviderUsage` is the per-provider slice.
export type UsageSnapshot = Awaited<ReturnType<typeof getUsage>>
export type ProviderUsage = UsageSnapshot['codex']
export type LoginResponse = Awaited<ReturnType<typeof initLogin>>
export type CallbackResponse = Awaited<ReturnType<typeof exchangeCallback>>
export type TestResponse = Awaited<ReturnType<typeof runTestConnection>>
