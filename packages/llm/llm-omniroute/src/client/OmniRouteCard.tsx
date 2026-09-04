/** OmniRoute lifecycle and onboarding card in the Models page footer. */

import { useCallback, useEffect, useState, type JSX } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { OmniRouteConnectValue, OmniRouteStatus, OmniRouteStopValue } from '../types.ts'
import type { OmniRouteKey } from './locales.ts'

const CARD_CSS = `
.dsh-omniroute-card { box-sizing: border-box; margin-top: 8px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-l1); color: var(--dsw-alias-label-primary); }
.dsh-omniroute-head { display: flex; align-items: flex-start; gap: 12px; }
.dsh-omniroute-identity { min-width: 0; flex: 1; }
.dsh-omniroute-title { margin: 0; font-size: 14px; line-height: 22px; font-weight: 600; }
.dsh-omniroute-description, .dsh-omniroute-status, .dsh-omniroute-message, .dsh-omniroute-install { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-omniroute-status { color: var(--dsw-alias-label-secondary); }
.dsh-omniroute-message { color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dsh-omniroute-install code { user-select: all; }
.dsh-omniroute-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.dsh-omniroute-primary, .dsh-omniroute-secondary { box-sizing: border-box; height: 32px; padding: 0 12px; border-radius: 16px; font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.dsh-omniroute-primary { border: none; color: var(--dsw-alias-label-primary-foreground); background: var(--dsw-alias-button-primary-fill); }
.dsh-omniroute-secondary { border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-omniroute-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-omniroute-secondary:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid); }
.dsh-omniroute-primary:disabled, .dsh-omniroute-secondary:disabled { cursor: default; opacity: 0.4; }
.dsh-omniroute-primary:focus-visible, .dsh-omniroute-secondary:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }
@media (max-width: 720px) { .dsh-omniroute-head { flex-direction: column; } .dsh-omniroute-actions { justify-content: flex-start; } }
`

/** Host calls used by the card. */
export interface OmniRouteOperations {
  /** Inspect without mutation. */
  status(signal?: AbortSignal): Promise<RemoteResult<OmniRouteStatus>>
  /** Start/adopt and connect models. */
  startAndConnect(signal?: AbortSignal): Promise<RemoteResult<OmniRouteConnectValue>>
  /** Stop only the plugin-owned service. */
  stop(signal?: AbortSignal): Promise<RemoteResult<OmniRouteStopValue>>
}

/** Dependencies bound by the client plugin. */
export interface OmniRouteCardInjected {
  /** Remote operations. */
  operations: OmniRouteOperations
  /** Plugin-owned translation function. */
  t: (key: OmniRouteKey, params?: Record<string, string | number>) => string
}

function phaseKey(phase: OmniRouteStatus['phase']): OmniRouteKey {
  return phase
}

/** Render current lifecycle state and explicit user actions. */
export function OmniRouteCard({ operations, t }: OmniRouteCardInjected): JSX.Element {
  const [status, setStatus] = useState<OmniRouteStatus | undefined>()
  const [busy, setBusy] = useState<'start' | 'stop' | undefined>()
  const [error, setError] = useState<string | undefined>()

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const response = await operations.status(signal)
    if (signal?.aborted) return
    if (response.ok) {
      setStatus(response.value)
      setError(undefined)
    } else {
      setError(response.error.message)
    }
  }, [operations])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const start = async (): Promise<void> => {
    setBusy('start')
    setError(undefined)
    const response = await operations.startAndConnect()
    if (response.ok) setStatus(response.value)
    else setError(response.error.message)
    setBusy(undefined)
  }

  const stop = async (): Promise<void> => {
    setBusy('stop')
    setError(undefined)
    const response = await operations.stop()
    if (response.ok) setStatus(response.value)
    else setError(response.error.message)
    setBusy(undefined)
  }

  const phase = busy === 'start' ? 'starting' : status?.phase
  const needsStartOrConnect = status !== undefined
    && phase !== 'unavailable'
    && ((phase !== 'managed' && phase !== 'external') || ! status.connected)
  const showStart = status !== undefined && (phase === 'unavailable' || needsStartOrConnect)
  const canStart = busy === undefined && needsStartOrConnect
  const startLabel = phase === 'failed' ? t('retry') : t('start')

  return <section className="dsh-omniroute-card" aria-label={t('title')}>
    <style>{CARD_CSS}</style>
    <div className="dsh-omniroute-head">
      <div className="dsh-omniroute-identity">
        <h3 className="dsh-omniroute-title">{t('title')}</h3>
        <p className="dsh-omniroute-description">{t('description')}</p>
        {phase === undefined ? null : <p className="dsh-omniroute-status">{t(phaseKey(phase))}</p>}
        {status?.connected === true && status.modelCount !== undefined
          ? <p className="dsh-omniroute-status">{t('connected', { count: status.modelCount })}</p>
          : null}
        {status?.phase === 'unavailable' ? <p className="dsh-omniroute-install"><code>{t('install')}</code></p> : null}
        {error === undefined && status?.message === undefined
          ? null
          : <p className="dsh-omniroute-message" role="alert">{error ?? status?.message}</p>}
      </div>
      <div className="dsh-omniroute-actions">
        {status?.phase === 'managed' || status?.phase === 'external'
          ? <button
            className="dsh-omniroute-secondary"
            type="button"
            onClick={() => { window.open(status.dashboardURL, '_blank', 'noopener,noreferrer') }}
          >{t('open')}</button>
          : null}
        {status?.phase === 'managed'
          ? <button className="dsh-omniroute-secondary" type="button" disabled={busy !== undefined} onClick={() => { void stop() }}>
            {busy === 'stop' ? t('stopping') : t('stop')}
          </button>
          : null}
        {showStart
          ? <button className="dsh-omniroute-primary" type="button" disabled={!canStart} onClick={() => { void start() }}>
            {busy === 'start' ? t('starting') : startLabel}
          </button>
          : null}
      </div>
    </div>
  </section>
}
