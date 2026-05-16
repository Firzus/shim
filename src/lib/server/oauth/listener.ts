import { createServer, type Server } from 'node:http'

import { logger } from '../logger'

// Single in-flight callback listener for OAuth flows whose provider registers
// a localhost loopback redirect URI (Codex). Spun up only while a login flow
// is active; the port + callback path are provider-supplied.

const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const LISTENER_HOST = '127.0.0.1'

export interface AwaitedCallback {
  code: string
  state: string
}

interface ActiveListener {
  promise: Promise<AwaitedCallback>
}

let active: ActiveListener | null = null

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>shim — auth complete</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; padding: 0 1rem; color: #173a40; }
      h1 { font-size: 1.5rem; }
      p { color: #416166; }
    </style>
  </head>
  <body>
    <h1>shim — authentication complete</h1>
    <p>you can close this tab and return to the shim dashboard.</p>
  </body>
</html>`

const ERROR_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>shim — auth error</title></head>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 2rem;">
    <h1>shim — authentication error</h1>
    <p>the callback did not include both <code>code</code> and <code>state</code>. please retry from the dashboard.</p>
  </body>
</html>`

/**
 * Open an ephemeral HTTP listener on 127.0.0.1:<port> that resolves when the
 * browser hits `<callbackPath>?code=...&state=...`. Rejects with `EADDRINUSE`
 * if the port is busy — the caller must then surface the paste-the-URL
 * fallback to the user.
 */
export function startCallbackListener(
  port: number,
  callbackPath: string,
): Promise<AwaitedCallback> {
  if (active) {
    logger.warn('[oauth] callback listener already active — reusing in-flight promise')
    return active.promise
  }

  const promise = new Promise<AwaitedCallback>((resolve, reject) => {
    let server: Server | null = null
    let timeoutHandle: NodeJS.Timeout | null = null

    const cleanup = (): void => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      if (server) {
        const s = server
        server = null
        s.close(() => {
          logger.info('[oauth] callback listener closed')
        })
      }
      active = null
    }

    server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${LISTENER_HOST}:${port}`)
        if (url.pathname !== callbackPath) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('not found')
          return
        }
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        if (!code || !state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(ERROR_HTML)
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(SUCCESS_HTML)
        cleanup()
        resolve({ code, state })
      } catch (error) {
        logger.error(
          `[oauth] callback handler crashed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('internal error')
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })

    server.once('error', (error) => {
      cleanup()
      reject(error)
    })

    server.listen(port, LISTENER_HOST, () => {
      logger.info(`[oauth] callback listener up on http://${LISTENER_HOST}:${port}`)
    })

    timeoutHandle = setTimeout(() => {
      cleanup()
      reject(new Error('OAuth callback listener timed out after 5 minutes'))
    }, TIMEOUT_MS)
  })

  active = { promise }
  return promise
}
