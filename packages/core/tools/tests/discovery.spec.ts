import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'

const signal = new AbortController().signal

function agent(id: string, session = Session.create(SessionId(id))): Agent {
  return { id: SessionId(id), session } as Agent
}

async function mount() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, {
    discovery: {
      alwaysVisible: ['base'],
      promptSections: [{ name: 'optional-guidance', tools: ['optional'] }],
    },
  })
  ctx.tools.register({
    name: 'base', description: 'Always available.', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    async execute() { return 'base' },
  })
  ctx.tools.register({
    name: 'optional', description: 'Inspect optional device logs.', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    async execute() { return 'optional' },
  })
  ctx.systemPrompt.section({ name: 'optional-guidance', order: 100, text: 'Device log instructions.' })
  return ctx
}

async function call(ctx: Context, subject: Agent, name: string, args: Record<string, unknown> = {}) {
  return ctx.tools.execute({ signal, callId: ToolCallId('discovery-call'), name, arguments: args, agent: subject })
}

function recordActivation(subject: Agent, name: string, isError = false): void {
  const callId = ToolCallId(`activation-${name}`)
  const call = subject.session.append('tool/call', {
    turn: 1, step: 1, callId, name: 'tool_activate', arguments: JSON.stringify({ name }),
  })
  subject.session.append('tool/result', {
    turn: 1, step: 1,
    message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'done' }], isError }),
  }, { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
}

describe('opt-in tool discovery', () => {
  it('searches a hidden tool, rejects direct hidden calls, and admits only a successful durable activation', async () => {
    const ctx = await mount()
    const first = agent('discovery-first')
    const second = agent('discovery-second')
    expect(ctx.tools.schemas(first).map(tool => tool.name).sort())
      .toEqual(['base', 'tool_activate', 'tool_search'])
    const search = await call(ctx, first, 'tool_search', { query: 'device logs' })
    expect(JSON.stringify(search.content)).toContain('optional')
    const hidden = await call(ctx, first, 'optional')
    expect(hidden.isError).toBe(true)
    expect(JSON.stringify(hidden.content)).toContain('unknown tool')
    expect((await ctx.systemPrompt.assemble({ scope: first })).sections.some(section => section.name === 'optional-guidance')).toBe(false)

    recordActivation(first, 'optional', true)
    expect(ctx.tools.get('optional', first)).toBeUndefined()
    expect((await call(ctx, first, 'tool_activate', { name: 'optional' })).isError).toBe(false)
    recordActivation(first, 'optional')
    expect(ctx.tools.schemas(first).map(tool => tool.name)).toContain('optional')
    expect(ctx.tools.get('optional', second)).toBeUndefined()
    expect((await call(ctx, first, 'optional')).isError).toBe(false)
    expect((await ctx.systemPrompt.assemble({ scope: first })).sections.some(section => section.name === 'optional-guidance')).toBe(true)
  })

  it('reconstructs activation from a Session and keeps inherited restrictions authoritative', async () => {
    const original = agent('discovery-resume')
    recordActivation(original, 'optional')
    const resumed = agent('discovery-resume', original.session)
    const second = await mount()
    expect(second.tools.get('optional', resumed)).toBeDefined()

    let scope!: ReturnType<typeof createScope>
    await second.plugin(Object.assign((inner: Context) => { scope = createScope(inner, resumed) }, {
      inject: ['tools', 'systemPrompt'],
    }))
    scope.ctx.tools.restrict({ deny: ['optional'] })
    expect(second.tools.get('optional', resumed)).toBeUndefined()
    expect((await call(second, resumed, 'tool_activate', { name: 'optional' })).isError).toBe(true)
    expect((await second.systemPrompt.assemble({ scope: resumed })).sections.some(section => section.name === 'optional-guidance')).toBe(false)
    await scope.dispose()
  })

  it('reconstructs successful PTC activations without admitting failed dispatches', async () => {
    const subject = agent('discovery-ptc')
    const dispatch = (name: string, isError: boolean) => subject.session.append('tool/ptc-dispatch', {
      rootCallId: ToolCallId('ptc-root'),
      parentCallId: ToolCallId('ptc-root'),
      subCallId: ToolCallId(`ptc-${name}`),
      name: 'tool_activate',
      arguments: { name },
      isError,
      content: [{ type: 'text', text: isError ? 'unavailable' : 'activated' }],
    })
    const ctx = await mount()
    dispatch('optional', true)
    expect(ctx.tools.get('optional', subject)).toBeUndefined()
    dispatch('optional', false)
    expect(ctx.tools.get('optional', subject)).toBeDefined()
  })
})
