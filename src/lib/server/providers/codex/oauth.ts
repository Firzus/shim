import { api } from '@/../convex/_generated/api'
import { convex } from '../../convex'
import { logger, toErrorMessage } from '../../logger'
import {
  CODEX_AUTHORIZE_EXTRA_PARAMS,
  CODEX_AUTHORIZE_URL,
  CODEX_CLIENT_ID,
  CODEX_REDIRECT_URI,
  CODEX_SCOPES,
  CODEX_TOKEN_URL,
} from './constants'
import { decodeCodexIdToken } from './jwt'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodexAuth {
  accessToken: string
  refreshToken: string
  idToken?: string
  chatgptAccountId: string
  planType: string | null
  expiresAt: number
  scopes: string[]
  obtainedAt: number
}

export interface CachedToken {
  accessToken: string
  refreshToken: string
  chatgptAccountId: string
  expiresAt: number
}

interface CodexTokenResponse {
  access_token: string
  refresh_token: string
  id_token?: string
  expires_in: number
  scope?: string
  token_type?: string
}

// ---------------------------------------------------------------------------
// In-process cache + refresh coalescing
// ---------------------------------------------------------------------------

let cachedToken: CachedToken | null = null
let refreshInFlight: Promise<CachedToken | null> | null = null

// Subtract a safety margin so we refresh before tokens technically expire.
const EXPIRY_SAFETY_MS = 60 * 1000

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export function getAuthorizationURL(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CODEX_REDIRECT_URI,
    scope: CODEX_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    ...CODEX_AUTHORIZE_EXTRA_PARAMS,
  })
  return `${CODEX_AUTHORIZE_URL}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Token exchange (initial code-for-tokens)
// ---------------------------------------------------------------------------

export async function exchangeCode(code: string, codeVerifier: string): Promise<CodexAuth> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CODEX_REDIRECT_URI,
    code_verifier: codeVerifier,
  })

  const response = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as CodexTokenResponse
  if (!data.id_token) {
    throw new Error('Token exchange succeeded but id_token is missing — cannot derive account id')
  }
  const claims = decodeCodexIdToken(data.id_token)

  const now = Date.now()
  const auth: CodexAuth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    chatgptAccountId: claims.chatgptAccountId,
    planType: claims.planType,
    expiresAt: now + data.expires_in * 1000,
    scopes: (data.scope ?? CODEX_SCOPES).split(' '),
    obtainedAt: now,
  }

  await saveCredentials(auth)

  cachedToken = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    chatgptAccountId: auth.chatgptAccountId,
    expiresAt: auth.expiresAt,
  }

  return auth
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function saveCredentials(auth: CodexAuth): Promise<void> {
  // Codex-specific identifiers (account id, raw id_token) live in the generic
  // `metadata` blob so the Convex column set stays provider-agnostic.
  await convex.mutation(api.oauthTokens.save, {
    provider: 'codex',
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    planType: auth.planType,
    expiresAt: auth.expiresAt,
    scopes: auth.scopes,
    obtainedAt: auth.obtainedAt,
    metadata: { chatgptAccountId: auth.chatgptAccountId, idToken: auth.idToken },
  })
}

async function loadCredentials(): Promise<CodexAuth | null> {
  try {
    const row = await convex.query(api.oauthTokens.get, { provider: 'codex' })
    if (!row) return null
    const metadata = row.metadata
    const chatgptAccountId =
      typeof metadata.chatgptAccountId === 'string' ? metadata.chatgptAccountId : ''
    if (!chatgptAccountId) {
      logger.error('[oauth] stored Codex credentials are missing chatgptAccountId')
      return null
    }
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      idToken: typeof metadata.idToken === 'string' ? metadata.idToken : undefined,
      chatgptAccountId,
      planType: row.planType,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      obtainedAt: row.obtainedAt,
    }
  } catch (error) {
    logger.error(`[oauth] failed to load credentials: ${toErrorMessage(error)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Refresh (with rotation safety: refresh_token rotates on every call,
// so two concurrent refreshes would race — only one wins, the other gets
// invalid_grant. The in-flight Promise serialises N concurrent callers.)
// ---------------------------------------------------------------------------

async function refreshAccessToken(refreshTokenValue: string): Promise<CachedToken | null> {
  try {
    logger.info('[oauth] refreshing Codex access token')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
      client_id: CODEX_CLIENT_ID,
      scope: CODEX_SCOPES,
    })

    const response = await fetch(CODEX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[oauth] refresh failed: ${response.status} ${errorText}`)
      return null
    }

    const data = (await response.json()) as CodexTokenResponse

    // The refresh response may or may not include a fresh id_token. If it
    // does, re-derive the account id (in case OpenAI rotates the chatgpt
    // account claims). Otherwise, reuse the cached account id.
    let chatgptAccountId: string
    let planType: string | null
    if (data.id_token) {
      const claims = decodeCodexIdToken(data.id_token)
      chatgptAccountId = claims.chatgptAccountId
      planType = claims.planType
    } else {
      const previous = await loadCredentials()
      if (!previous) {
        logger.error('[oauth] refresh succeeded but no previous account id is known')
        return null
      }
      chatgptAccountId = previous.chatgptAccountId
      planType = previous.planType
    }

    const now = Date.now()
    const expiresAt = now + data.expires_in * 1000

    const fresh: CachedToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      chatgptAccountId,
      expiresAt,
    }

    await saveCredentials({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      chatgptAccountId,
      planType,
      expiresAt,
      scopes: (data.scope ?? CODEX_SCOPES).split(' '),
      obtainedAt: now,
    })

    cachedToken = fresh
    logger.info('[oauth] token refreshed successfully')
    return fresh
  } catch (error) {
    logger.error(`[oauth] refresh threw: ${toErrorMessage(error)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main entry: get a valid token (cache → Convex → refresh)
// ---------------------------------------------------------------------------

export async function getValidToken(): Promise<CachedToken | null> {
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
      chatgptAccountId: auth.chatgptAccountId,
      expiresAt: auth.expiresAt,
    }
    return cachedToken
  }

  // Refresh — coalesce so N concurrent callers share a single network
  // round-trip and a single rotated refresh_token.
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(auth.refreshToken).finally(() => {
      refreshInFlight = null
    })
  }
  const refreshed = await refreshInFlight
  if (refreshed) return refreshed

  logger.error('[oauth] refresh failed — re-authenticate via /login')
  cachedToken = null
  return null
}

export async function hasCredentials(): Promise<boolean> {
  try {
    const status = await convex.query(api.oauthTokens.getStatus, {})
    return status.codex.authenticated
  } catch (error) {
    logger.warn(`[oauth] hasCredentials check failed: ${toErrorMessage(error)}`)
    return false
  }
}

export function clearCachedToken(): void {
  cachedToken = null
}
