/** Authenticated local and Beszel device feed for the optional dashboard. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import z from '@deepseek-ai/schemastery'
import { handleDevices, type BeszelOptions } from './feed.ts'
import { handleLocalDevice } from './local.ts'
import { DEVICES_PATH } from './route.ts'

/** Host routes require the authenticated Connection registry. */
export const inject = ['connection']

/** Beszel connection and sampling options. Empty connection fields read the local Host. */
export interface Config {
  /** HTTP(S) Beszel Hub URL; default empty. */
  baseUrl?: string
  /** User API token; default empty, preferred over email/password. */
  apiToken?: string
  /** Beszel email; default empty. */
  email?: string
  /** Beszel password; default empty. */
  password?: string
  /** Remote fetch and Windows CPU query deadline, 1000–60000 ms; default 12000. */
  requestTimeoutMs?: number
  /** Maximum systems displayed, 1–50; default 12. */
  systemCount?: number
  /** Exact CPU temperature sensor; default empty selects CPU/package/Tctl/Tdie names. */
  cpuTemperatureSensor?: string
}

/** Loader validation and explicit defaults for the Host integration. */
export const Config: z<Config> = z.object({
  baseUrl: z.string().default(''), apiToken: z.string().default(''),
  email: z.string().default(''), password: z.string().default(''),
  requestTimeoutMs: z.number().step(1).min(1000).max(60_000).default(12_000),
  systemCount: z.number().step(1).min(1).max(50).default(12),
  cpuTemperatureSensor: z.string().default(''),
})

/**
 * Validate connection settings and register a cancellable authenticated device feed.
 * @param ctx - Host context.
 * @param config - schema-resolved integration settings.
 */
export function apply(ctx: Context, config: Config): void {
  const options = Config(config) as BeszelOptions
  if (options.baseUrl) {
    const url = new URL(options.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Beszel baseUrl must be an HTTP(S) URL without credentials, query or fragment')
    }
    if (!options.apiToken && (!options.email || !options.password)) throw new Error('Beszel requires apiToken or email/password')
  } else if (options.apiToken || options.email || options.password) throw new Error('Beszel credentials require baseUrl')
  const lifetime = new AbortController()
  const pending = new Set<Promise<Response>>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled([...pending])
  }, 'dashboard-devices: requests')
  ctx.connection.fetch.register({
    path: DEVICES_PATH, methods: ['GET'], requestBody: 'buffered',
    fetch: request => {
      const task = options.baseUrl ? handleDevices(request, options, fetch, lifetime.signal)
        : handleLocalDevice(request, lifetime.signal, options.requestTimeoutMs)
      pending.add(task)
      void task.then(() => { pending.delete(task) }, () => { pending.delete(task) })
      return task
    },
  })
}
