// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { UpdateSection, type UpdateSectionInjected } from '../src/client/UpdateSection.tsx'

usePinnedBrowserLanguages('en')
afterEach(cleanup)

describe('ui-settings-update browser plugin', () => {
  it('registers one lazy Settings section and unwraps Remote results', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    class RemoteService extends Service {
      constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
    }
    new RemoteService(ctx)
    const check = vi.fn().mockResolvedValue({ ok: true, value: { marker: 'checked' } })
    const download = vi.fn().mockResolvedValue({ ok: true, value: { marker: 'downloaded' } })
    const applyUpdate = vi.fn().mockResolvedValue({ ok: false, error: { message: 'blocked' } })
    ctx.provide('remote.update', { check, download, apply: applyUpdate })
    ctx.slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = ctx.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(UpdateSection)
    expect(entry.options).toMatchObject({ id: 'update', order: 40 })
    expect(resolveSlotLabel(entry.options.label)).toBe('DSH update')
    expect(check).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => UpdateSectionInjected)()
    await expect(injected.check(true)).resolves.toEqual({ marker: 'checked' })
    await expect(injected.download('tag')).resolves.toEqual({ marker: 'downloaded' })
    await expect(injected.install('tag')).rejects.toThrow('blocked')
    await ctx.fiber.dispose()
  })

  it('declares only services used by the contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.update'])
  })
})
