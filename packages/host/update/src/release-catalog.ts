/** GitHub Release retrieval, validation, SemVer selection, and bilingual-note projection. */

import { compare, gt, valid } from 'semver'
import { z } from 'zod'
import type { DshReleaseView } from './types.ts'

const GITHUB_PAGE_SIZE = 100

const githubReleaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  html_url: z.url(),
})

const githubReleasePageSchema = z.array(githubReleaseSchema)
type GithubRelease = z.infer<typeof githubReleaseSchema>

/** Network and selection policy for GitHub Release discovery. */
export interface ReleaseCatalogConfig {
  readonly apiBase: string
  readonly owner: string
  readonly repository: string
  readonly includePrereleases: boolean
  readonly requestTimeoutMs: number
  readonly cacheTtlMs: number
  readonly maxResponseBytes: number
  readonly maxPages: number
}

/** Selected releases and the newest offered target. */
export interface ReleaseSelection {
  readonly target?: DshReleaseView
  readonly releases: readonly DshReleaseView[]
  readonly compareUrl?: string
}

/** Read a response body without allowing an upstream payload to grow memory without a bound. */
async function boundedText(response: Response, limit: number): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.byteLength
      if (length > limit) throw new Error(`GitHub Releases response exceeds ${String(limit)} bytes`)
      chunks.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** Strip only the navigation line and divider chrome surrounding one release-language section. */
function cleanSection(value: string): string {
  return value
    .replace(/^\s*\[(?:中文|Chinese)\]\([^\n]+\)\s*\|\s*\[English\]\([^\n]+\)\s*$/gimu, '')
    .replace(/^\s*---\s*$/gmu, '')
    .trim()
}

/**
 * Split the bilingual heading convention used by DSH releases. A release
 * with one language (or no recognized heading) remains complete on both
 * client locales instead of disappearing.
 * @param body - GitHub Release Markdown body.
 * @returns locale-specific Markdown without the language navigation chrome.
 */
export function releaseNotes(body: string): { notesEn: string; notesZh: string } {
  const headings = [...body.matchAll(/<h3\s+id=["'](cn|en)-[^"']+["'][^>]*>[\s\S]*?<\/h3>/giu)]
  const sections = new Map<string, string>()
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    if (heading === undefined) continue
    const language = heading[1]
    const start = heading.index + heading[0].length
    const end = headings[index + 1]?.index ?? body.length
    if (language !== undefined && !sections.has(language)) {
      sections.set(language, cleanSection(body.slice(start, end)))
    }
  }
  const fallback = cleanSection(body)
  const notesEn = sections.get('en') || sections.get('cn') || fallback
  const notesZh = sections.get('cn') || sections.get('en') || fallback
  return { notesEn, notesZh }
}

/** Convert one accepted DSH release into the Client wire fields. */
function releaseView(release: GithubRelease, version: string): DshReleaseView {
  return {
    version,
    tag: release.tag_name,
    name: release.name?.trim() || release.tag_name,
    publishedAt: release.published_at ?? release.created_at,
    url: release.html_url,
    ...releaseNotes(release.body ?? ''),
  }
}

/** Stateful GitHub reader with a short per-process cache to protect the public API rate limit. */
export class ReleaseCatalog {
  private cached?: { readonly at: number; readonly releases: readonly GithubRelease[] }

  /** @param config - GitHub endpoint, repository identity, and resource limits. */
  constructor(
    private readonly config: ReleaseCatalogConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * List releases newer than `currentVersion`, oldest first, with the newest
   * one selected as the target.
   * @param currentVersion - running DSH SemVer.
   * @param force - bypass the process cache for an explicit user refresh.
   * @param signal - caller cancellation.
   * @returns intermediate release notes and compare URL.
   */
  async select(currentVersion: string, force: boolean, signal: AbortSignal): Promise<ReleaseSelection> {
    if (valid(currentVersion) === null) throw new Error(`running DSH version is not SemVer: ${currentVersion}`)
    const releases = await this.list(force, signal)
    const views: DshReleaseView[] = []
    for (const release of releases) {
      if (release.draft || (!this.config.includePrereleases && release.prerelease)) continue
      const version = release.tag_name.startsWith('dsh-v') ? release.tag_name.slice('dsh-v'.length) : ''
      if (valid(version) === null || !gt(version, currentVersion)) continue
      views.push(releaseView(release, version))
    }
    views.sort((left, right) => compare(left.version, right.version))
    const target = views.at(-1)
    return {
      ...(target === undefined ? {} : { target }),
      releases: views,
      ...(target === undefined ? {} : {
        compareUrl: `https://github.com/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}/compare/dsh-v${encodeURIComponent(currentVersion)}...${encodeURIComponent(target.tag)}`,
      }),
    }
  }

  /** Read all configured pages, caching the validated GitHub records. */
  private async list(force: boolean, signal: AbortSignal): Promise<readonly GithubRelease[]> {
    const now = this.now()
    if (!force && this.cached !== undefined && now - this.cached.at < this.config.cacheTtlMs) {
      return this.cached.releases
    }
    const releases: GithubRelease[] = []
    for (let page = 1; page <= this.config.maxPages; page += 1) {
      const url = new URL(
        `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}/releases`,
        this.config.apiBase,
      )
      url.searchParams.set('per_page', String(GITHUB_PAGE_SIZE))
      url.searchParams.set('page', String(page))
      const timeout = AbortSignal.timeout(this.config.requestTimeoutMs)
      const combined = AbortSignal.any([signal, timeout])
      const response = await this.fetcher(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'deepseek-harness-update-check',
        },
        signal: combined,
      })
      if (!response.ok) throw new Error(`GitHub Releases request failed with HTTP ${String(response.status)}`)
      const text = await boundedText(response, this.config.maxResponseBytes)
      const parsed = githubReleasePageSchema.safeParse(JSON.parse(text))
      if (!parsed.success) throw new Error(`GitHub Releases response is invalid: ${parsed.error.message}`)
      releases.push(...parsed.data)
      if (parsed.data.length < GITHUB_PAGE_SIZE) break
      if (page === this.config.maxPages) {
        throw new Error(`GitHub Releases history exceeds the configured ${String(this.config.maxPages)} pages`)
      }
    }
    this.cached = { at: now, releases }
    return releases
  }
}
