import { getConfig } from './config'
import { logger } from './logger'

const config = getConfig()

/**
 * Check if the request reached us legitimately through the Cloudflare tunnel.
 *
 * The proxy is tunnel-only by design: Cloudflare always sets `CF-Connecting-IP`,
 * so its absence means the request bypassed the tunnel (hit the origin port
 * directly) and is rejected. `X-Forwarded-For` is intentionally NOT trusted —
 * it is trivially forgeable by anything that can reach the origin. When the
 * header is present, the client IP must still be on the `ALLOWED_IPS` list.
 */
export function checkIPWhitelist(req: Request): {
  allowed: boolean
  ip?: string
  reason?: string
} {
  const clientIP = req.headers.get('cf-connecting-ip')?.trim()

  if (!clientIP) {
    logger.warn('[SECURITY] Blocked request: no CF-Connecting-IP (not via Cloudflare tunnel)')
    return { allowed: false, reason: 'Request did not arrive through the Cloudflare tunnel' }
  }

  const isAllowed = config.allowedIPs.includes(clientIP)

  if (!isAllowed) {
    logger.warn(`[SECURITY] Blocked IP: ${clientIP} (allowed: ${config.allowedIPs.join(', ')})`)
  }

  return {
    allowed: isAllowed,
    ip: clientIP,
    reason: isAllowed ? undefined : `IP ${clientIP} not in whitelist`,
  }
}

/**
 * IP whitelist guard for proxy/admin endpoints.
 * Returns null if allowed, or a 403 Response if blocked.
 */
export function ipWhitelistGuard(req: Request): Response | null {
  const ipCheck = checkIPWhitelist(req)
  if (ipCheck.allowed) return null

  return Response.json(
    {
      error: {
        type: 'authentication_error',
        message: `Unauthorized: ${ipCheck.reason ?? 'IP not whitelisted'}`,
      },
    },
    { status: 403 },
  )
}

const STATIC_CORS_HEADERS: Record<string, string> = {
  Vary: 'Origin',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, openai-beta',
  'Access-Control-Allow-Credentials': 'true',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

export function corsHeaders(req?: Request): Record<string, string> {
  const requestOrigin = req?.headers.get('origin') ?? null
  const allowed = config.allowedOrigins

  if (requestOrigin && allowed.includes(requestOrigin)) {
    return { 'Access-Control-Allow-Origin': requestOrigin, ...STATIC_CORS_HEADERS }
  }

  if (!requestOrigin && allowed[0]) {
    return { 'Access-Control-Allow-Origin': allowed[0], ...STATIC_CORS_HEADERS }
  }

  return { ...STATIC_CORS_HEADERS }
}

export function logRequestDetails(req: Request, endpoint: string): void {
  const url = new URL(req.url)
  const cfConnectingIp = req.headers.get('cf-connecting-ip') ?? 'none'
  logger.info(`[${endpoint}] ${req.method} ${url.pathname}${url.search} ip=${cfConnectingIp}`)
}
