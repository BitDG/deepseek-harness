/** Hacker News card driven by the React-free source's observable snapshot. */
import { useEffect, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HackerNewsSnapshot } from './source.ts'
import css from './HackerNewsCard.module.css'

/** Source hook and actions supplied by the registering plugin. */
export interface HackerNewsCardInjected {
  readonly hooks: { news: HostObservable<HackerNewsSnapshot> }
  readonly ensure: () => void
  readonly refresh: () => void
}

/** Props derived from the dashboard slot, locale, and source injection. */
export type HackerNewsCardProps = PropsRuntime<'dashboard.card'> & PropsLocale<'dashboard.hackerNews'> & InjectFace<HackerNewsCardInjected>

/** Render the latest stories, explicit refresh, and source-local failure state. */
export function HackerNewsCard({ useNews, ensure, refresh, t }: HackerNewsCardProps): ReactNode {
  const snapshot = useNews(state => state)
  useEffect(() => { ensure() }, [ensure])
  return (
    <section className={css.card} data-dashboard-card="hacker-news" aria-label={t('title')}>
      <header className={css.head}>
        <div><h2>{t('title')}</h2><p>{t('description')}</p></div>
        <button type="button" className={css.refresh} onClick={refresh} disabled={snapshot.phase === 'loading'}>{t('refresh')}</button>
      </header>
      {snapshot.phase === 'loading' && snapshot.stories.length === 0 ? <p className={css.status} role="status">{t('loading')}</p> : null}
      {snapshot.phase === 'error' ? <p className={css.status} role="alert">{t(snapshot.error ?? 'error')}
        {snapshot.stories.length > 0 ? ` ${t('retained')}` : ''}</p> : null}
      {snapshot.phase === 'ready' && snapshot.stories.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
      {snapshot.stories.length > 0 ? <ol className={css.list}>{snapshot.stories.map(story => (
        <li key={story.id}>
          <a className={css.story} href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
          <div className={css.meta}>
            <span>{t('points', { count: String(story.score) })}</span>
            <a href={story.commentsUrl} target="_blank" rel="noopener noreferrer">{t('comments', { count: String(story.comments) })}</a>
          </div>
        </li>
      ))}</ol> : null}
      {snapshot.failedCount > 0 ? <p className={css.note}>{t('partial', { count: String(snapshot.failedCount) })}</p> : null}
      {snapshot.updatedAt !== null ? <p className={css.note}>{t('updated', { time: new Date(snapshot.updatedAt).toLocaleString() })}</p> : null}
    </section>
  )
}
