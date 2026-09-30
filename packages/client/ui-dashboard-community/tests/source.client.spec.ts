import { describe, expect, it, vi } from 'vitest'
import { FeedSource } from '../src/client/source.ts'

describe('Dashboard feed recovery', () => {
  it('preserves successful data and refreshes again on reopening after an upstream failure', async () => {
    const fetcher = vi.fn(async () => Response.json({ text: 'Result' }))
    const source = new FeedSource('/api/example', value => value, fetcher)
    await source.refresh()
    const first = source.store.getSnapshot()
    fetcher.mockImplementationOnce(async () => Response.json({ error: 'rateLimit' }, { status: 502 }))
    source.ensure()
    await vi.waitFor(() => { expect(source.store.getSnapshot().phase).toBe('error') })
    expect(source.store.getSnapshot()).toMatchObject({ value: first.value, updatedAt: first.updatedAt, error: 'rateLimit' })
    source.ensure()
    await vi.waitFor(() => { expect(source.store.getSnapshot().phase).toBe('ready') })
    expect(fetcher).toHaveBeenCalledTimes(3)
    await source.dispose()
  })

  it('distinguishes expired authentication from malformed successful data', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }))
    const source = new FeedSource('/api/example', () => undefined, fetcher)
    await source.refresh()
    expect(source.store.getSnapshot().error).toBe('auth')
    fetcher.mockImplementationOnce(async () => Response.json({ bad: true }))
    await source.refresh()
    expect(source.store.getSnapshot().error).toBe('invalid')
    await source.dispose()
  })

  it('cancels outstanding work on disposal and ignores its late response', async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      init?.signal?.addEventListener('abort', () => { resolve(Response.json({ text: 'Late' })) }, { once: true })
    }))
    const source = new FeedSource('/api/example', value => value, fetcher)
    const pending = source.refresh()
    await source.dispose()
    await pending
    expect(source.store.getSnapshot().phase).toBe('loading')
    await source.refresh()
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
