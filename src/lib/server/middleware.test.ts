import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The IP whitelist is the only thing keeping the publicly-exposed proxy from
// being abused once the Cloudflare tunnel is up. middleware.ts reads
// config.allowedIPs at module-load time via `const config = getConfig()`,
// so each test must re-import the module fresh after stubbing env.

async function loadMiddleware(
  allowedIps: string | undefined,
): Promise<typeof import('./middleware')> {
  vi.resetModules()
  if (allowedIps === undefined) vi.stubEnv('ALLOWED_IPS', '')
  else vi.stubEnv('ALLOWED_IPS', allowedIps)
  return import('./middleware')
}

function req(headers: Record<string, string>): Request {
  return new Request('http://localhost/v1/chat/completions', { headers })
}

beforeEach(() => {
  // Silence the SECURITY warn so test output stays clean.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('checkIPWhitelist', () => {
  it('allows everything when ALLOWED_IPS=disabled', async () => {
    const { checkIPWhitelist } = await loadMiddleware('disabled')
    const result = checkIPWhitelist(req({ 'cf-connecting-ip': '198.51.100.1' }))
    expect(result.allowed).toBe(true)
    expect(result.ip).toBe('all')
  })

  it('allows a request whose cf-connecting-ip is on the list', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12,52.44.113.131')
    const result = checkIPWhitelist(req({ 'cf-connecting-ip': '3.209.66.12' }))
    expect(result.allowed).toBe(true)
    expect(result.ip).toBe('3.209.66.12')
  })

  it('blocks a request whose IP is not on the list', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(req({ 'cf-connecting-ip': '198.51.100.1' }))
    expect(result.allowed).toBe(false)
    expect(result.ip).toBe('198.51.100.1')
    expect(result.reason).toContain('not in whitelist')
  })

  it('cf-connecting-ip takes precedence over x-forwarded-for', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(
      req({ 'cf-connecting-ip': '3.209.66.12', 'x-forwarded-for': '198.51.100.1' }),
    )
    expect(result.allowed).toBe(true)
    expect(result.ip).toBe('3.209.66.12')
  })

  it('falls back to the first hop in x-forwarded-for when cf-connecting-ip is absent', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(req({ 'x-forwarded-for': '3.209.66.12, 10.0.0.1, 10.0.0.2' }))
    expect(result.allowed).toBe(true)
    expect(result.ip).toBe('3.209.66.12')
  })

  it('blocks when no client IP header is present', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(req({}))
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('No IP found in headers')
  })

  it('treats x-forwarded-for whitespace as significant: trims hops before matching', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    // Whitespace around the IP is common with Cloudflare.
    const result = checkIPWhitelist(req({ 'x-forwarded-for': '  3.209.66.12  , 10.0.0.1' }))
    expect(result.allowed).toBe(true)
  })

  it('does an exact-string match — does NOT accept IPv4-mapped IPv6 form unless explicitly listed', async () => {
    // Documents current behaviour: matching is exact-string. If we ever want
    // IPv4↔IPv6 equivalence we'd need to normalize on both sides.
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(req({ 'cf-connecting-ip': '::ffff:3.209.66.12' }))
    expect(result.allowed).toBe(false)
  })
})

describe('ipWhitelistGuard', () => {
  it('returns null when the IP is allowed', async () => {
    const { ipWhitelistGuard } = await loadMiddleware('3.209.66.12')
    const guard = ipWhitelistGuard(req({ 'cf-connecting-ip': '3.209.66.12' }))
    expect(guard).toBeNull()
  })

  it('returns a 403 Response with an authentication_error body when blocked', async () => {
    const { ipWhitelistGuard } = await loadMiddleware('3.209.66.12')
    const guard = ipWhitelistGuard(req({ 'cf-connecting-ip': '198.51.100.1' }))
    expect(guard).toBeInstanceOf(Response)
    expect(guard?.status).toBe(403)
    const body = (await guard?.json()) as { error?: { type?: string; message?: string } }
    expect(body.error?.type).toBe('authentication_error')
    expect(body.error?.message).toContain('Unauthorized')
  })
})
