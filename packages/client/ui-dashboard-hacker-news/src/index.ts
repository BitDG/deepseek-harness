/** Host-owned public feed route for the optional Hacker News card. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import z from '@deepseek-ai/schemastery'
import { handleFeed } from './feed.ts'
import { HACKER_NEWS_PATH } from './route.ts'

/** Host service needed for an authenticated same-origin feed route. */
export const inject = ['connection']

/** Validated feed size and upstream deadline. */
export interface Config {
  /** Number of top ids read for this card, from 1 to 20; default 8. */
  storyCount?: number
  /** Upstream fetch deadline in milliseconds, from 1000 to 60000; default 12000. */
  requestTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  storyCount: z.number().step(1).min(1).max(20).default(8),
  requestTimeoutMs: z.number().step(1).min(1000).max(60_000).default(12_000),
})

/**
 * Register a feed route that shares Connection's browser authentication.
 * @param ctx - Host context carrying the Connection route registry.
 * @param config - schema-resolved request limits.
 */
export function apply(ctx: Context, config: Config): void {
  const lifetime = new AbortController()
  const pending = new Set<Promise<Response>>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled([...pending])
  }, 'dashboard-hacker-news: requests')
  ctx.connection.fetch.register({
    path: HACKER_NEWS_PATH, methods: ['GET'], requestBody: 'buffered',
    fetch: (request) => {
      const task = handleFeed(request, fetch, config.storyCount as number, config.requestTimeoutMs as number, lifetime.signal)
      pending.add(task)
      void task.then(() => { pending.delete(task) }, () => { pending.delete(task) })
      return task
    },
  })
}
