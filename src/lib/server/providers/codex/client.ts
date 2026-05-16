import { logger } from '../../logger'
import {
  CODEX_ORIGINATOR,
  CODEX_RESPONSES_URL,
  CODEX_USAGE_URL,
  CODEX_USER_AGENT,
  CODEX_VERSION,
} from './constants'
import { clearCachedToken, getValidToken } from './oauth'
import type { CodexResponsesRequest } from './translation/types'

// Accept either the strict Chat-translated body or the looser passthrough
// shape (Cursor BYOK forwards extra fields like `reasoning`, `include`,
// `encrypted_content` on reasoning items, etc.). The upstream is permissive
// — what matters is `model`, `instructions`, `input`, `stream`, `store`,
// `prompt_cache_key` are present and well-formed.
export type CodexRequestBody = CodexResponsesRequest | Record<string, unknown>

export interface CodexRequestOptions {
  body: CodexRequestBody
  sessionId: string
  conversationId: string
  signal?: AbortSignal
}

/**
 * POST a Codex Responses request upstream. Adds every mandatory header
 * (BLUEPRINT §6.1). The caller decides how to consume the response — for
 * streaming we keep `response.body` as a ReadableStream and feed it to the
 * translator; for non-streaming we buffer it ourselves.
 *
 * Returns the raw Response on success and on 4xx/5xx (so the caller can
 * decide error semantics). Throws only on transport failures.
 */
export async function postCodexResponses(opts: CodexRequestOptions): Promise<Response> {
  return performRequest(opts, /*allowRetry=*/ true)
}

async function performRequest(opts: CodexRequestOptions, allowRetry: boolean): Promise<Response> {
  const token = await getValidToken()
  if (!token) {
    throw new Error('No valid Codex token — re-authenticate via /api/auth/login')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    'Chatgpt-Account-Id': token.chatgptAccountId,
    Originator: CODEX_ORIGINATOR,
    Version: CODEX_VERSION,
    Session_id: opts.sessionId,
    Conversation_id: opts.conversationId,
    'User-Agent': CODEX_USER_AGENT,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    Connection: 'Keep-Alive',
  }

  const response = await fetch(CODEX_RESPONSES_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  })

  // 401: token rejected → drop process cache and retry once (the Convex
  // row may be stale because another process refreshed). Subsequent 401
  // means real auth failure — surface to caller.
  if (response.status === 401 && allowRetry) {
    logger.warn('[codex] upstream 401 — clearing token cache and retrying once')
    clearCachedToken()
    return performRequest(opts, /*allowRetry=*/ false)
  }

  return response
}

export async function fetchPlanUsage(): Promise<Response> {
  const token = await getValidToken()
  if (!token) throw new Error('No valid Codex token')

  return fetch(CODEX_USAGE_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Chatgpt-Account-Id': token.chatgptAccountId,
      Originator: CODEX_ORIGINATOR,
      Version: CODEX_VERSION,
      'User-Agent': CODEX_USER_AGENT,
      Accept: 'application/json',
    },
  })
}
