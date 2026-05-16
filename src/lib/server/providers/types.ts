// Provider abstraction — the contract every upstream backend (Codex,
// Anthropic) implements so the proxy handler, OAuth server functions, and
// plan-usage poller stay provider-agnostic.
//
// A provider is a plain value object assembled once at module load (matches
// the functional style of the existing codebase — no class hierarchy).

export type ProviderId = 'codex' | 'anthropic'

// Token usage normalised across providers — exactly the shape the proxy
// handler feeds into `recordRequestSafe`.
export interface NormalizedUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
}

// Credentials in the shape persisted to the Convex `oauthTokens` table.
// Provider-specific extras (Codex `chatgptAccountId`/`idToken`) live in
// `metadata` so the column set stays generic.
export interface ProviderCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  obtainedAt: number
  scopes: string[]
  planType: string | null
  metadata: Record<string, unknown>
}

export interface ProviderMetadata {
  id: ProviderId
  displayName: string
  defaultModel: string
  defaultEffort: string
  allowedModels: readonly string[]
  allowedEfforts: readonly string[]
}

// How the OAuth callback is captured. `loopback` spins up a localhost HTTP
// server (Codex); `hosted-paste` shows the user a code to paste back.
export type RedirectStrategy = 'loopback' | 'hosted-paste'

export interface ProviderOAuth {
  redirectStrategy: RedirectStrategy
  // Both only set when `redirectStrategy === 'loopback'`.
  loopbackPort?: number
  loopbackCallbackPath?: string
  getAuthorizationURL(codeChallenge: string, state: string): string
  // Exchange the OAuth code for tokens and persist them. Throws on failure.
  exchangeCode(code: string, codeVerifier: string, state: string): Promise<void>
}

export interface ChatRequestOptions {
  body: Record<string, unknown>
  // Some providers (Codex) pin upstream routing on these; others ignore them.
  sessionId: string
  conversationId: string
  signal?: AbortSignal
}

export interface ProviderUpstream {
  // POST a chat request upstream. Returns the raw Response on success and on
  // 4xx/5xx; throws only on transport failures.
  postChatRequest(opts: ChatRequestOptions): Promise<Response>
  // 'poll': usage comes from a dedicated GET endpoint (Codex).
  // 'headers': usage rides on response headers of every chat call (Anthropic).
  usageStrategy: 'poll' | 'headers'
  // Only meaningful when `usageStrategy === 'poll'`.
  fetchPlanUsage(): Promise<Response | null>
}

export interface ResolvedModelSettings {
  model: string
  effort: string
}

export interface BuiltUpstreamRequest {
  body: Record<string, unknown>
  promptCacheKey: string
  requestedModel: string
  appliedModel: string
  inputItemCount: number
  systemPromptLen: number
  toolDefsCount: number
  // Opaque provider-defined data the handler threads back into the stream /
  // buffer translators (e.g. Anthropic's set of user-declared tool names).
  streamContext?: unknown
}

export interface StreamOptions {
  streamId: string
  reportedModel: string
  includeUsage: boolean
  onUsage?: (usage: NormalizedUsage) => void
  onError?: (message: string) => void
  // The `streamContext` produced by `buildUpstreamBody`.
  providerContext?: unknown
}

export interface BufferToCompletionOptions {
  streamId: string
  reportedModel: string
  // The `streamContext` produced by `buildUpstreamBody`.
  providerContext?: unknown
}

export interface BufferedCompletion {
  // The aggregated `chat.completion` JSON, ready for `Response.json`.
  completion: unknown
  usage: NormalizedUsage
  toolCallCount: number
}

export type BufferToCompletionResult = BufferedCompletion | { error: string }

export interface ProviderTranslation {
  // Build the upstream request body from Cursor's raw incoming body, applying
  // the dashboard-resolved model + effort.
  buildUpstreamBody(
    rawBody: Record<string, unknown>,
    settings: ResolvedModelSettings,
  ): BuiltUpstreamRequest
  // Translate the upstream SSE stream into OpenAI chat.completion.chunk SSE.
  createOpenAIStream(
    upstream: ReadableStream<Uint8Array>,
    opts: StreamOptions,
  ): ReadableStream<Uint8Array>
  // Buffer the upstream SSE stream into a single non-streaming chat.completion.
  bufferToCompletion(
    upstream: ReadableStream<Uint8Array>,
    opts: BufferToCompletionOptions,
  ): Promise<BufferToCompletionResult>
}

export interface Provider {
  meta: ProviderMetadata
  oauth: ProviderOAuth
  upstream: ProviderUpstream
  translation: ProviderTranslation
  // Cleared from the in-process token cache (e.g. after a 401 or logout).
  clearCachedToken(): void
}
