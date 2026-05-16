import { logger } from '../../logger'
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  CLAUDE_CODE_BETA_HEADERS,
  CLAUDE_CODE_USER_AGENT,
} from './constants'
import { clearCachedToken, getValidToken } from './oauth'
import { captureAnthropicUsage } from './plan-usage'

export interface AnthropicRequestOptions {
  body: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * POST a Claude Code Messages request upstream. Adds every mandatory header
 * (Bearer token, beta flags, version, Claude Code UA).
 *
 * Returns the raw Response on success and on 4xx/5xx (the caller decides error
 * semantics). Throws only on transport failures or a missing token.
 */
export async function postAnthropicMessages(opts: AnthropicRequestOptions): Promise<Response> {
  return performRequest(opts, /* allowRetry */ true)
}

async function performRequest(
  opts: AnthropicRequestOptions,
  allowRetry: boolean,
): Promise<Response> {
  const token = await getValidToken()
  if (!token) {
    throw new Error('No valid Anthropic token — re-authenticate via the dashboard')
  }

  const response = await fetch(`${ANTHROPIC_MESSAGES_URL}?beta=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'anthropic-beta': CLAUDE_CODE_BETA_HEADERS,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
      'User-Agent': CLAUDE_CODE_USER_AGENT,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  })

  // Capture the unified rate-limit headers on every response (200 + 4xx) —
  // this is the source of truth for Anthropic plan usage.
  captureAnthropicUsage(response.headers)

  // 401: token rejected → drop process cache and retry once (the Convex row
  // may be stale because another process refreshed).
  if (response.status === 401 && allowRetry) {
    logger.warn('[anthropic] upstream 401 — clearing token cache and retrying once')
    clearCachedToken()
    return performRequest(opts, /* allowRetry */ false)
  }

  return response
}
