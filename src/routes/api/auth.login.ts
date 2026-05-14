import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'
import { logger } from '#/lib/server/logger'
import { getAuthorizationURL } from '#/lib/server/oauth/codex-oauth'
import { startCallbackListener } from '#/lib/server/oauth/listener'
import { generatePKCE } from '#/lib/server/oauth/pkce'
import { exchangeAndPersist } from '#/lib/server/oauth/exchange'

// Single-user proxy on the host machine, so we drive the full flow from a
// single `POST /api/auth/login` endpoint:
//   1. Generate PKCE + state, persist verifier in Convex
//   2. Spin up the localhost:1455 listener (BLUEPRINT §8.1)
//   3. Return the authorize URL — the UI opens it in a new tab
//   4. Listener resolves on callback, we exchange the code, persist tokens
//
// Step 4 runs in the background after the response is sent. The UI polls
// /api/auth/status to detect completion.

interface LoginResponse {
  authURL: string
  state: string
  listenerActive: boolean
  fallbackAvailable: boolean
}

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async () => {
        const { codeVerifier, codeChallenge } = await generatePKCE()
        const state = crypto.randomUUID()

        await convex.mutation(api.pkceState.insert, { state, codeVerifier })

        const authURL = getAuthorizationURL(codeChallenge, state)

        let listenerActive = false
        try {
          const callbackPromise = startCallbackListener()
          listenerActive = true
          // Fire-and-forget completion: when the listener resolves, exchange
          // the code for tokens. Errors are logged but don't propagate to
          // this response — the dashboard polls /api/auth/status to learn
          // about success/failure.
          void callbackPromise.then(
            async ({ code, state: callbackState }) => {
              try {
                await exchangeAndPersist(code, callbackState)
                logger.info('[auth] login flow completed via localhost:1455 listener')
              } catch (error) {
                logger.error(
                  `[auth] post-callback exchange failed: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                )
              }
            },
            (error) => {
              logger.warn(
                `[auth] listener rejected: ${error instanceof Error ? error.message : String(error)}`,
              )
            },
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn(`[auth] could not start listener (${message}) — paste fallback only`)
        }

        const payload: LoginResponse = {
          authURL,
          state,
          listenerActive,
          fallbackAvailable: true,
        }
        return Response.json(payload)
      },
    },
  },
})
