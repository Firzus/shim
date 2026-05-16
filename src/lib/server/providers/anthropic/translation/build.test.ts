import { describe, expect, it } from 'vitest'

import { CLAUDE_CODE_SYSTEM_PROMPT } from '../constants'
import { buildAnthropicUpstreamBody } from './build'
import { createOpenAIStreamFromAnthropic } from './stream-translator'
import type { AnthropicRequest, ContentBlock } from './types'

function build(rawBody: Record<string, unknown>): AnthropicRequest {
  const result = buildAnthropicUpstreamBody(rawBody, {
    model: 'claude-opus-4-7',
    effort: 'high',
  })
  return result.body as unknown as AnthropicRequest
}

describe('buildAnthropicUpstreamBody', () => {
  it('prepends the verbatim Claude Code system prompt', () => {
    const body = build({
      model: 'shim',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hi' },
      ],
    })
    const system = body.system as ContentBlock[]
    expect(system[0]?.text).toBe(CLAUDE_CODE_SYSTEM_PROMPT)
    expect(system[1]?.text).toBe('You are helpful.')
  })

  it('applies the dashboard model + adaptive thinking, and streams', () => {
    const body = build({ model: 'shim', messages: [{ role: 'user', content: 'hi' }] })
    expect(body.model).toBe('claude-opus-4-7')
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'high' })
    expect(body.temperature).toBe(1)
    expect(body.stream).toBe(true)
  })

  it('prefixes tool names with mcp_ and tracks user tool names', () => {
    const result = buildAnthropicUpstreamBody(
      {
        model: 'shim',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }],
      },
      { model: 'claude-opus-4-7', effort: 'high' },
    )
    const body = result.body as unknown as AnthropicRequest
    expect(body.tools?.[0]?.name).toBe('mcp_read_file')
    const ctx = result.streamContext as { userToolNames: Set<string> }
    expect(ctx.userToolNames.has('read_file')).toBe(true)
  })

  it('injects the Human: turn marker into stop_sequences (capped at 4)', () => {
    const body = build({ model: 'shim', messages: [{ role: 'user', content: 'hi' }] })
    expect(body.stop_sequences).toContain('Human:')
    expect((body.stop_sequences ?? []).length).toBeLessThanOrEqual(4)
  })

  it('never emits more than 4 cache_control breakpoints', () => {
    const body = build({
      model: 'shim',
      messages: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'two' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'three' },
      ],
      tools: [{ type: 'function', function: { name: 'foo', parameters: {} } }],
    })
    let count = 0
    const countBlocks = (blocks: ContentBlock[] | undefined): void => {
      for (const b of blocks ?? []) if (b.cache_control) count++
    }
    countBlocks(body.system as ContentBlock[])
    for (const tool of body.tools ?? []) if (tool.cache_control) count++
    for (const msg of body.messages) {
      if (Array.isArray(msg.content)) countBlocks(msg.content)
    }
    expect(count).toBeLessThanOrEqual(4)
  })

  it('translates the OpenAI Responses-API input shape', () => {
    const body = build({
      model: 'shim',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    })
    expect(body.messages.length).toBeGreaterThan(0)
    expect(body.messages[0]?.role).toBe('user')
  })
})

function anthropicSSE(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`),
        )
      }
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

describe('createOpenAIStreamFromAnthropic', () => {
  it('translates a text message into OpenAI chunks with usage + [DONE]', async () => {
    const stream = createOpenAIStreamFromAnthropic(
      anthropicSSE([
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ]),
      { streamId: 'chatcmpl-test', reportedModel: 'claude-opus-4-7', includeUsage: true },
    )
    const out = await collect(stream)
    expect(out).toContain('"role":"assistant"')
    expect(out).toContain('Hello')
    expect(out).toContain('data: [DONE]')
    expect(out).toContain('"completion_tokens":5')
  })
})
