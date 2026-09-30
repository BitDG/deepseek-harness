/** Local collectors use actual capacity units and retain unavailable readings. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import si from 'systeminformation'
import { windowsCpuTemperature } from '../src/windows-cpu.ts'
import { loadLocalDevice } from '../src/local.ts'

vi.mock('systeminformation', () => ({ default: {
  cpu: vi.fn(), currentLoad: vi.fn(), mem: vi.fn(), fsSize: vi.fn(), graphics: vi.fn(), cpuTemperature: vi.fn(),
} }))
vi.mock('../src/windows-cpu.ts', () => ({ windowsCpuTemperature: vi.fn() }))

beforeEach(() => {
  vi.mocked(si.cpu).mockResolvedValue({ manufacturer: 'AMD', brand: 'Ryzen' } as Awaited<ReturnType<typeof si.cpu>>)
  vi.mocked(si.currentLoad).mockResolvedValue({ currentLoad: 23 } as Awaited<ReturnType<typeof si.currentLoad>>)
  vi.mocked(si.mem).mockResolvedValue({ active: 32 * 1024 ** 3, total: 64 * 1024 ** 3, swapused: 0, swaptotal: 0 } as Awaited<ReturnType<typeof si.mem>>)
  vi.mocked(si.fsSize).mockResolvedValue([{ mount: 'F:', size: 1024 ** 4, used: 256 * 1024 ** 3, use: 25 }] as Awaited<ReturnType<typeof si.fsSize>>)
  vi.mocked(si.graphics).mockResolvedValue({ controllers: [{ model: 'GPU', memoryUsed: 4096, memoryTotal: 16384, utilizationGpu: 30, temperatureGpu: 49 }] } as Awaited<ReturnType<typeof si.graphics>>)
  vi.mocked(si.cpuTemperature).mockResolvedValue({ main: 61 } as Awaited<ReturnType<typeof si.cpuTemperature>>)
  vi.mocked(windowsCpuTemperature).mockResolvedValue(61)
})

describe('local device collection', () => {
  it('projects Host hardware with byte RAM/disks and MiB VRAM', async () => {
    const [device] = await loadLocalDevice(new AbortController().signal, 12000)
    expect(device).toMatchObject({ id: 'local', status: 'up', cpuTemperature: 61,
      memory: { used: 32, total: 64, percent: 50 },
      disks: [{ name: 'F:', used: 256, total: 1024 }],
      gpus: [{ used: 4, total: 16, percent: 25, temperature: 49 }] })
  })
  it('keeps other readings when one collector is unavailable, without inventing a temperature', async () => {
    vi.mocked(si.graphics).mockRejectedValue(new Error('No graphics collector'))
    vi.mocked(si.cpuTemperature).mockResolvedValue({ main: -1 } as Awaited<ReturnType<typeof si.cpuTemperature>>)
    vi.mocked(windowsCpuTemperature).mockResolvedValue(null)
    const [device] = await loadLocalDevice(new AbortController().signal, 12000)
    expect(device?.cpuTemperature).toBeNull()
    expect(device?.gpus).toEqual([])
    expect(device?.memory.total).toBe(64)
    const lifetime = new AbortController()
    lifetime.abort()
    await expect(loadLocalDevice(lifetime.signal, 12000)).rejects.toThrow()
  })
})
