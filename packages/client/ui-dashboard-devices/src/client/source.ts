/** Browser snapshot owner for authenticated device readings. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { parseDevices, type Device } from '../model.ts'
import { DEVICES_PATH } from '../route.ts'

/** Safe request failures rendered through the card dictionary. */
export type DeviceIssue = 'unconfigured' | 'auth' | 'timeout' | 'network' | 'rateLimit' | 'invalid' | 'upstream'

/** Last usable readings and the current request phase. */
export interface DeviceSnapshot {
  readonly devices: readonly Device[] | null
  readonly loading: boolean
  readonly issue: DeviceIssue | null
  readonly updatedAt: number | null
}

/** Own a coalesced request and retain the latest successful measurements. */
export class DeviceSource {
  /** Stable observable bound by the slot renderer. */
  readonly store = createSnapshotStore<DeviceSnapshot>({ devices: null, loading: false, issue: null, updatedAt: null })
  private readonly lifetime = new AbortController()
  private pending: Promise<void> | undefined

  /** @param fetcher - same-origin browser transport. */
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  /**
   * Refresh once, coalescing active reads and retaining older data on failure.
   * @returns settlement of the active browser request.
   */
  refresh(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.resolve()
    if (this.pending) return this.pending
    const previous = this.store.getSnapshot()
    this.store.set({ ...previous, loading: true, issue: null })
    this.pending = this.read(previous).finally(() => { this.pending = undefined })
    return this.pending
  }

  private async read(previous: DeviceSnapshot): Promise<void> {
    let issue: DeviceIssue = 'network'
    try {
      const response = await this.fetcher(DEVICES_PATH, { signal: this.lifetime.signal })
      issue = response.status === 401 || response.status === 403 ? 'auth' : 'upstream'
      const body: unknown = await response.json()
      if (!response.ok) {
        const code = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).error : undefined
        if (code === 'unconfigured' || code === 'auth' || code === 'timeout' || code === 'network'
          || code === 'rateLimit' || code === 'invalid' || code === 'upstream') issue = code
        throw new Error('Device feed unavailable')
      }
      issue = 'invalid'
      const devices = parseDevices(body)
      if (devices === undefined) throw new Error('Device feed invalid')
      if (!this.lifetime.signal.aborted) this.store.set({ devices, loading: false, issue: null, updatedAt: Date.now() })
    } catch (error) {
      // Only localized categories reach the browser; diagnostics may include private source details.
      void error
      if (!this.lifetime.signal.aborted) this.store.set({ ...previous, loading: false, issue })
    }
  }

  /** Cancel and await the active request before removing the plugin. */
  async dispose(): Promise<void> {
    this.lifetime.abort()
    await this.pending
  }
}
