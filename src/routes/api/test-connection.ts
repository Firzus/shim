import { createFileRoute } from '@tanstack/react-router'

import { postCodexResponses } from '#/lib/server/codex-client'
import { logger, toErrorMessage } from '#/lib/server/logger'
import { getShimSettings } from '#/lib/server/settings'

// Synthetic upstream ping used by the onboarding wizard. Goes around the
// /v1/* path so the Cursor-egress IP whitelist doesn't reject the browser's
// loopback fetch. Confirms: tokens present, upstream reachable, settings
// applied.

export const Route = createFileRoute('/api/test-connection')({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = performance.now()
        const settings = await getShimSettings()
        const testConnectionId = 'shim-test-connection'

        const body: Record<string, unknown> = {
          model: settings.model,
          instructions: 'You are a connection test. Reply with exactly one word.',
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'ping' }],
            },
          ],
          stream: true,
          store: false,
          prompt_cache_key: testConnectionId,
          reasoning: { effort: settings.reasoningEffort },
        }

        try {
          const upstream = await postCodexResponses({
            body,
            sessionId: testConnectionId,
            conversationId: testConnectionId,
          })
          if (!upstream.ok) {
            const text = await upstream
              .clone()
              .text()
              .catch(() => '')
            logger.warn(`[test-connection] upstream ${upstream.status}: ${text.slice(0, 200)}`)
            return Response.json(
              {
                ok: false,
                status: upstream.status,
                message: text.slice(0, 200) || upstream.statusText,
              },
              { status: 200 },
            )
          }
          // Drain the SSE briefly so the connection completes cleanly; we don't
          // need the content — just confirmation that the stream opens.
          if (upstream.body) {
            const reader = upstream.body.getReader()
            await reader.read()
            await reader.cancel().catch(() => null)
          }
          const latencyMs = Math.round(performance.now() - startedAt)
          logger.info(`[test-connection] ok latency=${latencyMs}ms model=${settings.model}`)
          return Response.json({ ok: true, latencyMs, model: settings.model })
        } catch (error) {
          const message = toErrorMessage(error)
          logger.error(`[test-connection] transport: ${message}`)
          return Response.json({ ok: false, status: 0, message }, { status: 200 })
        }
      },
    },
  },
})
