/** Read resources from the machine running the DSH Host. */
import { hostname, uptime, release, platform } from 'node:os'
import si from 'systeminformation'
import type { Device } from './model.ts'
import { windowsCpuTemperature } from './windows-cpu.ts'

function reading(value: number | undefined | null): number | null {
  return value !== undefined && value !== null && Number.isFinite(value) && value >= 0 ? value : null
}
function gib(value: number | undefined): number | null {
  const number = reading(value)
  return number === null ? null : number / 1024 ** 3
}
function percent(used: number | null, total: number | null): number | null {
  return used !== null && total !== null && total > 0 ? used / total * 100 : null
}
function result<T>(value: PromiseSettledResult<T>): T | undefined {
  return value.status === 'fulfilled' ? value.value : undefined
}

/**
 * Sample local hardware; unavailable collectors leave their readings empty.
 * @param signal - request/plugin cancellation, awaited after collectors settle.
 * @param timeoutMs - Windows CPU sensor query deadline.
 * @returns one local device with GiB capacities and actual supported temperatures.
 */
export async function loadLocalDevice(signal: AbortSignal, timeoutMs: number): Promise<Device[]> {
  signal.throwIfAborted()
  const [cpuResult, loadResult, memoryResult, disksResult, gpuResult, temperatureResult] = await Promise.allSettled([
    si.cpu(), si.currentLoad(), si.mem(), si.fsSize(), si.graphics(),
    platform() === 'win32' ? windowsCpuTemperature(signal, timeoutMs) : si.cpuTemperature().then(value => reading(value.main)),
  ])
  signal.throwIfAborted()
  const cpu = result(cpuResult)
  const memory = result(memoryResult)
  const used = gib(memory?.active)
  const total = gib(memory?.total)
  const swapUsed = gib(memory?.swapused)
  const swapTotal = gib(memory?.swaptotal)
  return [{
    id: 'local', name: hostname(), status: 'up', uptime: uptime(), sampledAt: new Date().toISOString(),
    cpuModel: cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : '', kernel: `${platform()} ${release()}`,
    cpu: reading(result(loadResult)?.currentLoad), cpuTemperature: result(temperatureResult) ?? null,
    deviceTemperature: null,
    memory: { used, total, percent: percent(used, total) },
    swap: { used: swapUsed, total: swapTotal, percent: percent(swapUsed, swapTotal) },
    disks: (result(disksResult) ?? []).map(disk => ({
      name: disk.mount || disk.fs, used: gib(disk.used), total: gib(disk.size), percent: reading(disk.use),
    })),
    gpus: (result(gpuResult)?.controllers ?? []).filter(gpu => !/virtual display adapter/i.test(gpu.model)).map((gpu, index) => {
      const memoryUsed = reading(gpu.memoryUsed)
      const memoryTotal = reading(gpu.memoryTotal) ?? (gpu.vramDynamic ? null : reading(gpu.vram))
      return {
        id: String(index), name: gpu.model, usage: reading(gpu.utilizationGpu),
        used: memoryUsed === null ? null : memoryUsed / 1024,
        total: memoryTotal === null ? null : memoryTotal / 1024, percent: percent(memoryUsed, memoryTotal),
        temperature: reading(gpu.temperatureGpu), power: reading(gpu.powerDraw),
      }
    }),
  }]
}

/**
 * Serve a local sample through the existing authenticated dashboard route.
 * @param request - browser request carrying cancellation.
 * @param lifetime - plugin lifetime signal.
 * @param timeoutMs - Windows CPU sensor query deadline.
 * @returns local readings or a sanitized collector failure.
 */
export async function handleLocalDevice(request: Request, lifetime: AbortSignal, timeoutMs: number): Promise<Response> {
  const headers = { 'cache-control': 'no-store' }
  try {
    const signal = AbortSignal.any([request.signal, lifetime])
    return Response.json(await loadLocalDevice(signal, timeoutMs), { headers })
  } catch (error) {
    // Local diagnostics and process errors do not enter browser responses.
    void error
    return Response.json({ error: 'upstream' }, { status: 503, headers })
  }
}
