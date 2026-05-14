import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'
import { ACCEPTED_CODEX_MODELS } from '#/lib/server/translation/model-map'
import { invalidateShimSettingsCache, SHIM_SETTINGS_DEFAULTS } from '#/lib/server/settings'

// Dashboard reads + writes the singleton that drives every upstream call's
// model + reasoning effort. Cursor's body is overridden at request time by
// src/lib/server/handlers/chat-completions.ts.

const ALLOWED_MODELS = new Set(ACCEPTED_CODEX_MODELS)
const ALLOWED_EFFORTS = new Set(['none', 'low', 'medium', 'high'])

interface SettingsPayload {
  model?: string
  reasoningEffort?: string
  tunnelUrl?: string | null
}

// Validate & normalize a tunnel URL string. Cursor BYOK rejects private
// networks ("Access to private networks is forbidden"), so we accept only
// https://… (or http://… for non-loopback hosts in dev) and strip any
// trailing slash / path / query so the wizard always shows `<origin>/v1`.
function normalizeTunnelUrl(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'tunnel URL is required' }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'invalid URL — expected https://your-domain' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'protocol must be https or http' }
  }
  const host = url.hostname.toLowerCase()
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (isLoopback) {
    return {
      ok: false,
      error: 'localhost is a private network — Cursor BYOK refuses it. Use a public domain.',
    }
  }
  return { ok: true, value: `${url.protocol}//${url.host}` }
}

function resolveTunnelUrl(stored: string | null | undefined): {
  tunnelUrl: string | null
  tunnelUrlSource: 'env' | 'settings' | null
} {
  const envUrl = process.env.CLOUDFLARE_TUNNEL_URL?.trim()
  if (envUrl) return { tunnelUrl: envUrl, tunnelUrlSource: 'env' }
  if (stored) return { tunnelUrl: stored, tunnelUrlSource: 'settings' }
  return { tunnelUrl: null, tunnelUrlSource: null }
}

export const Route = createFileRoute('/api/settings')({
  server: {
    handlers: {
      GET: async () => {
        const row = await convex.query(api.shimSettings.get, {})
        const { tunnelUrl, tunnelUrlSource } = resolveTunnelUrl(row?.tunnelUrl)
        return Response.json({
          model: row?.model ?? SHIM_SETTINGS_DEFAULTS.model,
          reasoningEffort: row?.reasoningEffort ?? SHIM_SETTINGS_DEFAULTS.reasoningEffort,
          tunnelUrl,
          tunnelUrlSource,
          updatedAt: row?.updatedAt ?? null,
          allowed: {
            models: Array.from(ALLOWED_MODELS),
            efforts: Array.from(ALLOWED_EFFORTS),
          },
        })
      },
      POST: async ({ request }) => {
        let body: SettingsPayload
        try {
          body = (await request.json()) as SettingsPayload
        } catch {
          return Response.json({ error: 'invalid JSON' }, { status: 400 })
        }

        if (body.model !== undefined && !ALLOWED_MODELS.has(body.model)) {
          return Response.json({ error: `unsupported model: ${body.model}` }, { status: 400 })
        }
        if (body.reasoningEffort !== undefined && !ALLOWED_EFFORTS.has(body.reasoningEffort)) {
          return Response.json(
            { error: `unsupported effort: ${body.reasoningEffort}` },
            { status: 400 },
          )
        }

        let normalizedTunnel: string | undefined
        if (body.tunnelUrl !== undefined && body.tunnelUrl !== null) {
          const result = normalizeTunnelUrl(body.tunnelUrl)
          if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
          normalizedTunnel = result.value
        }

        await convex.mutation(api.shimSettings.save, {
          model: body.model,
          reasoningEffort: body.reasoningEffort,
          tunnelUrl: normalizedTunnel,
        })
        invalidateShimSettingsCache()
        return Response.json({ ok: true })
      },
    },
  },
})
