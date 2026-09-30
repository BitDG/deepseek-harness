/** Browser-owned observable state for one authenticated public feed. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Localized request failure categories; upstream diagnostics never reach the card. */
export type FeedIssue = 'timeout' | 'network' | 'auth' | 'rateLimit' | 'invalid' | 'upstream'

/** Latest usable result and the current source request phase. */
export interface FeedSnapshot<T> {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error'
  readonly value: T | null
  readonly error: FeedIssue | null
  readonly updatedAt: number | null
}

/** One replaceable browser request and its last usable parsed result. */
export class FeedSource<T> {
  /** Snapshot consumed by the registered card's injected hook. */
  readonly store = createSnapshotStore<FeedSnapshot<T>>({ phase: 'idle', value: null, error: null, updatedAt: null })
  private request: AbortController | undefined
  private readonly pending = new Set<Promise<void>>()
  private disposed = false

  /**
   * @param path - authenticated same-origin DSH feed path.
   * @param parse - decoder for untrusted wire data.
   * @param fetcher - browser transport or test transport.
   */
  constructor(
    private readonly path: string,
    private readonly parse: (value: unknown) => T | undefined,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  /** Refresh whenever the card mounts, coalescing an already running request. */
  ensure(): void {
    if (this.store.getSnapshot().phase !== 'loading') void this.refresh()
  }

  /** Replace an in-flight request and retain the last usable result on error. */
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const task = this.load()
    this.pending.add(task)
    void task.then(() => { this.pending.delete(task) }, () => { this.pending.delete(task) })
    return task
  }

  /** Settle one request only while this source still owns it. */
  private async load(): Promise<void> {
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    const previous = this.store.getSnapshot()
    this.store.set({ ...previous, phase: 'loading', error: null })
    let issue: FeedIssue = 'network'
    try {
      const response = await this.fetcher(this.path, { signal: request.signal })
      if (!response.ok) {
        issue = response.status === 401 || response.status === 403 ? 'auth'
          : response.status === 429 ? 'rateLimit' : response.status === 504 ? 'timeout' : 'upstream'
        if (response.headers.get('content-type')?.includes('application/json')) {
          const payload: unknown = await response.json()
          const value = payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>).error : undefined
          if (value === 'timeout' || value === 'network' || value === 'rateLimit' || value === 'invalid' || value === 'upstream') issue = value
        }
        throw new Error(`Dashboard feed: HTTP ${response.status}`)
      }
      issue = 'invalid'
      const parsed = this.parse(await response.json())
      if (parsed === undefined) throw new Error('Dashboard feed: invalid response')
      if (this.request === request && !this.disposed) this.store.set({ phase: 'ready', value: parsed, error: null, updatedAt: Date.now() })
    } catch {
      if (this.request === request && !this.disposed) this.store.set({ ...previous, phase: 'error', error: issue })
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  /** Cancel and await browser work when the plugin unloads. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.request?.abort()
    await Promise.allSettled([...this.pending])
    this.request = undefined
  }
}
