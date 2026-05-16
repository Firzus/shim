// Provider registry — the single lookup point for the proxy handler, OAuth
// server functions, and plan-usage poller.

import { anthropicProvider } from './anthropic'
import { codexProvider } from './codex'
import type { Provider, ProviderId } from './types'

export type { Provider, ProviderId } from './types'

const registry = new Map<ProviderId, Provider>([
  ['codex', codexProvider],
  ['anthropic', anthropicProvider],
])

export function getProvider(id: ProviderId): Provider {
  const provider = registry.get(id)
  if (!provider) throw new Error(`unknown provider: ${id}`)
  return provider
}

export function getRegisteredProviders(): Provider[] {
  return Array.from(registry.values())
}

export function isRegisteredProvider(id: string): id is ProviderId {
  return registry.has(id as ProviderId)
}
