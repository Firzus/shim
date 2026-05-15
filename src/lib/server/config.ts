// Centralised runtime config. Read once, cached. All env-driven knobs go here.

export interface ShimConfig {
  /** Normalised public origin of the Cloudflare tunnel (always set — see getConfig). */
  tunnelUrl: string
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

  // The proxy is only reachable through the Cloudflare tunnel — Cursor BYOK
  // rejects private-network base URLs, so there is no valid no-tunnel
  // deployment. Fail fast at startup rather than silently running a proxy
  // that either has no public route or is exposed without the tunnel guard.
  const tunnelUrlRaw = process.env.CLOUDFLARE_TUNNEL_URL?.trim() ?? ''
  if (!tunnelUrlRaw) {
    throw new Error(
      'CLOUDFLARE_TUNNEL_URL is required: shim only runs behind a Cloudflare tunnel. ' +
        'Set it in .env (see .env.example).',
    )
  }
  let tunnelUrl: string
  try {
    tunnelUrl = new URL(tunnelUrlRaw).origin
  } catch {
    throw new Error(`CLOUDFLARE_TUNNEL_URL is not a valid URL: ${tunnelUrlRaw}`)
  }

  // IP whitelist — Cursor BYOK egress IPs observed in the wild. Cursor routes
  // BYOK calls through their AWS us-east-1 backend, so the egress IP comes
  // from a small AWS pool. Update the set if a request gets 403d (the
  // middleware logs `[SECURITY] Blocked IP: <ip>` to make new addresses
  // obvious). Override via env `ALLOWED_IPS=ip1,ip2`.
  const allowedIPs = (process.env.ALLOWED_IPS ?? '3.209.66.12,52.44.113.131,184.73.225.134')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)

  // Origin allow-list for CORS: the local dev URLs (host port 3221) plus the
  // tunnel origin. The dashboard is same-origin RPC; Cursor's proxy traffic is
  // server-to-server and sends no Origin — so this short list is enough.
  const allowedOrigins = Array.from(
    new Set(['http://localhost:3221', 'http://127.0.0.1:3221', tunnelUrl]),
  )

  cached = {
    tunnelUrl,
    allowedIPs,
    allowedOrigins,
    maxUpstreamConcurrency: parseEnvInt('SHIM_MAX_UPSTREAM_CONCURRENCY', 3, 1),
  }
  return cached
}
