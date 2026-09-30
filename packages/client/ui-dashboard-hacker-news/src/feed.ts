/** Bounded Host-side reader for the public Hacker News API. */
import { parseStory, type HackerNewsStory } from './story.ts'

const API = 'https://hacker-news.firebaseio.com/v0'

/** Ranked usable articles and the number of failed item requests. */
export interface HackerNewsFeed {
  readonly stories: readonly HackerNewsStory[]
  readonly failedCount: number
}

/**
 * Read the current top items through the fixed public API origin.
 * @param fetcher - Host fetch or an injected test transport.
 * @param count - validated maximum number of top ids to read.
 * @param signal - request and plugin lifetime cancellation.
 * @returns visible stories in rank order, retaining partial results on item failures.
 */
export async function loadTopStories(fetcher: typeof fetch, count: number, signal: AbortSignal): Promise<HackerNewsFeed> {
  const response = await fetcher(`${API}/topstories.json`, { signal })
  if (!response.ok) throw new Error(`Hacker News top stories: HTTP ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload) || !payload.every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new Error('Hacker News top stories: invalid response')
  }
  const items = await Promise.allSettled(payload.slice(0, count).map(async (id: number) => {
    const itemResponse = await fetcher(`${API}/item/${id}.json`, { signal })
    if (!itemResponse.ok) throw new Error(`Hacker News story: HTTP ${itemResponse.status}`)
    return parseStory(await itemResponse.json())
  }))
  const failed = items.filter(item => item.status === 'rejected')
  if (items.length > 0 && failed.length === items.length) throw (failed[0] as PromiseRejectedResult).reason
  return {
    stories: items.flatMap(item => item.status === 'fulfilled' && item.value !== undefined ? [item.value] : []),
    failedCount: failed.length,
  }
}

/**
 * Convert upstream results into the authenticated browser route's response.
 * @param request - browser request carrying its cancellation signal.
 * @param fetcher - Host fetch transport.
 * @param count - validated number of top ids.
 * @param timeoutMs - validated upstream deadline.
 * @param lifetime - signal aborted when the plugin unloads.
 * @returns a non-cacheable story list or source failure.
 */
export async function handleFeed(
  request: Request, fetcher: typeof fetch, count: number, timeoutMs: number, lifetime: AbortSignal,
): Promise<Response> {
  const signal = AbortSignal.any([request.signal, lifetime, AbortSignal.timeout(timeoutMs)])
  try {
    const result = await loadTopStories(fetcher, count, signal)
    request.signal.throwIfAborted()
    lifetime.throwIfAborted()
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
