/** Local and Beszel metrics for the device card; missing sensors remain null. */
import { z } from 'zod'

const reading = z.number().nullable()
const capacity = z.object({ used: reading, total: reading, percent: reading })
const deviceSchema = z.object({
  id: z.string(), name: z.string(), status: z.string(), uptime: reading,
  cpuModel: z.string(), kernel: z.string(), sampledAt: z.string().nullable(),
  cpu: reading, cpuTemperature: reading, deviceTemperature: reading,
  memory: capacity, swap: capacity,
  disks: z.array(z.object({ name: z.string(), used: reading, total: reading, percent: reading })),
  gpus: z.array(z.object({ id: z.string(), name: z.string(), usage: reading, temperature: reading,
    power: reading, used: reading, total: reading, percent: reading })),
})

/** Validated, credential-free device measurements served by the Host. */
export type Device = z.infer<typeof deviceSchema>

/**
 * Decode the same-origin JSON response before publishing browser state.
 * @param value - untrusted JSON body.
 * @returns device array, or undefined for malformed data.
 */
export function parseDevices(value: unknown): Device[] | undefined {
  try { return z.array(deviceSchema).parse(value) } catch (error) {
    // Invalid wire data is represented by the card's localized error state.
    void error
    return undefined
  }
}

/**
 * Read a JSON object, rejecting arrays and scalars.
 * @param value - upstream JSON value.
 * @returns JSON member map.
 */
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
  return value as Record<string, unknown>
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function percent(used: number | null, total: number | null): number | null {
  return used !== null && total !== null && total > 0 ? used / total * 100 : null
}

function usage(value: Record<string, unknown>, usedKey: string, totalKey: string, percentValue?: unknown) {
  const used = number(value[usedKey])
  const total = number(value[totalKey])
  return { used, total, percent: number(percentValue) ?? percent(used, total) }
}

/**
 * Project Beszel system records and the newest one-minute sample.
 * @param system - upstream system JSON record.
 * @param sample - newest stats record, absent before the first sample.
 * @param details - hardware details record, absent on older hubs.
 * @param cpuSensor - explicit CPU sensor name, or automatic CPU-name matching.
 * @returns device display data; memory/disk use GiB and GPU memory is converted from MiB.
 */
export function projectDevice(
  system: Record<string, unknown>, sample: Record<string, unknown> | undefined,
  details: Record<string, unknown> | undefined, cpuSensor: string,
): Device {
  if (typeof system.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(system.id)
    || typeof system.name !== 'string' || typeof system.status !== 'string') throw new Error('invalid')
  const info = object(system.info ?? {})
  const stats = object(sample?.stats ?? {})
  const temperatures = object(stats.t ?? {})
  const cpuTemperatures = Object.entries(temperatures)
    .filter(([name]) => cpuSensor ? name === cpuSensor : /cpu|package|tctl|tdie/i.test(name))
    .map(([, value]) => number(value)).filter((value): value is number => value !== null)
  const disks = [{ name: typeof info.rdn === 'string' ? info.rdn : '/', ...usage(stats, 'du', 'd', info.dp) }]
  for (const [name, value] of Object.entries(object(stats.efs ?? {}))) {
    disks.push({ name, ...usage(object(value), 'du', 'd', object(info.efs ?? {})[name]) })
  }
  const gpus = Object.entries(object(stats.g ?? {})).map(([id, value]) => {
    const gpu = object(value)
    const used = number(gpu.mu)
    const total = number(gpu.mt)
    const name = typeof gpu.n === 'string' ? gpu.n : id
    return { id, name, usage: number(gpu.u), power: number(gpu.p),
      temperature: number(temperatures[name]),
      used: used === null ? null : used / 1024, total: total === null ? null : total / 1024,
      percent: percent(used, total) }
  })
  return {
    id: system.id, name: system.name, status: system.status, uptime: number(info.u),
    cpuModel: typeof details?.cpu === 'string' ? details.cpu : typeof info.m === 'string' ? info.m : '',
    kernel: typeof details?.kernel === 'string' ? details.kernel : typeof info.k === 'string' ? info.k : '',
    sampledAt: typeof sample?.created === 'string' ? sample.created : null,
    cpu: number(info.cpu), cpuTemperature: cpuTemperatures.length ? Math.max(...cpuTemperatures) : null,
    deviceTemperature: number(info.dt), memory: usage(stats, 'mu', 'm', info.mp), swap: usage(stats, 'su', 's'),
    disks, gpus,
  }
}
