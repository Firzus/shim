// The provider-neutral model name the user types into Cursor BYOK. The proxy
// routes `shim` traffic to whichever provider is active in the dashboard.
export const CURSOR_SENTINEL_MODEL = 'shim'

export const CLOUDFLARED_TUNNEL_SNIPPET = `cloudflared tunnel create shim
cloudflared tunnel route dns shim shim.yourdomain.com
cloudflared tunnel run shim   # ingress -> http://localhost:3221`
