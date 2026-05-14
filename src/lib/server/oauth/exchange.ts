import { api } from '#/../convex/_generated/api'
import { convex } from '../convex'
import { logger } from '../logger'
import { exchangeCode } from './codex-oauth'

/**
 * Consume the pending PKCE state from Convex and exchange the OAuth code
 * for tokens. Atomic in the sense that:
 *  - `pkceState.consume` deletes the row regardless of whether the exchange
 *    succeeds, so a leaked state can't be replayed.
 *  - If the exchange fails, we surface the error — the caller decides
 *    whether to show it on the dashboard or log it from the listener path.
 */
export async function exchangeAndPersist(code: string, state: string): Promise<void> {
  const pkce = await convex.mutation(api.pkceState.consume, { state })
  if (!pkce) {
    throw new Error('Invalid or expired state — restart the login flow')
  }
  const auth = await exchangeCode(code, pkce.codeVerifier)
  const expiresIn = Math.round((auth.expiresAt - Date.now()) / 1000 / 60)
  logger.info(
    `[auth] OAuth login successful — token expires in ${expiresIn}m, accountId=${auth.chatgptAccountId}`,
  )
}
