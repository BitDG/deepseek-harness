import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DshUpdateSnapshot, UpdateBlocker, UpdateInstallReceipt } from '@deepseek-ai/dsh-api-remotes/client'
import {
  Button, IconDownloadOutline16, IconRefreshOutline16, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpdateLocaleKey } from './locales.ts'
import css from './UpdateSection.module.css'

/** Registration-side operations and locale observation used by the update page. */
export interface UpdateSectionInjected {
  /** Read release and checkout state; force bypasses the Host cache. */
  check: (force: boolean) => Promise<DshUpdateSnapshot>
  /** Fetch one exact offered tag without changing the worktree. */
  download: (tag: string) => Promise<DshUpdateSnapshot>
  /** Hand one downloaded target to the post-shutdown worker. */
  install: (tag: string) => Promise<UpdateInstallReceipt>
  /** Current UI locale, read again after a locale revision rerenders the entry. */
  language: () => string
}

/** Full component props assembled by the Settings slot renderer. */
export type UpdateSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.update'>
  & InjectFace<UpdateSectionInjected>

type Translate = UpdateSectionProps['t']
type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly snapshot: DshUpdateSnapshot }

const BLOCKER_KEYS = {
  'source-checkout-required': 'blockerSourceCheckout',
  'official-origin-required': 'blockerOfficialOrigin',
  'branch-required': 'blockerBranch',
  'clean-worktree-required': 'blockerClean',
  'download-required': 'blockerDownload',
  'fast-forward-required': 'blockerFastForward',
  'version-mismatch': 'blockerVersion',
  'install-in-progress': 'blockerPending',
} as const satisfies Record<UpdateBlocker, UpdateLocaleKey>

const PHASE_KEYS = {
  waiting: 'phaseWaiting',
  applying: 'phaseApplying',
  building: 'phaseBuilding',
  restarting: 'phaseRestarting',
  succeeded: 'phaseSucceeded',
  'rolled-back': 'phaseRolledBack',
  failed: 'phaseFailed',
} as const satisfies Record<NonNullable<DshUpdateSnapshot['lastOperation']>['phase'], UpdateLocaleKey>

function versionCopy(template: string, version: string): string {
  return template.replace('{version}', () => version)
}

/** Action blocker text, absent when the action has no target rather than a failed precondition. */
function blockerText(blocker: UpdateBlocker | undefined, t: Translate): string | undefined {
  return blocker === undefined ? undefined : t(BLOCKER_KEYS[blocker])
}

