/** Hacker News item fields accepted by the Host and browser halves. */

/** One validated story shown in the card. */
export interface HackerNewsStory {
  readonly id: number
  readonly title: string
  readonly url: string
  readonly commentsUrl: string
  readonly score: number
  readonly comments: number
}

/** Accept a safe public story link or fall back to its Hacker News discussion. */
function storyUrl(value: unknown, id: number): string {
  if (typeof value === 'string') {
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
    } catch (_error) {
      // The wire field is an invalid URL; use the known discussion URL.
    }
  }
  return `https://news.ycombinator.com/item?id=${id}`
}

/**
 * Decode only the fields this card displays from an untrusted API or Host response.
 * @param value - one Hacker News item or the Host's serialized story.
 * @returns a visible story, or undefined for a missing or hidden item.
 */
export function parseStory(value: unknown): HackerNewsStory | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (!Number.isSafeInteger(item.id) || (item.id as number) <= 0 || typeof item.title !== 'string'
    || item.title.length === 0 || item.deleted === true || item.dead === true) return undefined
  const id = item.id as number
  const comments = item.descendants ?? item.comments
  return {
    id,
    title: item.title,
    url: storyUrl(item.url, id),
    commentsUrl: `https://news.ycombinator.com/item?id=${id}`,
    score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0,
    comments: typeof comments === 'number' && Number.isFinite(comments) ? comments : 0,
  }
}
