import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject, PANEL_ID } from '../src/client/index.ts'

const Empty = () => null

describe('dashboard composition', () => {
  it('lets independent cards mount, unmount, and return after the panel redeclares its slot', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('layout', { selectPanel: () => {} } as never)
    const root = ctx.slots.register({
      name: 'root',
      children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      },
    } as never, Empty)
    const board = ctx.plugin({ inject: [...inject], apply })
    await board.await()
    expect(ctx.slots.entries('main').map(entry => entry.options.key)).toContain(PANEL_ID)
    expect(ctx.slots.spec('dashboard.card')).toMatchObject({ kind: 'list', scope: 'root' })
    const footer = ctx.slots.entries('sidebar.footer.action')[0]
    expect(footer?.options.id).toBe('dashboard-open')

    const card = ctx.plugin({ inject: ['slots'], apply: (cardCtx: Context) => {
      cardCtx.slots.inject('dashboard.card', () => cardCtx.slots.register({
        name: 'dashboard.card', id: 'independent', order: 30,
      }, Empty))
    } })
    await card.await()
    expect(ctx.slots.entries('dashboard.card').map(entry => entry.options.id)).toEqual(['independent'])
    await card.dispose()
    expect(ctx.slots.entries('dashboard.card')).toHaveLength(0)

    root()
    expect(ctx.slots.spec('dashboard.card')).toBeUndefined()
    const restored = ctx.slots.register({
      name: 'root',
      children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      },
    } as never, Empty)
    expect(ctx.slots.spec('dashboard.card')).toMatchObject({ kind: 'list' })
    await board.dispose()
    expect(ctx.slots.entries('main')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.footer.action')).toHaveLength(0)
    restored()
    await ctx.fiber.dispose()
  })
})
