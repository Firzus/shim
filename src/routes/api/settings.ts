import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'
import { invalidateShimSettingsCache, SHIM_SETTINGS_DEFAULTS } from '#/lib/server/settings'

// Dashboard reads + writes the singleton that drives every upstream call's
// model + reasoning effort. Cursor's body is overridden at request time by
// src/lib/server/handlers/chat-completions.ts.

const ALLOWED_MODELS = new Set(['gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.5'])
const ALLOWED_EFFORTS = new Set(['none', 'low', 'medium', 'high'])

interface SettingsPayload {
  model?: string
  reasoningEffort?: string
}

export const Route = createFileRoute('/api/settings')({
  server: {
    handlers: {
      GET: async () => {
        const row = await convex.query(api.shimSettings.get, {})
        return Response.json({
          model: row?.model ?? SHIM_SETTINGS_DEFAULTS.model,
          reasoningEffort: row?.reasoningEffort ?? SHIM_SETTINGS_DEFAULTS.reasoningEffort,
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

        await convex.mutation(api.shimSettings.save, {
          model: body.model,
          reasoningEffort: body.reasoningEffort,
        })
        invalidateShimSettingsCache()
        return Response.json({ ok: true })
      },
    },
  },
})
