import { describe, expect, it, vi } from 'vitest'
import { Config } from '../src/index.ts'
import { handleFeed, loadGithub, loadTibo } from '../src/feed.ts'
import { parseTiboStatus } from '../src/model.ts'

const watch = {
  data: { active_watch: { reset_chance_percent: null, text: 'Possible reset near an event.' } },
  provenance: { watch_expired: false },
  stale: false,
  source_url: 'https://codex-resets.com',
  fetched_at: '2026-09-29T10:00:00Z',
}

describe('Dashboard community feeds', () => {
  it('keeps an absent or expired Tibo probability unknown', () => {
    expect(parseTiboStatus(watch)?.chancePercent).toBeNull()
    expect(parseTiboStatus({
      ...watch, data: { active_watch: { ...watch.data.active_watch, reset_chance_percent: 62 } },
    })?.chancePercent).toBe(62)
    expect(parseTiboStatus({
      ...watch, data: { active_watch: { ...watch.data.active_watch, reset_chance_percent: 62 } }, provenance: { watch_expired: true },
    })?.chancePercent).toBeNull()
    expect(parseTiboStatus({
      ...watch, data: { active_watch: { ...watch.data.active_watch, reset_chance_percent: 62 } },
      stale: true,
    })?.chancePercent).toBeNull()
  })

  it('uses a fixed Tibo origin and projects the public source', async () => {
    let requested = ''
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return Response.json(watch)
    })
    const result = await loadTibo(fetcher, new AbortController().signal)
    expect(requested).toBe('https://tibo.cc/api/v1/status')
    expect(result).toMatchObject({ chancePercent: null, sourceUrl: 'https://codex-resets.com' })
  })

  it('searches a rolling creation window and rejects malformed repository rows', async () => {
    let requested = ''
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return Response.json({ items: [{
        full_name: 'owner/project', html_url: 'https://github.com/owner/project',
        url: 'https://api.github.com/repos/owner/project', stargazers_count: 42,
      }] })
    })
    const rows = await loadGithub(fetcher, 7, 5, new Date('2026-09-29T10:00:00Z'), new AbortController().signal)
    const url = new URL(requested)
    expect(url.origin).toBe('https://api.github.com')
    expect(url.searchParams.get('q')).toBe('created:>=2026-09-22')
    expect(url.searchParams.get('sort')).toBe('stars')
    expect(url.searchParams.get('per_page')).toBe('5')
    expect(rows[0]).toMatchObject({ fullName: 'owner/project', stars: 42 })
    const bad = vi.fn(async () => Response.json({ items: [{ full_name: 'owner/project', html_url: 'javascript:alert(1)', stargazers_count: 42 }] }))
    await expect(loadGithub(bad, 7, 5, new Date('2026-09-29T10:00:00Z'), new AbortController().signal)).rejects.toThrow('invalid repository')
  })

  it('serves authenticated-route payloads without caching and stops on unload', async () => {
    expect(Config({})).toEqual({ githubDays: 7, githubCount: 8, requestTimeoutMs: 12_000 })
    expect(() => Config({ githubDays: 0 })).toThrow()
    const request = new Request('http://localhost/api/dashboard.tibo')
    const response = await handleFeed('tibo', request, vi.fn(async () => Response.json(watch)),
      { githubDays: 7, githubCount: 8, requestTimeoutMs: 12_000 }, new AbortController().signal)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ chancePercent: null })
    const lifetime = new AbortController()
    lifetime.abort()
    const aborted = await handleFeed('tibo', request, vi.fn(async () => Response.json(watch)),
      { githubDays: 7, githubCount: 8, requestTimeoutMs: 12_000 }, lifetime.signal)
    expect(aborted.status).toBe(502)
  })
})
