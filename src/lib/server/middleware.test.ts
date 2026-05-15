import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The proxy is tunnel-only: middleware.ts rejects anything that did not arrive
// through the Cloudflare tunnel (no CF-Connecting-IP), and config.ts refuses
// to start without CLOUDFLARE_TUNNEL_URL. middleware.ts reads config.allowedIPs
// at module-load time via `const config = getConfig()`, so each test re-imports
// the module fresh after stubbing env.

async function loadMiddleware(
  allowedIps: string | undefined,
): Promise<typeof import('./middleware')> {
  vi.resetModules()
  // A valid tunnel URL is mandatory or getConfig() throws at import.
  vi.stubEnv('CLOUDFLARE_TUNNEL_URL', 'https://shim.example.com')
  vi.stubEnv('ALLOWED_IPS', allowedIps ?? '')
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

describe('getConfig — the tunnel is mandatory', () => {
  it('throws at startup when CLOUDFLARE_TUNNEL_URL is unset', async () => {
    vi.resetModules()
    vi.stubEnv('CLOUDFLARE_TUNNEL_URL', '')
    const { getConfig } = await import('./config')
    expect(() => getConfig()).toThrow(/CLOUDFLARE_TUNNEL_URL is required/)
  })

  it('throws at startup when CLOUDFLARE_TUNNEL_URL is not a valid URL', async () => {
    vi.resetModules()
    vi.stubEnv('CLOUDFLARE_TUNNEL_URL', 'not a url')
    const { getConfig } = await import('./config')
    expect(() => getConfig()).toThrow(/not a valid URL/)
  })
})

describe('checkIPWhitelist', () => {
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

  it('blocks when CF-Connecting-IP is absent — request bypassed the tunnel', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(req({}))
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('did not arrive through the Cloudflare tunnel')
  })

  it('ignores X-Forwarded-For entirely — it is not a tunnel proof', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    // Even with an allowed IP in X-Forwarded-For, no CF-Connecting-IP = blocked.
    const result = checkIPWhitelist(req({ 'x-forwarded-for': '3.209.66.12, 10.0.0.1' }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('did not arrive through the Cloudflare tunnel')
  })

  it('trims whitespace around CF-Connecting-IP before matching', async () => {
    const { checkIPWhitelist } = await loadMiddleware('3.209.66.12')
    const result = checkIPWhitelist(req({ 'cf-connecting-ip': '  3.209.66.12  ' }))
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

  it('returns a 403 when the request bypassed the tunnel', async () => {
    const { ipWhitelistGuard } = await loadMiddleware('3.209.66.12')
    const guard = ipWhitelistGuard(req({}))
    expect(guard?.status).toBe(403)
  })
})
