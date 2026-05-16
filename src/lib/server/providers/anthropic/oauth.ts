import { api } from '@/../convex/_generated/api'
import { convex } from '../../convex'
import { logger, toErrorMessage } from '../../logger'
import {
  ANTHROPIC_AUTHORIZE_URL,
  ANTHROPIC_TOKEN_URL,
  CLAUDE_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
} from './constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnthropicAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  obtainedAt: number
}

export interface AnthropicCachedToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface AnthropicTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type?: string
  scope?: string
}

// ---------------------------------------------------------------------------
// In-process cache + refresh coalescing
// ---------------------------------------------------------------------------

let cachedToken: AnthropicCachedToken | null = null

// Anthropic rotates the refresh_token on every call, so two parallel refreshes
// would race: one wins, the other fails with an invalid refresh_token. A
// single in-flight Promise lets all concurrent callers share the outcome.
let refreshInFlight: Promise<AnthropicCachedToken | null> | null = null

// Subtract a safety margin so we refresh before tokens technically expire.
const EXPIRY_SAFETY_MS = 60 * 1000

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export function getAuthorizationURL(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    code: 'true',
    client_id: CLAUDE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })
  return `${ANTHROPIC_AUTHORIZE_URL}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Token exchange (initial code-for-tokens)
// ---------------------------------------------------------------------------

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  state: string,
): Promise<AnthropicAuth> {
  // Anthropic's hosted callback page hands back a `code#state` string — strip
  // the fragment before the exchange.
  const cleanCode = code.includes('#') ? (code.split('#')[0] ?? code) : code

  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: cleanCode,
      client_id: CLAUDE_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
      state,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as AnthropicTokenResponse
  const now = Date.now()

  const auth: AnthropicAuth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    scopes: (data.scope ?? OAUTH_SCOPES).split(' '),
    obtainedAt: now,
  }

  await saveCredentials(auth)

  cachedToken = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
  }

  return auth
}

// ---------------------------------------------------------------------------
// Persistence (Convex-backed)
// ---------------------------------------------------------------------------

async function saveCredentials(auth: AnthropicAuth): Promise<void> {
  // Anthropic returns no id_token / account id — `metadata` stays empty.
  await convex.mutation(api.oauthTokens.save, {
    provider: 'anthropic',
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
    obtainedAt: auth.obtainedAt,
    scopes: auth.scopes,
    planType: null,
    metadata: {},
  })
}

async function loadCredentials(): Promise<AnthropicAuth | null> {
  try {
    const row = await convex.query(api.oauthTokens.get, { provider: 'anthropic' })
    if (!row) return null
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      obtainedAt: row.obtainedAt,
    }
  } catch (error) {
    logger.error(`[anthropic-oauth] failed to load credentials: ${toErrorMessage(error)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Refresh (refresh_token rotates on every call — coalesced via refreshInFlight)
// ---------------------------------------------------------------------------

async function refreshAccessToken(refreshTokenValue: string): Promise<AnthropicCachedToken | null> {
  try {
    logger.info('[anthropic-oauth] refreshing access token')

    const response = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: CLAUDE_CLIENT_ID,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[anthropic-oauth] refresh failed: ${response.status} ${errorText}`)
      return null
    }

    const data = (await response.json()) as AnthropicTokenResponse
    const now = Date.now()
    const expiresAt = now + data.expires_in * 1000

    const fresh: AnthropicCachedToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    }

    await saveCredentials({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scopes: (data.scope ?? OAUTH_SCOPES).split(' '),
      obtainedAt: now,
    })

    cachedToken = fresh
    logger.info('[anthropic-oauth] token refreshed successfully')
    return fresh
  } catch (error) {
    logger.error(`[anthropic-oauth] refresh threw: ${toErrorMessage(error)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main entry: get a valid token (cache → Convex → refresh)
// ---------------------------------------------------------------------------

export async function getValidToken(): Promise<AnthropicCachedToken | null> {
  const now = Date.now()
  if (cachedToken && now + EXPIRY_SAFETY_MS < cachedToken.expiresAt) {
    return cachedToken
  }

  const auth = await loadCredentials()
  if (!auth) return null

  if (now + EXPIRY_SAFETY_MS < auth.expiresAt) {
    cachedToken = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
    }
    return cachedToken
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(auth.refreshToken).finally(() => {
      refreshInFlight = null
    })
  }
  const refreshed = await refreshInFlight
  if (refreshed) return refreshed

  logger.error('[anthropic-oauth] refresh failed — re-authenticate via /login')
  cachedToken = null
  return null
}

export function clearCachedToken(): void {
  cachedToken = null
}
