/** Native dashboard cards adapted from Glance community widget ideas. */
import { useEffect, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TiboStatus, TrendingRepository } from '../model.ts'
import type { DashboardCommunityKey } from './locales.ts'
import type { FeedSnapshot } from './source.ts'
import { calendarDaysUntil, timeProgress } from './time.ts'
import { CalendarCard as LunarCalendarCard } from './CalendarCard.tsx'
import css from './Cards.module.css'

type BaseProps = PropsRuntime<'dashboard.card'> & PropsLocale<'dashboard.community'>

/** Tibo feed hook and request actions supplied by this package. */
export interface TiboInjected {
  readonly hooks: { tibo: HostObservable<FeedSnapshot<TiboStatus>> }
  readonly ensure: () => void
  readonly refresh: () => void
}

/** GitHub feed hook and request actions supplied by this package. */
export interface GithubInjected {
  readonly hooks: { github: HostObservable<FeedSnapshot<readonly TrendingRepository[]>> }
  readonly ensure: () => void
  readonly refresh: () => void
}

/** Keep local date-based cards current while visible. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()) }, 60_000)
    return () => { clearInterval(timer) }
  }, [])
  return now
}

/** Tibo's nullable and freshness-aware prediction card. */
export function TiboCard({ useTibo, ensure, refresh, t }: BaseProps & InjectFace<TiboInjected>): ReactNode {
  const snapshot = useTibo(state => state)
  useEffect(() => { ensure() }, [ensure])
  const item = snapshot.value
  return (
    <section className={css.card} data-dashboard-card="tibo" aria-label={t('tiboTitle')}>
      <header className={css.head}>
        <div><h2>{t('tiboTitle')}</h2><p>{t('tiboDescription')}</p></div>
        <button type="button" className={css.action} onClick={refresh} disabled={snapshot.phase === 'loading'}>{t('refresh')}</button>
      </header>
      {item === null ? <p className={css.status} role={snapshot.phase === 'error' ? 'alert' : 'status'}>
        {t(snapshot.phase === 'error' ? snapshot.error ?? 'error' : 'loading')}
      </p> : <div className={css.body}>
        <div className={css.metric}>{item.chancePercent === null ? t('probabilityUnknown') : `${item.chancePercent}%`}</div>
        <div className={css.caption}>{t('probabilityLabel')}{item.stale ? ` · ${t('stale')}` : ''}</div>
        {item.chancePercent === null && !item.stale ? <p className={css.caption}>{t('probabilityMissing')}</p> : null}
        <p className={css.forecast}>{item.forecast || t('forecastUnavailable')}</p>
        <div className={css.footer}>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t('source')}</a>
          <span>{t('updated', { time: new Date(item.fetchedAt).toLocaleString() })}</span>
        </div>
      </div>}
      {item !== null && snapshot.phase === 'error' ? <p className={css.error} role="alert">{t(snapshot.error ?? 'error')} {t('retained')}</p> : null}
    </section>
  )
}

