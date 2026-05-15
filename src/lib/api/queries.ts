// Centralized query keys + reusable queryOptions. Sharing a key means the 4
// consumers of auth status (and the ~6 of settings) hit a single cache entry —
// TanStack Query dedupes the concurrent requests.
//
// Consumers that poll spread these and add `refetchInterval`, e.g.
//   useQuery({ ...authStatusQuery(), refetchInterval: 5_000 })

import { queryOptions } from '@tanstack/react-query'

import { getAnalytics, getAuthStatus, getSettings, getUsage } from './server-fns'

export const queryKeys = {
  authStatus: ['auth', 'status'] as const,
  settings: ['settings'] as const,
  analytics: (sinceHours: number) => ['analytics', sinceHours] as const,
  usage: ['usage'] as const,
}

export function authStatusQuery() {
  return queryOptions({
    queryKey: queryKeys.authStatus,
    queryFn: () => getAuthStatus(),
    staleTime: 4_000,
  })
}

export function settingsQuery() {
  return queryOptions({
    queryKey: queryKeys.settings,
    queryFn: () => getSettings(),
    staleTime: 30_000,
  })
}

export function analyticsQuery(sinceHours = 24) {
  return queryOptions({
    queryKey: queryKeys.analytics(sinceHours),
    queryFn: () => getAnalytics({ data: { sinceHours } }),
    staleTime: 15_000,
  })
}

export function usageQuery() {
  return queryOptions({
    queryKey: queryKeys.usage,
    queryFn: () => getUsage(),
    staleTime: 30_000,
  })
}
