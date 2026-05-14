export function formatRelativeExpiry(expiresAt: number | null | undefined): string {
  if (!expiresAt) return '—'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'expired'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}
