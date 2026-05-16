import { describe, expect, it } from 'vitest'

import { buildCodexFromResponsesBody, chatMessagesToInputItems } from './responses-passthrough'
import cursorResponsesBody from '../../../../../../test/fixtures/cursor-responses-body.json'
import cursorChatBody from '../../../../../../test/fixtures/cursor-chat-body.json'

// The passthrough translator is the load-bearing piece for multi-turn
// reasoning. The single most important property: `reasoning` items with
// `encrypted_content` are forwarded VERBATIM. If we ever drop or mutate them,
// multi-turn silently degrades — gpt-5.4 emits reasoning between turns and
// never commits the next tool_call.

describe('buildCodexFromResponsesBody', () => {
  it('preserves a reasoning item with encrypted_content byte-for-byte', () => {
    const result = buildCodexFromResponsesBody(cursorResponsesBody as Record<string, unknown>)
    const input = result.body.input as Array<Record<string, unknown>>
    const reasoning = input.find((i) => i.type === 'reasoning')
    expect(reasoning).toBeDefined()
    expect(reasoning?.encrypted_content).toBe('OPAQUE_REASONING_BLOB_FROM_PRIOR_TURN_DO_NOT_MUTATE')
    // Whatever else the upstream sent on that item must round-trip too.
    expect(reasoning).toEqual({
      type: 'reasoning',
      encrypted_content: 'OPAQUE_REASONING_BLOB_FROM_PRIOR_TURN_DO_NOT_MUTATE',
      summary: [],
    })
  })

  it('hoists system/developer messages into top-level instructions and removes them from input', () => {
    const result = buildCodexFromResponsesBody(cursorResponsesBody as Record<string, unknown>)
    expect(result.body.instructions).toBe('You are a helpful coding assistant.')
    const input = result.body.input as Array<Record<string, unknown>>
    expect(input.find((i) => i.role === 'system')).toBeUndefined()
    expect(input.find((i) => i.role === 'developer')).toBeUndefined()
  })

  it('falls back to a single-space instructions placeholder when none provided (Codex 400s on missing)', () => {
    const result = buildCodexFromResponsesBody({
      model: 'gpt-5.4',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    })
    expect(result.body.instructions).toBe(' ')
  })

  it('forces store=false and stream=true regardless of incoming flags', () => {
    const result = buildCodexFromResponsesBody({
      model: 'gpt-5.4',
      input: [],
      store: true,
      stream: false,
    } as Record<string, unknown>)
    expect(result.body.store).toBe(false)
    expect(result.body.stream).toBe(true)
  })

  it('attaches a derived prompt_cache_key (stable for a given instructions string)', () => {
    const a = buildCodexFromResponsesBody({
      model: 'gpt-5.4',
      input: [
        { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'sys-A' }] },
      ],
    })
    const b = buildCodexFromResponsesBody({
      model: 'gpt-5.4',
      input: [
        { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'sys-A' }] },
      ],
    })
    const c = buildCodexFromResponsesBody({
      model: 'gpt-5.4',
      input: [
        { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'sys-B' }] },
      ],
    })
    expect(typeof a.body.prompt_cache_key).toBe('string')
    expect(a.body.prompt_cache_key).toBe(b.body.prompt_cache_key)
    expect(a.body.prompt_cache_key).not.toBe(c.body.prompt_cache_key)
  })

  it('maps an unknown model to the Codex allow-list (fellBack=true)', () => {
    const result = buildCodexFromResponsesBody({
      model: 'codex',
      input: [],
    })
    expect(result.modelMapping.fellBack).toBe(true)
    expect(result.body.model).not.toBe('codex')
    // The applied model must be one of the accepted Codex models.
    expect(typeof result.body.model).toBe('string')
  })

  it('forwards reasoning effort, include, parallel_tool_calls verbatim', () => {
    const result = buildCodexFromResponsesBody(cursorResponsesBody as Record<string, unknown>)
    expect(result.body.reasoning).toEqual({ effort: 'medium' })
    expect(result.body.include).toEqual(['reasoning.encrypted_content'])
    expect(result.body.parallel_tool_calls).toBe(true)
  })

  it('flattens tools from Chat shape ({function:{name,...}}) to Codex shape ({type,name,...})', () => {
    const result = buildCodexFromResponsesBody(cursorResponsesBody as Record<string, unknown>)
    const tools = result.body.tools as Array<Record<string, unknown>>
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      type: 'function',
      name: 'read_file',
      description: 'Read a file from the workspace.',
    })
    expect(tools[0]?.function).toBeUndefined()
  })

  it('accepts a Chat-shape body via the messages[] fallback and produces valid input[]', () => {
    const result = buildCodexFromResponsesBody(cursorChatBody as Record<string, unknown>)
    expect(result.body.instructions).toBe('You are a helpful coding assistant.')
    const input = result.body.input as Array<Record<string, unknown>>
    // System message removed, user + function_call + function_call_output remain.
    expect(input.find((i) => i.role === 'system')).toBeUndefined()
    expect(input.find((i) => i.type === 'function_call')).toMatchObject({
      type: 'function_call',
      call_id: 'call_abc123',
      name: 'read_file',
    })
    expect(input.find((i) => i.type === 'function_call_output')).toMatchObject({
      type: 'function_call_output',
      call_id: 'call_abc123',
      output: 'export function login() { /* ... */ }',
    })
  })
})

describe('chatMessagesToInputItems', () => {
  it('coerces an assistant tool_call into a Responses function_call item', () => {
    const items = chatMessagesToInputItems([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_xyz',
            type: 'function',
            function: { name: 'do_thing', arguments: '{"a":1}' },
          },
        ],
      },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'function_call',
      call_id: 'call_xyz',
      name: 'do_thing',
      arguments: '{"a":1}',
    })
  })

  it('coerces a tool-role message into a function_call_output', () => {
    const items = chatMessagesToInputItems([
      { role: 'tool', tool_call_id: 'call_xyz', content: 'result text' },
    ])
    expect(items[0]).toMatchObject({
      type: 'function_call_output',
      call_id: 'call_xyz',
      output: 'result text',
    })
  })

  it('normalizes Chat-shape image_url content to Responses input_image', () => {
    const items = chatMessagesToInputItems([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        ],
      },
    ])
    const content = items[0]?.content as Array<Record<string, unknown>>
    expect(content[0]).toEqual({ type: 'input_text', text: 'look at this' })
    expect(content[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,AAA' })
  })
})
