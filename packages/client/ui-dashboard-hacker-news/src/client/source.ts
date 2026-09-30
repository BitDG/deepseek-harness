/** React-free Hacker News fetch and snapshot owner. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { HACKER_NEWS_PATH } from '../route.ts'
import { parseStory, type HackerNewsStory } from '../story.ts'

export { parseStory } from '../story.ts'
export type { HackerNewsStory } from '../story.ts'

/** Safe request failure categories displayed through this card's dictionary. */
export type HackerNewsIssue = 'timeout' | 'network' | 'auth' | 'rateLimit' | 'invalid' | 'upstream'

/** Loading and last usable results from the authenticated Host route. */
export interface HackerNewsSnapshot {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error'
  readonly stories: readonly HackerNewsStory[]
  readonly failedCount: number
  readonly error: HackerNewsIssue | null
  readonly updatedAt: number | null
}

/** Own one card's requests and cached result until its plugin unloads. */
export class HackerNewsSource {
  /** Last usable stories and current request phase for the browser card. */
  readonly store = createSnapshotStore<HackerNewsSnapshot>({ phase: 'idle', stories: [], failedCount: 0, error: null, updatedAt: null })
  private request: AbortController | undefined
  private readonly pending = new Set<Promise<void>>()
  private disposed = false

  /** @param fetcher - browser fetch or an injected test transport. */
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  /** Whether an asynchronous result still belongs to the mounted plugin. */
  private active(request: AbortController): boolean {
    return this.request === request && !this.disposed
  }

  /** Refresh on each mount, coalescing an already running request. */
  ensure(): void {
    if (this.store.getSnapshot().phase !== 'loading') void this.refresh()
  }

  /** Read the current top stories, retaining older results if refresh fails. */
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const task = this.load()
    this.pending.add(task)
    void task.then(
      () => { this.pending.delete(task) },
      () => { this.pending.delete(task) },
    )
    return task
  }

  /** Run one replaceable request while newer refreshes and disposal may cancel it. */
  private async load(): Promise<void> {
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    const previous = this.store.getSnapshot()
    this.store.set({ ...previous, phase: 'loading', error: null })
    let issue: HackerNewsIssue = 'network'
    try {
      const response = await this.fetcher(HACKER_NEWS_PATH, { signal: request.signal })
      if (!response.ok) {
        issue = response.status === 401 || response.status === 403 ? 'auth'
          : response.status === 429 ? 'rateLimit' : response.status === 504 ? 'timeout' : 'upstream'
        if (response.headers.get('content-type')?.includes('application/json')) {
          const payload: unknown = await response.json()
          const value = payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>).error : undefined
          if (value === 'timeout' || value === 'network' || value === 'rateLimit' || value === 'invalid' || value === 'upstream') issue = value
        }
        throw new Error(`Hacker News: HTTP ${response.status}`)
      }
      issue = 'invalid'
      const payload: unknown = await response.json()
      if (payload === null || typeof payload !== 'object') throw new Error('Hacker News: invalid response')
      const { stories: rows, failedCount } = payload as Record<string, unknown>
      if (!Array.isArray(rows) || !Number.isSafeInteger(failedCount) || (failedCount as number) < 0) throw new Error('Hacker News: invalid response')
      const stories = rows.map(parseStory)
      if (stories.some(story => story === undefined)) throw new Error('Hacker News: invalid story')
      if (this.active(request)) this.store.set({ phase: 'ready', stories: stories as HackerNewsStory[],
        failedCount: failedCount as number, error: null, updatedAt: Date.now() })
    } catch {
      if (this.active(request)) this.store.set({ ...previous, phase: 'error', error: issue })
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  /** Cancel requests and wait for their browser fetches before plugin teardown completes. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.request?.abort()
    await Promise.allSettled([...this.pending])
    this.request = undefined
  }
}
