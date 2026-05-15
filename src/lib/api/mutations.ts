// Mutation hooks for the dashboard's write endpoints. Each one invalidates or
// directly updates the relevant query cache so every consumer stays in sync.
// The mutationFns are TanStack Start server functions — typed end-to-end.

import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { SaveSettingsInput } from './schemas'
import {
  exchangeCallback,
  initLogin,
  logout,
  refreshUsage,
  runTestConnection,
  saveSettings,
} from './server-fns'
import { queryKeys } from './queries'
import type { Settings } from './types'

// Optimistic settings save: mirror the patch into the cache immediately, roll
// back on error, and reconcile with the server via invalidation on settle.
export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: SaveSettingsInput) => saveSettings({ data: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings })
      const previous = queryClient.getQueryData<Settings>(queryKeys.settings)
      if (previous) {
        queryClient.setQueryData<Settings>(queryKeys.settings, { ...previous, ...patch })
      }
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.settings, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authStatus })
    },
  })
}

// Manual plan-usage refresh: the POST returns the fresh snapshot, so write it
// straight into the cache instead of triggering a follow-up GET.
export function useRefreshUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => refreshUsage(),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKeys.usage, snapshot)
    },
  })
}

export function useInitLogin() {
  return useMutation({ mutationFn: () => initLogin() })
}

export function useExchangeCallback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (redirectUrl: string) => exchangeCallback({ data: { redirectUrl } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authStatus })
    },
  })
}

export function useTestConnection() {
  return useMutation({ mutationFn: () => runTestConnection() })
}
