import { describe, expect, it, vi } from 'vitest'
import { DeviceSource } from '../src/client/source.ts'
import { projectDevice } from '../src/model.ts'

describe('Device browser source', () => {
  it('coalesces refreshes and retains measurements and their read time on failure', async () => {
    const device = projectDevice({ id: 'server1', name: 'PC', status: 'down', info: {} }, undefined, undefined, '')
    const fetcher = vi.fn(async () => Response.json([device]))
    const source = new DeviceSource(fetcher)
    const first = source.refresh()
    expect(source.refresh()).toBe(first)
    await first
    const ready = source.store.getSnapshot()
    fetcher.mockResolvedValue(Response.json({ error: 'auth' }, { status: 502 }))
    await source.refresh()
    expect(source.store.getSnapshot()).toEqual({ ...ready, issue: 'auth' })
    await source.dispose()
    await source.refresh()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not publish after disposal and reports setup guidance', async () => {
    const source = new DeviceSource(vi.fn(async () => Response.json({ error: 'unconfigured' }, { status: 503 })))
    await source.refresh()
    expect(source.store.getSnapshot().issue).toBe('unconfigured')
    const pending = new DeviceSource(vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(init.signal?.reason) }, { once: true })
    })))
    void pending.refresh()
    await pending.dispose()
    expect(pending.store.getSnapshot().devices).toBeNull()
  })
})
