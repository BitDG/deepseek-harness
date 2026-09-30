import { describe, expect, it, vi } from 'vitest'
import { handleDevices, loadDevices, type BeszelOptions } from '../src/feed.ts'
import { Config } from '../src/index.ts'
import { parseDevices, projectDevice } from '../src/model.ts'

const options: BeszelOptions = {
  baseUrl: 'http://beszel.local', apiToken: 'test-token', email: '', password: '',
  requestTimeoutMs: 1000, systemCount: 12, cpuTemperatureSensor: '',
}
const system = { id: 'server1', name: 'Workstation', status: 'up',
  info: { u: 172800, cpu: 23.5, mp: 50, dp: 25, dt: 38 } }
const sample = { created: '2026-09-30 10:00:00.000Z', stats: {
  m: 64, mu: 32, d: 1024, du: 256, s: 8, su: 2,
  t: { 'CPU Package': 61, 'NVIDIA RTX 4080 SUPER': 49, nvme: 38 },
  efs: { 'F:': { d: 2048, du: 100 } },
  g: { '0': { n: 'NVIDIA RTX 4080 SUPER', u: 30, mu: 4096, mt: 16384, p: 80 } },
} }

describe('Beszel devices', () => {
  it('projects CPU sensors, each disk, swap and MiB GPU memory without inventing missing readings', () => {
    const device = projectDevice(system, sample, { cpu: 'Ryzen', kernel: 'Windows' }, '')
    expect(device).toMatchObject({ cpuTemperature: 61, deviceTemperature: 38, cpuModel: 'Ryzen',
      memory: { used: 32, total: 64, percent: 50 }, swap: { percent: 25 },
      gpus: [{ used: 4, total: 16, percent: 25, temperature: 49 }] })
    expect(device.disks).toHaveLength(2)
    expect(parseDevices([device])).toEqual([device])
    expect(projectDevice(system, undefined, undefined, '').cpuTemperature).toBeNull()
    expect(projectDevice(system, sample, undefined, 'nvme').cpuTemperature).toBe(38)
    expect(parseDevices([{ name: 'bad' }])).toBeUndefined()
  })

  it('authenticates on the Host and reads latest one-minute records and current hardware details', async () => {
    const requests: URL[] = []
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push(url)
      if (url.pathname.endsWith('auth-with-password')) {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ identity: 'user', password: 'secret' })
        return Response.json({ token: 'private-token' })
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer private-token')
      expect(init?.redirect).toBe('error')
      return Response.json({ items: url.pathname.includes('system_stats') ? [sample]
        : url.pathname.includes('system_details') ? [{ cpu: 'Ryzen', kernel: 'Windows' }] : [system] })
    })
    const devices = await loadDevices({ ...options, apiToken: '', email: 'user', password: 'secret' }, fetcher, new AbortController().signal)
    expect(devices[0]?.cpuModel).toBe('Ryzen')
    expect(requests.find(url => url.pathname.includes('system_stats'))?.searchParams.get('filter')).toBe("type='1m'&&system='server1'")
    expect(JSON.stringify(devices)).not.toContain('private-token')
  })

  it('reports setup and authentication failures without private upstream text', async () => {
    const request = new Request('http://localhost/api/dashboard.devices')
    const fetcher = vi.fn(async () => new Response('secret diagnostic', { status: 401 }))
    const unconfigured = await handleDevices(request, { ...options, baseUrl: '' }, fetcher, new AbortController().signal)
    expect(await unconfigured.json()).toEqual({ error: 'unconfigured' })
    expect(fetcher).not.toHaveBeenCalled()
    const denied = await handleDevices(request, options, fetcher, new AbortController().signal)
    expect(await denied.json()).toEqual({ error: 'auth' })
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects invalid records and cancels every upstream request on unload', async () => {
    const request = new Request('http://localhost/api/dashboard.devices')
    const malformed = await handleDevices(request, options, vi.fn(async () => Response.json({ items: [{ ...system, id: "x'" }] })), new AbortController().signal)
    expect(await malformed.json()).toEqual({ error: 'invalid' })
    const lifetime = new AbortController()
    const fetcher: typeof fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(init.signal?.reason) }, { once: true })
    }))
    const pending = handleDevices(request, options, fetcher, lifetime.signal)
    lifetime.abort()
    expect((await pending).status).toBe(502)
    expect(Config({}).systemCount).toBe(12)
    expect(() => Config({ systemCount: 0 })).toThrow()
  })
})
