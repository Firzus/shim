import { QueryClient } from '@tanstack/react-query'

// Builds a fresh QueryClient. This must NOT be a module-level singleton: on
// the server a shared client would leak cached data between requests. The
// router (src/router.tsx) calls this once per request server-side and once
// client-side, so each request gets its own isolated cache.
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // shim is local + single-user — tolerate slightly stale data rather
        // than hammering Convex. Per-query staleTime overrides this default.
        staleTime: 10_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
