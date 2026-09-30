import { describe, expect, it, vi } from 'vitest'
import { Config } from '../src/index.ts'
import { handleFeed, loadTopStories } from '../src/feed.ts'

describe('Hacker News Host feed', () => {
  it('validates deployment limits', () => {
    expect(Config({})).toEqual({ storyCount: 8, requestTimeoutMs: 12_000 })
    expect(() => Config({ storyCount: 21 })).toThrow()
    expect(() => Config({ requestTimeoutMs: 0 })).toThrow()
  })

  it('reads the fixed API origin in rank order and serves a non-cacheable route', async () => {
    const urls: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(init?.signal).toBeDefined()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      urls.push(url)
      if (url.endsWith('/topstories.json')) return Response.json([31, 32])
      if (url.endsWith('/item/31.json')) return Response.json({ id: 31, title: 'First', score: 5, descendants: 2 })
      if (url.endsWith('/item/32.json')) return Response.json({ id: 32, title: 'Second', url: 'javascript:alert(1)' })
      throw new Error(`Unexpected URL: ${url}`)
    })
    const response = await handleFeed(new Request('http://localhost/api/dashboard.hacker-news'),
      fetcher, 2, 12_000, new AbortController().signal)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ failedCount: 0, stories: [
      { id: 31, title: 'First', comments: 2 },
      { id: 32, title: 'Second', url: 'https://news.ycombinator.com/item?id=32' },
    ] })
    expect(urls).toEqual([
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      'https://hacker-news.firebaseio.com/v0/item/31.json',
      'https://hacker-news.firebaseio.com/v0/item/32.json',
    ])
  })

  it('rejects invalid rankings and reports upstream failure', async () => {
    const fetcher = vi.fn(async () => Response.json([31, '32']))
    await expect(loadTopStories(fetcher, 8, new AbortController().signal))
      .rejects.toThrow('invalid response')
    const response = await handleFeed(new Request('http://localhost/api/dashboard.hacker-news'),
      fetcher, 8, 12_000, new AbortController().signal)
    expect(response.status).toBe(502)
  })

  it('aborts outstanding upstream work when the plugin lifetime ends', async () => {
    const lifetime = new AbortController()
    let aborted = false
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    const task = handleFeed(new Request('http://localhost/api/dashboard.hacker-news'),
      fetcher, 8, 12_000, lifetime.signal)
    lifetime.abort()
    expect((await task).status).toBe(502)
    expect(aborted).toBe(true)
  })

  it('retains rank order when one article cannot connect', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('topstories.json')) return Response.json([31, 32, 33])
      if (url.endsWith('/32.json')) throw new TypeError('fetch failed')
      return Response.json({ id: url.endsWith('/31.json') ? 31 : 33, title: 'Readable' })
    })
    const response = await handleFeed(new Request('http://localhost/api/dashboard.hacker-news'),
      fetcher, 3, 12_000, new AbortController().signal)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ failedCount: 1, stories: [{ id: 31 }, { id: 33 }] })
  })

  it('returns successful articles when the shared deadline aborts a slower article', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('topstories.json')) return Response.json([31, 32])
      if (url.endsWith('/31.json')) return Response.json({ id: 31, title: 'Readable' })
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { reject(new DOMException('Timed out', 'TimeoutError')) }, { once: true })
      })
    })
    const response = await handleFeed(new Request('http://localhost/api/dashboard.hacker-news'),
      fetcher, 2, 20, new AbortController().signal)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ failedCount: 1, stories: [{ id: 31 }] })
  })

  it('distinguishes rate limiting, malformed data, and network failures', async () => {
    for (const [fetcher, error] of [
      [vi.fn(async () => new Response(null, { status: 429 })), 'rateLimit'],
      [vi.fn(async () => Response.json({ bad: true })), 'invalid'],
      [vi.fn(async () => { throw new TypeError('fetch failed') }), 'network'],
    ] as const) {
      const response = await handleFeed(new Request('http://localhost/api/dashboard.hacker-news'),
        fetcher, 2, 12_000, new AbortController().signal)
      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error })
    }
  })
})
