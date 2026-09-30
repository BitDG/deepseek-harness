/** Recent Sessions read the existing Client catalog; no second data mirror is kept. */
import type { ReactNode } from 'react'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './SessionsCard.module.css'

/** Navigation callback supplied by the registering plugin. */
export interface SessionsCardInjected {
  openSession: (id: SessionId) => void
}

/** Card props from the dashboard slot, locale, and Session catalog adapter. */
export type SessionsCardProps = PropsRuntime<'dashboard.card'> & PropsLocale<'dashboard.sessions'> & InjectFace<SessionsCardInjected>

/** Select visible top-level sessions in recency order. */
export function recentSessions(list: SessionListState, archivedSessionIds: readonly SessionId[] = []) {
  const archived = new Set(archivedSessionIds)
  return list.ids
    .map(id => list.byId[id])
    .filter((row): row is SessionSummary => row !== undefined && !row.blank && row.origin !== 'subagent' && !archived.has(row.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6)
}

/** Render a recent-session card with real navigation back to Conversation. */
export function SessionsCard({ useSessions, useWorkspaces, openSession, t }: SessionsCardProps): ReactNode {
  const list = useSessions(state => state)
  const archived = useWorkspaces(state => state.archivedSessionIds)
  const rows = recentSessions(list, archived)
  return (
    <section className={css.card} data-dashboard-card="sessions" aria-label={t('title')}>
      <header className={css.head}>
        <div><h2>{t('title')}</h2><p>{t('description')}</p></div>
        <span className={css.count}>{rows.length}</span>
      </header>
      {rows.length === 0
        ? <p className={css.empty}>{t('empty')}</p>
        : <ul className={css.list}>{rows.map(row => (
          <li key={row.id}>
            <button type="button" onClick={() => { openSession(row.id) }}>
              <span className={css.title}>{row.displayTitle}</span>
              {row.running ? <span className={css.running}>{t('running')}</span> : null}
            </button>
          </li>
        ))}</ul>}
    </section>
  )
}
