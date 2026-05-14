import { getConfig } from './config'
import { logger } from './logger'

const config = getConfig()

/**
 * Check if the request IP is in the whitelist.
 * Requests come through the Cloudflare tunnel; the client IP is extracted
 * from CF-Connecting-IP or X-Forwarded-For.
 */
export function checkIPWhitelist(req: Request): {
  allowed: boolean
  ip?: string
  reason?: string
} {
  if (config.allowedIPs.length === 0) {
    return { allowed: true, ip: 'all' }
  }

  const cfConnectingIp = req.headers.get('cf-connecting-ip')
  const clientIP = cfConnectingIp ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()

  if (!clientIP) {
    return { allowed: false, reason: 'No IP found in headers' }
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
