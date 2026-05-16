import { describe, expect, it } from 'vitest'

import { formatInternalToolContent, isSubagentToolName } from './internal-tools'

// Claude Code emits internal tool calls (CreatePlan, TodoWrite, subagent
// dispatch) that Cursor cannot render. formatInternalToolContent flattens them
// into readable text so the work isn't silently dropped.

describe('isSubagentToolName', () => {
  it('recognizes the known subagent-dispatch tool names', () => {
    for (const name of ['Task', 'Agent', 'spawn_subagent', 'delegate']) {
      expect(isSubagentToolName(name)).toBe(true)
    }
  })

  it('rejects unrelated tool names and nullish input', () => {
    expect(isSubagentToolName('CreatePlan')).toBe(false)
    expect(isSubagentToolName('read_file')).toBe(false)
    expect(isSubagentToolName(undefined)).toBe(false)
    expect(isSubagentToolName(null)).toBe(false)
    expect(isSubagentToolName('')).toBe(false)
  })
})

describe('formatInternalToolContent', () => {
  it('returns null for non-object payloads', () => {
    expect(formatInternalToolContent('CreatePlan', null)).toBeNull()
    expect(formatInternalToolContent('CreatePlan', 'a string')).toBeNull()
    expect(formatInternalToolContent('CreatePlan', 42)).toBeNull()
  })

  it('extracts title, summary and todo list from a CreatePlan call', () => {
    const text = formatInternalToolContent('CreatePlan', {
      title: 'Refactor the proxy',
      summary: 'Split the handler into provider modules.',
      todos: ['Add registry', 'Move codex code'],
    })
    expect(text).toContain('Refactor the proxy')
    expect(text).toContain('Split the handler into provider modules.')
    expect(text).toContain('- Add registry')
    expect(text).toContain('- Move codex code')
  })

  it('returns null for a CreatePlan call with nothing useful', () => {
    expect(formatInternalToolContent('CreatePlan', {})).toBeNull()
  })

  it('renders TodoWrite items with their status prefix', () => {
    const text = formatInternalToolContent('TodoWrite', {
      todos: [
        { content: 'Write tests', status: 'in_progress' },
        { content: 'Ship it', status: 'pending' },
      ],
    })
    expect(text).toContain('- [in_progress] Write tests')
    expect(text).toContain('- [pending] Ship it')
  })

  it('formats a subagent dispatch with type, description and prompt', () => {
    const text = formatInternalToolContent('Task', {
      subagent_type: 'Explore',
      description: 'find the config',
      prompt: 'Locate the config loader.',
      model: 'sonnet',
    })
    expect(text).toContain('▶ Subagent dispatch (Task')
    expect(text).toContain('Explore — find the config')
    expect(text).toContain('[model: sonnet]')
    expect(text).toContain('Locate the config loader.')
  })

  it('falls back to a generic extract for an unrecognized tool name', () => {
    const text = formatInternalToolContent('SomeOtherTool', {
      note: 'a free-form value',
      items: ['one', 'two'],
    })
    expect(text).toContain('a free-form value')
    expect(text).toContain('- one')
    expect(text).toContain('- two')
  })

  it('returns null when the generic extract finds nothing', () => {
    expect(formatInternalToolContent('SomeOtherTool', { count: 5, ok: true })).toBeNull()
  })
})
