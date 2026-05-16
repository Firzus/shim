import { CODEX_JWT_AUTH_CLAIM } from './constants'

// Lightweight JWT decode (NO signature verification — we trust the token
// because we just received it on a TLS connection to auth.openai.com and
// the issuer is hardcoded). We only need the payload claims.

function base64urlDecode(input: string): string {
  // pad with `=` to a multiple of 4
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8')
  }
  // Browser fallback (not used server-side but kept for portability).
  return atob(base64)
}

export interface CodexIdTokenClaims {
  chatgptAccountId: string
  planType: string | null
  raw: Record<string, unknown>
}

/**
 * Extract `chatgpt_account_id` and (best-effort) plan type from the Codex
 * id_token. The id_token from auth.openai.com nests Codex-specific data
 * under the `https://api.openai.com/auth` claim. Plan type lives under the
 * same claim block (`chatgpt_plan_type`).
 */
export function decodeCodexIdToken(idToken: string): CodexIdTokenClaims {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid id_token: expected 3 dot-separated segments')
  }
  const [, payload] = parts
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(base64urlDecode(payload)) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `Invalid id_token payload: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const authBlock = claims[CODEX_JWT_AUTH_CLAIM]
  if (!authBlock || typeof authBlock !== 'object') {
    throw new Error(`id_token is missing the "${CODEX_JWT_AUTH_CLAIM}" claim`)
  }

  const auth = authBlock as Record<string, unknown>
  const accountId = auth.chatgpt_account_id
  if (typeof accountId !== 'string' || !accountId) {
    throw new Error('id_token claim is missing chatgpt_account_id')
  }

  const planType =
    typeof auth.chatgpt_plan_type === 'string' && auth.chatgpt_plan_type.length > 0
      ? auth.chatgpt_plan_type
      : null

  return { chatgptAccountId: accountId, planType, raw: claims }
}
