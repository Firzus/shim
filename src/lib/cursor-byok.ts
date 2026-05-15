export const CURSOR_SENTINEL_MODEL = 'codex'

export const CLOUDFLARED_TUNNEL_SNIPPET = `cloudflared tunnel create shim
cloudflared tunnel route dns shim shim.yourdomain.com
cloudflared tunnel run shim   # ingress -> http://localhost:3221`
