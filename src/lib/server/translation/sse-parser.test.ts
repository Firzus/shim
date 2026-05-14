import { describe, expect, it } from 'vitest'

import { SSELineBuffer } from './sse-parser'

// Frames are concatenated and pushed through SSELineBuffer in arbitrary chunk
// sizes — we test that the line/event boundary detection is robust against
// (a) LF vs CRLF, (b) partial frames split mid-byte, (c) keep-alive comments,
// and (d) the upstream [DONE] sentinel.

function frame(type: string, extra: Record<string, unknown> = {}): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`
}

describe('SSELineBuffer', () => {
  it('parses a single LF-delimited frame', () => {
    const buf = new SSELineBuffer()
    const events = buf.push(frame('response.created', { response: { id: 'r1' } }))
    expect(events).toHaveLength(1)
    expect(events[0]?.event).toMatchObject({ type: 'response.created' })
  })

  it('parses multiple frames in one push', () => {
    const buf = new SSELineBuffer()
    const events = buf.push(
      frame('response.created') + frame('response.output_text.delta', { delta: 'hi' }),
    )
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.event.type)).toEqual([
      'response.created',
      'response.output_text.delta',
    ])
  })

  it('handles CRLF boundaries', () => {
    const buf = new SSELineBuffer()
    const events = buf.push(`event: response.created\r\ndata: {"type":"response.created"}\r\n\r\n`)
    expect(events).toHaveLength(1)
    expect(events[0]?.event.type).toBe('response.created')
  })

  it('buffers a partial frame across two pushes', () => {
    const buf = new SSELineBuffer()
    const full = frame('response.output_text.delta', { delta: 'hello world' })
    // Split mid-payload so the first chunk has no boundary.
    const cut = Math.floor(full.length / 2)
    const first = buf.push(full.slice(0, cut))
    expect(first).toEqual([])
    const second = buf.push(full.slice(cut))
    expect(second).toHaveLength(1)
    expect(second[0]?.event).toMatchObject({
      type: 'response.output_text.delta',
      delta: 'hello world',
    })
  })

  it('ignores keep-alive comment lines and the [DONE] sentinel', () => {
    const buf = new SSELineBuffer()
    const events = buf.push(
      `: keep-alive\n\n` +
        frame('response.created') +
        `data: [DONE]\n\n` +
        frame('response.completed'),
    )
    // [DONE] frame is dropped, keep-alive frame yields nothing, two real events remain.
    expect(events.map((e) => e.event.type)).toEqual(['response.created', 'response.completed'])
  })

  it('drops frames with malformed JSON without throwing', () => {
    const buf = new SSELineBuffer()
    const events = buf.push(
      `event: response.created\ndata: {not json}\n\n` + frame('response.completed'),
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.event.type).toBe('response.completed')
  })

  it('flush() yields any trailing frame that lacked a closing blank line', () => {
    const buf = new SSELineBuffer()
    // No trailing \n\n on the last frame.
    buf.push(`data: ${JSON.stringify({ type: 'response.completed' })}\n`)
    const flushed = buf.flush()
    expect(flushed).toHaveLength(1)
    expect(flushed[0]?.event.type).toBe('response.completed')
    // Second flush is empty.
    expect(buf.flush()).toEqual([])
  })

  it('handles a mix of LF and CRLF in the same stream', () => {
    const buf = new SSELineBuffer()
    const stream =
      `data: {"type":"response.created"}\n\n` + `data: {"type":"response.completed"}\r\n\r\n`
    const events = buf.push(stream)
    expect(events.map((e) => e.event.type)).toEqual(['response.created', 'response.completed'])
  })
})