/** Recent GitHub repositories ranked by stars through GitHub Search. */
export function GithubCard({ useGithub, ensure, refresh, t }: BaseProps & InjectFace<GithubInjected>): ReactNode {
  const snapshot = useGithub(state => state)
  useEffect(() => { ensure() }, [ensure])
  return (
    <section className={css.card} data-dashboard-card="github" aria-label={t('githubTitle')}>
      <header className={css.head}>
        <div><h2>{t('githubTitle')}</h2><p>{t('githubDescription')}</p></div>
        <button type="button" className={css.action} onClick={refresh} disabled={snapshot.phase === 'loading'}>{t('refresh')}</button>
      </header>
      {snapshot.value === null ? <p className={css.status} role={snapshot.phase === 'error' ? 'alert' : 'status'}>
        {t(snapshot.phase === 'error' ? snapshot.error ?? 'error' : 'loading')}
      </p> : snapshot.value.length === 0 ? <p className={css.status}>{t('empty')}</p> : <ol className={css.repoList}>{snapshot.value.map(repo => (
        <li key={repo.fullName}>
          <a href={repo.url} target="_blank" rel="noopener noreferrer">{repo.fullName}</a>
          {repo.description ? <p>{repo.description}</p> : null}
          <div className={css.repoMeta}><span>{repo.language || '—'}</span><span>★ {t('stars', { count: String(repo.stars) })}</span></div>
        </li>
      ))}</ol>}
      {snapshot.value !== null && snapshot.phase === 'error' ? <p className={css.error} role="alert">{t(snapshot.error ?? 'error')} {t('retained')}</p> : null}
      {snapshot.updatedAt !== null ? <p className={css.feedNote}>{t('lastUpdated', { time: new Date(snapshot.updatedAt).toLocaleString() })}</p> : null}
      <div className={css.cardLink}>
        <a href="https://github.com/search?type=repositories" target="_blank" rel="noopener noreferrer">{t('githubSource')}</a>
        <a href="https://github.com/glanceapp/community-widgets/blob/main/GALLERY.md" target="_blank" rel="noopener noreferrer">{t('gallery')}</a>
      </div>
    </section>
  )
}

/** Chinese calendar, updated at the same cadence as other local date cards. */
export function CalendarCard(props: BaseProps): ReactNode {
  return <LunarCalendarCard {...props} now={useNow()} />
}

const COUNTDOWN_KEY = 'dsh.dashboard.countdownDate'

/** Editable local countdown adapted from the Gallery countdown idea. */
export function CountdownCard({ t }: BaseProps): ReactNode {
  const now = useNow()
  const [target, setTarget] = useState(() => {
    try {
      const saved = localStorage.getItem(COUNTDOWN_KEY)
      if (saved !== null && calendarDaysUntil(saved, new Date()) !== undefined) return saved
    } catch (_error) {
      // Browser storage may be disabled; the card still works for this mount.
    }
    return `${now.getFullYear() + 1}-01-01`
  })
  const days = calendarDaysUntil(target, now)
  const label = days === undefined ? t('countdownLabel') : days > 0
    ? t('daysLeft', { count: String(days) }) : days === 0 ? t('todayIsTarget')
      : t('daysPassed', { count: String(-days) })
  return (
    <section className={css.card} data-dashboard-card="countdown" aria-label={t('countdownTitle')}>
      <header className={css.head}><div><h2>{t('countdownTitle')}</h2><p>{t('countdownDescription')}</p></div></header>
      <div className={css.body}>
        <div className={css.metric}>{label}</div>
        <label className={css.inputLabel} htmlFor="dashboard-countdown-date">{t('countdownLabel')}</label>
        <input id="dashboard-countdown-date" className={css.dateInput} type="date" value={target}
          onChange={(event) => {
            const value = event.currentTarget.value
            setTarget(value)
            try { localStorage.setItem(COUNTDOWN_KEY, value) } catch (_error) {
              // A private browser may reject writes; local state remains usable.
            }
          }} />
      </div>
    </section>
  )
}

/** Local day, month, and year progress with leap-year-aware endpoints. */
export function TimeProgressCard({ t }: BaseProps): ReactNode {
  const now = useNow()
  const names: Record<'day' | 'month' | 'year', DashboardCommunityKey> = {
    day: 'day', month: 'monthProgress', year: 'year',
  }
  return (
    <section className={css.card} data-dashboard-card="progress" aria-label={t('progressTitle')}>
      <header className={css.head}><div><h2>{t('progressTitle')}</h2><p>{t('progressDescription')}</p></div></header>
      <div className={css.body}>{timeProgress(now).map(row => (
        <div className={css.progressRow} key={row.id}>
          <div className={css.progressLabel}><span>{t(names[row.id])}</span><strong>{row.percent.toFixed(1)}%</strong></div>
          <div className={css.track} role="progressbar" aria-label={t(names[row.id])} aria-valuenow={Number(row.percent.toFixed(1))}
            aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${row.percent}%` }} /></div>
        </div>
      ))}</div>
    </section>
  )
}
