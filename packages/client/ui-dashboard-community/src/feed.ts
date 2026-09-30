/** Fixed-origin public feed readers for the dashboard's adapted cards. */
import { parseRepository, parseTiboStatus, type TiboStatus, type TrendingRepository } from './model.ts'

const TIBO_API = 'https://tibo.cc/api/v1/status'
const GITHUB_API = 'https://api.github.com/search/repositories'

/**
 * Read the third-party reset watch without inventing a probability.
 * @param fetcher - Host transport or test transport.
 * @param signal - request and plugin cancellation.
 * @returns fresh-source metadata and a nullable probability.
 */
export async function loadTibo(fetcher: typeof fetch, signal: AbortSignal): Promise<TiboStatus> {
  const response = await fetcher(TIBO_API, { signal })
  if (!response.ok) throw new Error(`Tibo: HTTP ${response.status}`)
  const status = parseTiboStatus(await response.json())
  if (status === undefined) throw new Error('Tibo: invalid response')
  return status
}

/**
 * Rank recently created repositories by current star count using GitHub Search.
 * @param fetcher - Host transport or test transport.
 * @param days - validated lookback days.
 * @param count - validated maximum result count.
 * @param now - current time used for the rolling search boundary.
 * @param signal - request and plugin cancellation.
 * @returns GitHub Search results in its ranking order.
 */
export async function loadGithub(
  fetcher: typeof fetch, days: number, count: number, now: Date, signal: AbortSignal,
): Promise<TrendingRepository[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
  const url = new URL(GITHUB_API)
  url.searchParams.set('q', `created:>=${since}`)
  url.searchParams.set('sort', 'stars')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', String(count))
  const response = await fetcher(url, { signal, headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-dashboard' } })
  if (!response.ok) throw new Error(`GitHub Search: HTTP ${response.status}`)
  const payload: unknown = await response.json()
  if (payload === null || typeof payload !== 'object' || !Array.isArray((payload as Record<string, unknown>).items)) {
    throw new Error('GitHub Search: invalid response')
  }
  const rows = (payload as { items: unknown[] }).items.map(parseRepository)
  if (rows.some(row => row === undefined)) throw new Error('GitHub Search: invalid repository')
  return rows as TrendingRepository[]
}

/**
 * Return one non-cacheable public feed through an authenticated DSH route.
 * @param kind - fixed upstream selection, never derived from browser input.
 * @param request - browser request with a cancellation signal.
 * @param fetcher - Host transport or test transport.
 * @param options - validated lookup settings.
 * @param lifetime - signal aborted when the plugin unloads.
 * @returns parsed feed data or a source-local 502.
 */
export async function handleFeed(
  kind: 'tibo' | 'github', request: Request, fetcher: typeof fetch,
  options: { githubDays: number; githubCount: number; requestTimeoutMs: number }, lifetime: AbortSignal,
): Promise<Response> {
  const signal = AbortSignal.any([request.signal, lifetime, AbortSignal.timeout(options.requestTimeoutMs)])
  try {
    const result = kind === 'tibo' ? await loadTibo(fetcher, signal)
      : await loadGithub(fetcher, options.githubDays, options.githubCount, new Date(), signal)
    signal.throwIfAborted()
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const timeout = signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
      || error instanceof TypeError && (error.cause as { code?: string } | undefined)?.code === 'UND_ERR_CONNECT_TIMEOUT'
    const issue = timeout ? 'timeout' : /HTTP (403|429)/.test(message) ? 'rateLimit'
      : message.includes('invalid') ? 'invalid' : error instanceof TypeError ? 'network' : 'upstream'
    return Response.json({ error: issue }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
