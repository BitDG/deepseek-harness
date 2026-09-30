/** Host-only Beszel authentication and bounded collection reads. */
import { object, projectDevice, type Device } from './model.ts'

/** Resolved Host connection options; credentials never enter the browser bundle. */
export interface BeszelOptions {
  /** HTTP(S) Hub URL, empty when the integration is unconfigured. */
  baseUrl: string
  /** Existing user API token; takes precedence over password authentication. */
  apiToken: string
  /** Beszel user identity for password authentication. */
  email: string
  /** Beszel password for password authentication. */
  password: string
  /** Maximum total request duration in milliseconds. */
  requestTimeoutMs: number
  /** Maximum displayed systems. */
  systemCount: number
  /** Optional exact CPU temperature sensor key. */
  cpuTemperatureSensor: string
}

class SourceError extends Error {
  constructor(readonly issue: 'auth' | 'rateLimit' | 'upstream' | 'invalid') { super(issue) }
}

async function json(fetcher: typeof fetch, url: URL, signal: AbortSignal, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { ...init, signal, redirect: 'error' })
  if (!response.ok) throw new SourceError(response.status === 401 || response.status === 403 ? 'auth'
    : response.status === 429 ? 'rateLimit' : 'upstream')
  return object(await response.json())
}

async function records(
  fetcher: typeof fetch, base: string, collection: string, token: string, signal: AbortSignal,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${base}/api/collections/${collection}/records`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const payload = await json(fetcher, url, signal, { headers: { Authorization: `Bearer ${token}` } })
  if (!Array.isArray(payload.items)) throw new SourceError('invalid')
  return payload.items.map(object)
}

/**
 * Read systems, latest one-minute stats and hardware metadata with one cancellation deadline.
 * @param options - validated Host-only connection settings.
 * @param fetcher - Host HTTP transport.
 * @param signal - request, timeout and plugin cancellation.
 * @returns credential-free display measurements.
 */
export async function loadDevices(options: BeszelOptions, fetcher: typeof fetch, signal: AbortSignal): Promise<Device[]> {
  const base = options.baseUrl.replace(/\/$/, '')
  let token = options.apiToken
  if (!token) {
    const auth = await json(fetcher, new URL(`${base}/api/collections/users/auth-with-password`), signal, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: options.email, password: options.password }),
    })
    if (typeof auth.token !== 'string' || !auth.token) throw new SourceError('invalid')
    token = auth.token
  }
  const systems = await records(fetcher, base, 'systems', token, signal,
    { page: '1', perPage: String(options.systemCount), sort: 'name' })
  const devices: Device[] = []
  // Sequential reads bound fan-out; the deadline covers the whole card, including authentication.
  for (const system of systems) {
    if (typeof system.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(system.id)) throw new SourceError('invalid')
    const samples = await records(fetcher, base, 'system_stats', token, signal,
      { page: '1', perPage: '1', sort: '-created', filter: `type='1m'&&system='${system.id}'` })
    const device = projectDevice(system, samples[0], undefined, options.cpuTemperatureSensor)
    // Older hubs include model/kernel in info; current hubs move them to system_details.
    if (!device.cpuModel || !device.kernel) {
      const details = await records(fetcher, base, 'system_details', token, signal,
        { page: '1', perPage: '1', filter: `system='${system.id}'` })
      devices.push(projectDevice(system, samples[0], details[0], options.cpuTemperatureSensor))
    } else devices.push(device)
  }
  signal.throwIfAborted()
  return devices
}

/**
 * Serve device readings through DSH authentication with sanitized source errors.
 * @param request - browser request.
 * @param options - Host connection settings.
 * @param fetcher - Host HTTP transport.
 * @param lifetime - aborted on plugin unload.
 * @returns devices or a safe, non-cacheable error response.
 */
export async function handleDevices(
  request: Request, options: BeszelOptions, fetcher: typeof fetch, lifetime: AbortSignal,
): Promise<Response> {
  const headers = { 'cache-control': 'no-store' }
  if (!options.baseUrl) return Response.json({ error: 'unconfigured' }, { status: 503, headers })
  const signal = AbortSignal.any([request.signal, lifetime, AbortSignal.timeout(options.requestTimeoutMs)])
  try { return Response.json(await loadDevices(options, fetcher, signal), { headers }) } catch (error) {
    const issue = signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError' ? 'timeout'
      : error instanceof SourceError ? error.issue : error instanceof TypeError ? 'network' : 'invalid'
    return Response.json({ error: issue }, { status: 502, headers })
  }
}
