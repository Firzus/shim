// PKCE helpers — RFC 7636. SHA-256 + base64url, no padding.

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48))
  return base64url(bytes)
}

async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return base64url(new Uint8Array(digest))
}

export async function generatePKCE(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await computeCodeChallenge(codeVerifier)
  return { codeVerifier, codeChallenge }
}
