/** CPU sensors exposed by existing Windows hardware-monitor providers. */
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { z } from 'zod'

const sensors = z.array(z.object({ Name: z.string(), Identifier: z.string(), Value: z.number() }))
const command = "$ErrorActionPreference='Stop'; foreach($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) { try { $s=@(Get-CimInstance -Namespace $ns -ClassName Sensor -Filter \"SensorType='Temperature'\" | Where-Object { $_.Identifier -match '/(intel|amd)cpu/' -or $_.Name -match '^CPU' } | Select-Object Name,Identifier,Value); ConvertTo-Json -InputObject $s -Compress; break } catch { continue } }"

/**
 * Read CPU-labelled hardware sensors without interpreting ACPI case temperatures as CPU readings.
 * @param signal - cancels the owned PowerShell process.
 * @param timeoutMs - configured subprocess deadline.
 * @returns highest available CPU sensor in Celsius, or null when no provider publishes it.
 */
export async function windowsCpuTemperature(signal: AbortSignal, timeoutMs: number): Promise<number | null> {
  let finish: (value: string) => void = () => {}
  const output = new Promise<string>(resolve => { finish = resolve })
  const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true, timeout: timeoutMs, maxBuffer: 32_768, signal,
  }, (error, stdout) => { finish(error ? '' : stdout) })
  const closed = once(child, 'close').catch(error => {
    // Spawn failures have no usable sensor result; the callback settles output.
    void error
  })
  const stdout = await output
  await closed
  if (!stdout.trim()) return null
  try {
    const readings = sensors.parse(JSON.parse(stdout)).map(sensor => sensor.Value)
      .filter(value => Number.isFinite(value) && value > 0)
    return readings.length ? Math.max(...readings) : null
  } catch (error) {
    // External WMI output can be absent or malformed; missing sensors remain unavailable.
    void error
    return null
  }
}
