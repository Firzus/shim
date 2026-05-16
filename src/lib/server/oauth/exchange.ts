import { api } from '#/../convex/_generated/api'
import { convex } from '../convex'
import { logger } from '../logger'
import { getProvider } from '../providers'
import type { ProviderId } from '../providers/types'

/**
 * Consume the pending PKCE state from Convex and exchange the OAuth code for
 * tokens via the matching provider. Atomic in the sense that:
 *  - `pkceState.consume` deletes the row regardless of whether the exchange
 *    succeeds, so a leaked state can't be replayed.
 *  - The persisted `provider` is asserted to match the caller's expectation,
 *    guarding against a cross-provider state replay.
 *  - If the exchange fails, the error surfaces — the caller decides whether to
 *    show it on the dashboard or log it from the listener path.
 */
export async function exchangeAndPersist(
  provider: ProviderId,
  code: string,
  state: string,
): Promise<void> {
  const pkce = await convex.mutation(api.pkceState.consume, { state })
  if (!pkce) {
    throw new Error('Invalid or expired state — restart the login flow')
  }
  if (pkce.provider !== provider) {
    throw new Error('state/provider mismatch — restart the login flow')
  }
  await getProvider(provider).oauth.exchangeCode(code, pkce.codeVerifier, state)
  logger.info(`[auth] OAuth login successful for provider=${provider}`)
}
