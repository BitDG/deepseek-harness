import { afterEach, describe, expect, it, vi } from 'vitest'
import { HackerNewsSource, parseStory } from '../src/client/source.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('Hacker News dashboard source', () => {
  it('keeps the browser fetch receiver when no transport is injected', async () => {
    const browserFetch = vi.fn(function (this: typeof globalThis): Promise<Response> {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(Response.json({ stories: [{ id: 31, title: 'First' }], failedCount: 0 }))
    })
    vi.stubGlobal('fetch', browserFetch)
    const source = new HackerNewsSource()
    await source.refresh()
    expect(source.store.getSnapshot().phase).toBe('ready')
    expect(browserFetch).toHaveBeenCalledOnce()
    await source.dispose()
  })

  it('keeps only safe links and visible stories from the API response', () => {
    expect(parseStory({ id: 12, title: 'Example', url: 'javascript:alert(1)', score: 3 })?.url)
      .toBe('https://news.ycombinator.com/item?id=12')
    expect(parseStory({ id: 13, title: 'Hidden', deleted: true })).toBeUndefined()
    expect(parseStory({ id: '13', title: 'Wrong id' })).toBeUndefined()
  })

  it('loads ordered stories, preserves them on refresh failure, and cancels on dispose', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      expect(init?.signal).toBeDefined()
      expect(url).toBe('/api/dashboard.hacker-news')
      return Response.json({ stories: [
        { id: 31, title: 'First', score: 5, comments: 2 },
        { id: 32, title: 'Second', url: 'https://example.org/story' },
      ], failedCount: 0 })
    })
    const source = new HackerNewsSource(fetcher)
    await source.refresh()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(source.store.getSnapshot()).toMatchObject({
      phase: 'ready', stories: [{ title: 'First' }, { title: 'Second', url: 'https://example.org/story' }],
    })
    const { phase, stories } = source.store.getSnapshot()
    expect({ phase, stories }).toMatchInlineSnapshot(`
      {
        "phase": "ready",
        "stories": [
          {
            "comments": 2,
            "commentsUrl": "https://news.ycombinator.com/item?id=31",
            "id": 31,
            "score": 5,
            "title": "First",
            "url": "https://news.ycombinator.com/item?id=31",
          },
          {
            "comments": 0,
            "commentsUrl": "https://news.ycombinator.com/item?id=32",
            "id": 32,
            "score": 0,
            "title": "Second",
            "url": "https://example.org/story",
          },
        ],
      }
    `)

    fetcher.mockRejectedValueOnce(new Error('offline'))
    await source.refresh()
    expect(source.store.getSnapshot().phase).toBe('error')
    expect(source.store.getSnapshot().stories).toHaveLength(2)

    await source.dispose()
    await source.refresh()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('waits for an aborted request during disposal without publishing its failure', async () => {
    let aborted = false
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    const source = new HackerNewsSource(fetcher)
    const loading = source.refresh()
    await source.dispose()
    await loading
    expect(aborted).toBe(true)
    expect(source.store.getSnapshot().phase).toBe('loading')
  })

  it('refreshes on reopening, retains articles on failure, and retries after that failure', async () => {
    const fetcher = vi.fn(async () => Response.json({ stories: [{ id: 31, title: 'First' }], failedCount: 1 }))
    const source = new HackerNewsSource(fetcher)
    await source.refresh()
    const first = source.store.getSnapshot()
    fetcher.mockImplementationOnce(async () => Response.json({ error: 'timeout' }, { status: 502 }))
    source.ensure()
    await vi.waitFor(() => { expect(source.store.getSnapshot().phase).toBe('error') })
    expect(source.store.getSnapshot()).toMatchObject({ stories: first.stories, updatedAt: first.updatedAt, error: 'timeout' })
    source.ensure()
    await vi.waitFor(() => { expect(source.store.getSnapshot().phase).toBe('ready') })
    expect(fetcher).toHaveBeenCalledTimes(3)
    await source.dispose()
  })
})
