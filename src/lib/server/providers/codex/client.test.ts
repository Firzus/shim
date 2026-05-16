import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the OAuth module so tests don't reach Convex / network.
vi.mock('./oauth', () => ({
  getValidToken: vi.fn(),
  clearCachedToken: vi.fn(),
}))

import { postCodexResponses } from './client'
import { CODEX_RESPONSES_URL } from './constants'
import { clearCachedToken, getValidToken } from './oauth'

const mockedGetValidToken = vi.mocked(getValidToken)
const mockedClearCachedToken = vi.mocked(clearCachedToken)

function token(over: Partial<{ accessToken: string; chatgptAccountId: string }> = {}) {
  return {
    accessToken: over.accessToken ?? 'access-token-1',
    chatgptAccountId: over.chatgptAccountId ?? 'acct-abc',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
  }
}

function jsonResponse(status: number): Response {
  return new Response('{}', { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  mockedGetValidToken.mockReset()
  mockedClearCachedToken.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('postCodexResponses', () => {
  it('attaches every mandatory upstream header', async () => {
    mockedGetValidToken.mockResolvedValue(token())
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    await postCodexResponses({
      body: { model: 'gpt-5.4', input: [], stream: true, store: false },
      sessionId: 'sess-1',
      conversationId: 'conv-1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error('fetch not called')
    const [url, init] = call
    expect(url).toBe(CODEX_RESPONSES_URL)
    expect(init?.method).toBe('POST')

    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer access-token-1')
    expect(headers['Chatgpt-Account-Id']).toBe('acct-abc')
    expect(headers.Originator).toBeTruthy()
    expect(headers.Version).toBeTruthy()
    expect(headers.Session_id).toBe('sess-1')
    expect(headers.Conversation_id).toBe('conv-1')
    expect(headers['User-Agent']).toBeTruthy()
    expect(headers.Accept).toBe('text/event-stream')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('on 401 clears the token cache and retries once with a fresh token', async () => {
    mockedGetValidToken
      .mockResolvedValueOnce(token({ accessToken: 'stale-token' }))
      .mockResolvedValueOnce(token({ accessToken: 'fresh-token' }))

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const res = await postCodexResponses({
      body: { model: 'gpt-5.4', input: [] },
      sessionId: 's',
      conversationId: 'c',
    })

    expect(res.status).toBe(200)
    expect(mockedClearCachedToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Second call must use the post-refresh token.
    const secondCall = fetchMock.mock.calls[1]
    if (!secondCall) throw new Error('expected a second fetch call')
    const secondHeaders = secondCall[1]?.headers as Record<string, string>
    expect(secondHeaders.Authorization).toBe('Bearer fresh-token')
  })

  it('does not retry a second time on a second 401', async () => {
    mockedGetValidToken.mockResolvedValue(token())
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401))
    vi.stubGlobal('fetch', fetchMock)

    const res = await postCodexResponses({
      body: { model: 'gpt-5.4', input: [] },
      sessionId: 's',
      conversationId: 'c',
    })

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockedClearCachedToken).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on non-401 errors (e.g. 500)', async () => {
    mockedGetValidToken.mockResolvedValue(token())
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(500))
    vi.stubGlobal('fetch', fetchMock)

    const res = await postCodexResponses({
      body: { model: 'gpt-5.4', input: [] },
      sessionId: 's',
      conversationId: 'c',
    })

    expect(res.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockedClearCachedToken).not.toHaveBeenCalled()
  })

  it('throws when no valid token is available', async () => {
    mockedGetValidToken.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn())

    await expect(
      postCodexResponses({
        body: { model: 'gpt-5.4', input: [] },
        sessionId: 's',
        conversationId: 'c',
      }),
    ).rejects.toThrow(/re-authenticate/i)
  })

  it('forwards the abort signal to fetch', async () => {
    mockedGetValidToken.mockResolvedValue(token())
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()

    await postCodexResponses({
      body: { model: 'gpt-5.4', input: [] },
      sessionId: 's',
      conversationId: 'c',
      signal: ctrl.signal,
    })

    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error('fetch not called')
    expect(call[1]?.signal).toBe(ctrl.signal)
  })
})
