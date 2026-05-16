// Compact human-readable formatters shared across the console UI.

// Large counts → short form: 942, 9.4k, 12k, 1.3M.
export function formatCount(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// A duration in ms → coarse "ago" magnitude: 3s, 5m, 2h, 4d. Negative or
// non-finite input collapses to "0s" so callers never render NaN.
export function formatAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s'
  const seconds = Math.floor(ms / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
