// Custom TanStack Start server entry. The Start plugin resolves `src/server.ts`
// in preference to its built-in default entry (see start-plugin-core's
// `resolveEntry`), and `@tanstack/react-start/server-entry` still points at the
// real default handler — so this just wraps it.
//
// `paraglideMiddleware` detects the request locale (PARAGLIDE_LOCALE cookie /
// Accept-Language) and runs the handler inside an AsyncLocalStorage scope so
// `getLocale()` returns the right value during SSR. With the cookie-only
// strategy there is no `url` strategy, so the middleware never rewrites or
// redirects — `/v1/*` and `/api/*` proxy requests pass straight through.
import handler from '@tanstack/react-start/server-entry'

import { paraglideMiddleware } from '@/paraglide/server'

export default {
  fetch(request: Request): Promise<Response> {
    return paraglideMiddleware(request, () => handler.fetch(request))
  },
}
