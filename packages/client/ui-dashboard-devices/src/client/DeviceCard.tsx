/** Beszel-style resource bars and per-device hardware readings. */
import { useEffect, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Device } from '../model.ts'
import type { DeviceSnapshot } from './source.ts'
import css from './DeviceCard.module.css'

/** Device feed hook and refresh action bound by the renderer. */
export interface DeviceInjected {
  readonly hooks: { devices: HostObservable<DeviceSnapshot> }
  readonly refresh: () => void
}

type Props = PropsRuntime<'dashboard.card'> & PropsLocale<'dashboard.devices'> & InjectFace<DeviceInjected>

function capacity(value: number | null, t: Props['t']): string {
  if (value === null) return t('missing')
  if (value >= 1024) return t('tib', { value: (value / 1024).toFixed(1) })
  if (value < 1) return t('mib', { value: (value * 1024).toFixed(1) })
  return t('gib', { value: value.toFixed(1) })
}

function Metric({ label, percent, used, total, t }: {
  label: string; percent: number | null; used?: number | null; total?: number | null; t: Props['t']
}): ReactNode {
  return <div className={css.metric}>
    <div className={css.metricHead}><span>{label}</span><strong>{percent === null ? t('missing') : `${percent.toFixed(1)}%`}</strong></div>
    {percent === null ? <div className={css.track} /> : <progress className={css.bar} max={100}
      value={Math.min(100, percent)} aria-label={label} data-warning={percent >= 85} />}
    {used !== undefined ? <small>{capacity(used, t)} / {capacity(total ?? null, t)}</small> : null}
  </div>
}

function System({ device, t }: { device: Device; t: Props['t'] }): ReactNode {
  const missing = t('missing')
  const status = device.status === 'up' ? 'online' : device.status === 'down' ? 'offline'
    : device.status === 'pending' ? 'pending' : device.status === 'paused' ? 'paused' : 'unknown'
  const temperature = (value: number | null) => value === null ? missing : `${value.toFixed(1)} °C`
  return <article className={css.system}>
    <header className={css.systemHead}>
      <div><h3>{device.name}</h3><p>{device.uptime === null ? missing : t('uptime', { days: (device.uptime / 86400).toFixed(1) })}</p></div>
      <span className={css.badge} data-online={device.status === 'up'}>{t(status)}</span>
    </header>
    {device.status !== 'up' ? <p className={css.hint}>{t('historical')}</p> : null}
    <div className={css.resources}>
      <Metric label={t('cpu')} percent={device.cpu} t={t} />
      <Metric label={t('memory')} {...device.memory} t={t} />
      <Metric label={t('storage')} percent={device.disks[0]?.percent ?? null}
        used={device.disks[0]?.used ?? null} total={device.disks[0]?.total ?? null} t={t} />
    </div>
    <div className={css.temperatures}>
      <span data-hot={device.cpuTemperature !== null && device.cpuTemperature >= 80}>
        {t('cpuTemperature')} <strong>{temperature(device.cpuTemperature)}</strong></span>
      <span>{t('deviceTemperature')} <strong>{temperature(device.deviceTemperature)}</strong></span>
    </div>
    {device.cpuTemperature === null ? <p className={css.hint}>{t('cpuSensorUnavailable')}</p> : null}
    <details className={css.details}>
      <summary>{t('details')}</summary>
      <dl><dt>{t('cpuModel')}</dt><dd>{device.cpuModel || missing}</dd>
        <dt>{t('kernel')}</dt><dd>{device.kernel || missing}</dd>
        <dt>{t('sample')}</dt><dd>{device.sampledAt ?? t('noSample')}</dd></dl>
      <div className={css.diskList}>
        {device.disks.map(disk => <Metric key={disk.name} label={disk.name} {...disk} t={t} />)}
        {device.swap.total !== null && device.swap.total > 0 ? <Metric label={t('swap')} {...device.swap} t={t} /> : null}
      </div>
    </details>
    <div className={css.gpus}>
      {device.gpus.length === 0 ? <p className={css.hint}>{t('noGpu')}</p> : device.gpus.map(gpu => <div key={gpu.id} className={css.gpu}>
        <h4>{gpu.name}</h4>
        <div className={css.gpuResources}><Metric label={t('gpu')} percent={gpu.usage} t={t} />
          <Metric label={t('vram')} used={gpu.used} total={gpu.total} percent={gpu.percent} t={t} /></div>
        <div className={css.temperatures}><span>{t('gpuTemperature')} <strong>{temperature(gpu.temperature)}</strong></span>
          <span>{t('power')} <strong>{gpu.power === null ? missing : t('watts', { value: gpu.power.toFixed(1) })}</strong></span></div>
      </div>)}
    </div>
  </article>
}

/** Render device readings, setup state and retained-data failures. */
export function DeviceCard({ useDevices, refresh, t }: Props): ReactNode {
  const state = useDevices(snapshot => snapshot)
  useEffect(() => { refresh() }, [refresh])
  return <section className={css.card} data-dashboard-card="devices" aria-label={t('title')}>
    <header className={css.head}><div><h2>{t('title')}</h2><p>{t('description')}</p></div>
      <button type="button" onClick={refresh} disabled={state.loading}>{t('refresh')}</button></header>
    {state.issue ? <p className={css.issue} role="alert">{t(state.issue)} {state.devices ? t('retained') : ''}</p> : null}
    {state.devices === null && !state.issue ? <p className={css.hint} role="status">{t('loading')}</p> : null}
    {state.devices?.length === 0 ? <p className={css.hint}>{t('empty')}</p> : null}
    <div className={css.systems}>{state.devices?.map(device => <System key={device.id} device={device} t={t} />)}</div>
    <footer className={css.footer}><a href="https://github.com/glanceapp/community-widgets/blob/main/widgets/beszel-server-stats/README.md"
      target="_blank" rel="noopener noreferrer">{t('source')}</a>
      {state.updatedAt ? <span>{t('updated', { time: new Date(state.updatedAt).toLocaleTimeString() })}</span> : null}</footer>
  </section>
}
