import { describe, expect, it, vi } from 'vitest'
import { ReleaseCatalog, releaseNotes } from '../src/release-catalog.ts'

const config = {
  apiBase: 'https://api.github.test',
  owner: 'deepseek-ai',
  repository: 'deepseek-harness',
  includePrereleases: true,
  requestTimeoutMs: 1_000,
  cacheTtlMs: 60_000,
  maxResponseBytes: 8_192,
  maxPages: 2,
}

function release(version: string, body = `notes ${version}`, prerelease = true) {
  return {
    tag_name: `dsh-v${version}`,
    name: `DSH ${version}`,
    body,
    draft: false,
    prerelease,
    published_at: '2026-09-03T00:00:00Z',
    created_at: '2026-09-03T00:00:00Z',
    html_url: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${version}`,
  }
}

describe('ReleaseCatalog', () => {
  it('selects every newer SemVer in order and caches a validated page', async () => {
    const payload = JSON.stringify([
      release('0.1.2-alpha.5', '<h3 id="cn-notes">中文</h3>第五版<h3 id="en-notes">English</h3>Alpha five'),
      release('0.1.2-alpha.4'),
      release('0.1.2-alpha.3'),
      { ...release('9.0.0'), draft: true },
      { ...release('invalid'), tag_name: 'latest' },
    ])
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(payload))
    const catalog = new ReleaseCatalog(config, fetcher, () => 1_000)
    const signal = new AbortController().signal

    const selected = await catalog.select('0.1.2-alpha.3', false, signal)
    expect(selected.releases.map(item => item.version)).toEqual(['0.1.2-alpha.4', '0.1.2-alpha.5'])
    expect(selected.target?.notesZh).toBe('第五版')
    expect(selected.target?.notesEn).toBe('Alpha five')
    expect(selected.compareUrl).toContain('dsh-v0.1.2-alpha.3...dsh-v0.1.2-alpha.5')
    await catalog.select('0.1.2-alpha.3', false, signal)
    expect(fetcher).toHaveBeenCalledOnce()
    await catalog.select('0.1.2-alpha.3', true, signal)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('filters prereleases when configured and rejects invalid or oversized input', async () => {
    const signal = new AbortController().signal
    const stableOnly = new ReleaseCatalog(
      { ...config, includePrereleases: false },
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([
        release('1.0.0-alpha.1'), release('1.0.0', 'stable', false),
      ]))),
    )
    await expect(stableOnly.select('0.9.0', false, signal)).resolves.toMatchObject({
      target: { version: '1.0.0' },
    })
    await expect(stableOnly.select('not-semver', false, signal)).rejects.toThrow('not SemVer')

    const oversized = new ReleaseCatalog(
      { ...config, maxResponseBytes: 2 },
      vi.fn<typeof fetch>().mockResolvedValue(new Response('[ ]')),
    )
    await expect(oversized.select('0.1.0', false, signal)).rejects.toThrow('exceeds 2 bytes')
  })

  it('keeps a single-language or plain release note visible in both locales', () => {
    expect(releaseNotes('plain')).toEqual({ notesEn: 'plain', notesZh: 'plain' })
    expect(releaseNotes('<h3 id="en-only">English</h3>Only English')).toEqual({
      notesEn: 'Only English',
      notesZh: 'Only English',
    })
  })
})
