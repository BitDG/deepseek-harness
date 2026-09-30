/** Authenticated Host routes for the optional community-inspired dashboard cards. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import z from '@deepseek-ai/schemastery'
import { handleFeed } from './feed.ts'
import { GITHUB_PATH, TIBO_PATH } from './route.ts'

/** Host Connection is required to keep these public feeds behind Web authentication. */
export const inject = ['connection']

/** Bounds for the rolling GitHub search and external request deadline. */
export interface Config {
  /** Days since repository creation, from 1 to 30; default 7. */
  githubDays?: number
  /** Maximum displayed repositories, from 1 to 20; default 8. */
  githubCount?: number
  /** Request deadline in milliseconds, from 1000 to 60000; default 12000. */
  requestTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  githubDays: z.number().step(1).min(1).max(30).default(7),
  githubCount: z.number().step(1).min(1).max(20).default(8),
  requestTimeoutMs: z.number().step(1).min(1000).max(60_000).default(12_000),
})

/**
 * Register fixed-origin feeds and await outstanding requests on unload.
 * @param ctx - Host context carrying the authenticated Connection registry.
 * @param config - schema-resolved lookup limits.
 */
export function apply(ctx: Context, config: Config): void {
  const lifetime = new AbortController()
  const pending = new Set<Promise<Response>>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled([...pending])
  }, 'dashboard-community: requests')
  for (const [path, kind] of [[TIBO_PATH, 'tibo'], [GITHUB_PATH, 'github']] as const) {
    ctx.connection.fetch.register({
      path, methods: ['GET'], requestBody: 'buffered',
      fetch: (request) => {
        const task = handleFeed(kind, request, fetch, {
          githubDays: config.githubDays as number,
          githubCount: config.githubCount as number,
          requestTimeoutMs: config.requestTimeoutMs as number,
        }, lifetime.signal)
        pending.add(task)
        void task.then(() => { pending.delete(task) }, () => { pending.delete(task) })
        return task
      },
    })
  }
}
