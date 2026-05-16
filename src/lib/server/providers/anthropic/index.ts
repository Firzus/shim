// Anthropic provider — assembles the `Provider` value object.

import type { Provider } from '../types'
import { postAnthropicMessages } from './client'
import { ANTHROPIC_DEFAULT_MODEL } from './constants'
import { ANTHROPIC_DEFAULT_EFFORT, ANTHROPIC_EFFORTS, ANTHROPIC_MODELS } from './model-map'
import { clearCachedToken, exchangeCode, getAuthorizationURL } from './oauth'
import { buildAnthropicUpstreamBody } from './translation/build'
import { bufferAnthropicToCompletion } from './translation/non-stream'
import { createOpenAIStreamFromAnthropic } from './translation/stream-translator'

export const anthropicProvider: Provider = {
  meta: {
    id: 'anthropic',
    displayName: 'Claude',
    defaultModel: ANTHROPIC_DEFAULT_MODEL,
    defaultEffort: ANTHROPIC_DEFAULT_EFFORT,
    allowedModels: ANTHROPIC_MODELS,
    allowedEfforts: ANTHROPIC_EFFORTS,
  },
  oauth: {
    // Anthropic's OAuth client only registers the hosted callback page, which
    // shows the user a `code#state` string to paste back — no localhost
    // loopback redirect is accepted.
    redirectStrategy: 'hosted-paste',
    getAuthorizationURL,
    async exchangeCode(code, codeVerifier, state) {
      await exchangeCode(code, codeVerifier, state)
    },
  },
  upstream: {
    usageStrategy: 'headers',
    postChatRequest(opts) {
      return postAnthropicMessages({ body: opts.body, signal: opts.signal })
    },
    fetchPlanUsage() {
      // Anthropic exposes usage via response headers, not a poll endpoint.
      return Promise.resolve(null)
    },
  },
  translation: {
    buildUpstreamBody: buildAnthropicUpstreamBody,
    createOpenAIStream: createOpenAIStreamFromAnthropic,
    bufferToCompletion: bufferAnthropicToCompletion,
  },
  clearCachedToken,
}
