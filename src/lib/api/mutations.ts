// Mutation hooks for the dashboard's write endpoints. Each one invalidates the
// relevant query cache so every consumer stays in sync. The mutationFns are
// TanStack Start server functions — typed end-to-end.

import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ProviderIdInput, SaveSettingsInput } from './schemas'
import {
  exchangeCallback,
  initLogin,
  logout,
  refreshUsage,
  runTestConnection,
  saveSettings,
  setActiveProvider,
} from './server-fns'
import { queryKeys } from './queries'

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: SaveSettingsInput) => saveSettings({ data: patch }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

// One-click active-provider switch. Invalidates both settings and auth status
// (the top-level auth fields mirror the active provider).
export function useSetActiveProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: ProviderIdInput) => setActiveProvider({ data: provider }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      void queryClient.invalidateQueries({ queryKey: queryKeys.authStatus })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: ProviderIdInput) => logout({ data: { provider } }),
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
  return useMutation({
    mutationFn: (provider: ProviderIdInput) => initLogin({ data: { provider } }),
  })
}

export function useExchangeCallback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { provider: ProviderIdInput; redirectUrl: string }) =>
      exchangeCallback({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authStatus })
    },
  })
}

export function useTestConnection() {
  return useMutation({ mutationFn: () => runTestConnection() })
}
