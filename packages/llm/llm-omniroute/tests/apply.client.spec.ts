import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { OmniRouteCard } from '../src/client/OmniRouteCard.tsx'

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.models.footer': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('OmniRoute client plugin', () => {
  it('mounts its generated Remote namespace and registers a localized footer card', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    declare(slots)
    const locale = new LocaleRuntime(ctx)
    locale.setLocale('zh')
    ctx.provide('locale', locale)
    const unmount = vi.fn(() => Promise.resolve())
    const operations = {
      status: vi.fn(),
      startAndConnect: vi.fn(),
      stop: vi.fn(),
    }
    const mount = vi.fn(() => Promise.resolve(unmount))
    ctx.provide('remote', { $mount: mount, omniroute: operations } as never)
    ctx.provide('remote.omniroute', operations)

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(mount).toHaveBeenCalledOnce()
    const entry = slots.entries('settings.models.footer')[0]
    if (entry === undefined) throw new Error('OmniRoute footer slot was not registered')
    expect(entry.component).toBe(OmniRouteCard)
    expect(entry.options).toMatchObject({ id: 'omniroute', order: 10 })
    expect(resolveSlotLabel(entry.options.label)).toBe('OmniRoute')
    const injected = (entry.inject as unknown as () => { operations: unknown; t(key: 'start'): string })()
    expect(injected.operations).toBe(operations)
    expect(injected.t('start')).toBe('启动并接入')

    await fiber.dispose()
    expect(unmount).toHaveBeenCalledOnce()
    expect(slots.entries('settings.models.footer')).toEqual([])
  })

  it('declares only the services used by its mount and card registration', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale'])
  })
})
