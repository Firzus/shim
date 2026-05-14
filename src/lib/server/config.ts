// Centralised runtime config. Read once, cached. All env-driven knobs go here.

export interface ShimConfig {
  port: number
  allowedIPs: string[]
  allowedOrigins: string[]
  maxUpstreamConcurrency: number
}

function parseEnvInt(name: string, fallback: number, min = 0): number {
  const raw = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(raw) && raw >= min ? raw : fallback
}

let cached: ShimConfig | null = null

export function getConfig(): ShimConfig {
  if (cached) return cached

  // IP whitelist — Cursor BYOK egress IPs observed in the wild. Cursor routes
  // BYOK calls through their AWS us-east-1 backend, so the egress IP comes
  // from a small AWS pool. Update the set if a request gets 403d (the
  // middleware logs `[SECURITY] Blocked IP: <ip>` to make new addresses
  // obvious). Override via env `ALLOWED_IPS=ip1,ip2`, or `ALLOWED_IPS=disabled`
  // for local development without the tunnel in front.
  const allowedIPsEnv = process.env.ALLOWED_IPS ?? '3.209.66.12,52.44.113.131,184.73.225.134'
  const allowedIPs =
    allowedIPsEnv.trim().toLowerCase() === 'disabled'
      ? []
      : allowedIPsEnv
          .split(',')
          .map((ip) => ip.trim())
          .filter(Boolean)

  // Build the origin allow-list. Always include local dev URLs so the
  // dashboard works on the host machine, even with a tunnel configured.
  const appPort = process.env.APP_PORT ?? '3221'
  const localOrigins = [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`]

  const explicit = (process.env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const tunnelOrigin = process.env.CLOUDFLARE_TUNNEL_URL?.trim() ?? ''

  const allowedOrigins = Array.from(
    new Set([...localOrigins, ...(tunnelOrigin ? [tunnelOrigin] : []), ...explicit]),
  )

  cached = {
    port: parseEnvInt('APP_PORT', 3221, 1),
    allowedIPs,
    allowedOrigins,
    maxUpstreamConcurrency: parseEnvInt('SHIM_MAX_UPSTREAM_CONCURRENCY', 3, 1),
  }
  return cached
}