/** Render the DSH version comparison, exact download, and guarded install controls. */
export function UpdateSection({ check, download, install, language, t }: UpdateSectionProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [busy, setBusy] = useState<'download' | 'install' | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    void check(request > 0).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      (error: unknown) => {
        if (current) setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      },
    )
    return () => { current = false }
  }, [check, request])

  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])

  if (state.status === 'loading') {
    return (
      <section className={css.section} aria-busy="true">
        <h2>{t('title')}</h2>
        <p className={css.status}>{t('loading')}</p>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className={css.section}>
        <h2>{t('title')}</h2>
        <div className={css.failure} role="alert">
          <p>{t('loadFailed')}</p>
          <code>{state.message}</code>
          <Button variant="outline" onClick={() => { setRequest(value => value + 1) }}>{t('retry')}</Button>
        </div>
      </section>
    )
  }

  const snapshot = state.snapshot
  const targetTag = snapshot.targetTag
  const installBlocker = blockerText(snapshot.install.blocker, t)
  const downloadBlocker = blockerText(snapshot.download.blocker, t)
  const action = async (kind: 'download' | 'install'): Promise<void> => {
    if (targetTag === undefined || busy !== null) return
    setBusy(kind)
    setFailure(null)
    try {
      if (kind === 'download') {
        setState({ status: 'ready', snapshot: await download(targetTag) })
      } else {
        await install(targetTag)
        setConfirming(false)
        setRestarting(true)
      }
    } catch (error) {
      setFailure(t('actionFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(null)
    }
  }
  const chinese = language().toLowerCase().startsWith('zh')

  return (
    <section className={css.section} aria-busy={busy !== null} data-update-section="true">
      <header className={css.header}>
        <div>
          <h2>{t('title')}</h2>
          <p>{t('intro')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconRefreshOutline16 size={14} />}
          disabled={busy !== null || restarting}
          onClick={() => { setRequest(value => value + 1) }}
        >
          {t('refresh')}
        </Button>
      </header>

      <div className={css.versionCard} data-update-status={snapshot.status}>
        <div className={css.versionStop}>
          <span>{t('current')}</span>
          <strong>v{snapshot.currentVersion}</strong>
          {snapshot.currentCommit === undefined ? null : <code>{snapshot.currentCommit.slice(0, 7)}</code>}
        </div>
        <div className={css.track} aria-hidden="true"><span /></div>
        <div className={css.versionStop} data-target="true">
          <span>{snapshot.status === 'up-to-date' ? t('latest') : t('available')}</span>
          <strong>{snapshot.targetVersion === undefined ? '—' : `v${snapshot.targetVersion}`}</strong>
          {snapshot.targetVersion === undefined ? null : (
            <em data-downloaded={snapshot.targetDownloaded ? 'true' : 'false'}>
              {t(snapshot.targetDownloaded ? 'downloaded' : 'notDownloaded')}
            </em>
          )}
        </div>
      </div>

      <div className={css.facts} aria-label={t('current')}>
        <span>{t(snapshot.installation === 'source-checkout' ? 'sourceCheckout' : 'packageInstall')}</span>
        <span data-risk={snapshot.dirty ? 'true' : undefined}>{t(snapshot.dirty ? 'dirty' : 'clean')}</span>
        {snapshot.branch === undefined ? null : <span>{t('branch', { branch: snapshot.branch })}</span>}
      </div>

      {snapshot.lastOperation === undefined ? null : (
        <div className={css.operation} data-phase={snapshot.lastOperation.phase}>
          <span>{t('lastOperation')}</span>
          <strong>{t(PHASE_KEYS[snapshot.lastOperation.phase])}</strong>
          {snapshot.lastOperation.error === undefined ? null : <code>{snapshot.lastOperation.error}</code>}
        </div>
      )}

      {restarting ? <p className={css.restarting} role="status">{t('restarting')}</p> : null}
      {failure === null ? null : <p className={css.failureText} role="alert">{failure}</p>}

      {snapshot.status === 'update-available' ? (
        <div className={css.actions}>
          <Button
            variant="outline"
            icon={<IconDownloadOutline16 size={15} />}
            disabled={!snapshot.download.allowed || busy !== null || restarting}
            onClick={() => { void action('download') }}
          >
            {t(busy === 'download' ? 'downloading' : 'download')}
          </Button>
          <Button
            variant="primary"
            disabled={!snapshot.install.allowed || busy !== null || restarting}
            onClick={() => { setConfirming(true) }}
          >
            {t('install')}
          </Button>
          {installBlocker === undefined && downloadBlocker === undefined
            ? null
            : <p>{installBlocker ?? downloadBlocker}</p>}
        </div>
      ) : null}

      {confirming && snapshot.targetVersion !== undefined ? (
        <div className={css.confirmation} role="group" aria-label={versionCopy(t('confirmTitle'), snapshot.targetVersion)}>
          <strong>{versionCopy(t('confirmTitle'), snapshot.targetVersion)}</strong>
          <p>{t('confirmBody')}</p>
          <div>
            <Button variant="outline" disabled={busy !== null} onClick={() => { setConfirming(false) }}>
              {t('cancel')}
            </Button>
            <Button variant="primary" disabled={busy !== null} onClick={() => { void action('install') }}>
              {t(busy === 'install' ? 'installing' : 'confirm')}
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot.releases.length > 0 ? (
        <div className={css.notes}>
          <div className={css.notesHeading}>
            <h3>{t('releaseNotes')}</h3>
            {snapshot.compareUrl === undefined ? null : (
              <a href={snapshot.compareUrl} target="_blank" rel="noreferrer">{t('compare')}</a>
            )}
          </div>
          {snapshot.releases.map((release, index) => (
            <details key={release.tag} open={index === snapshot.releases.length - 1}>
              <summary>
                <strong>v{release.version}</strong>
                <span>{release.name}</span>
                <time dateTime={release.publishedAt}>{t('published', { date: release.publishedAt.slice(0, 10) })}</time>
              </summary>
              <div className={css.markdown}>
                <MarkdownText text={chinese ? release.notesZh : release.notesEn} labels={markdownLabels} />
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  )
}
