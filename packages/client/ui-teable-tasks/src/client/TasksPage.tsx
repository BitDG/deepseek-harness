/** Project and task controls over the Host-owned Teable Remote. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TeableProject, TeableRecordId, TeableTask, TeableTaskStatus } from '@deepseek-ai/dsh-api-teable-tasks/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TasksPage.module.css'

/** Plain operations supplied by the registering Client plugin. */
export interface TasksPageFace {
  readonly load: () => Promise<{ readonly projects: TeableProject[]; readonly tasks: TeableTask[]; readonly webUrl: string }>
  readonly ensureProject: (workspaceId: WorkspaceId) => Promise<void>
  readonly createTask: (projectId: TeableRecordId, title: string, sessionId?: SessionId) => Promise<void>
  readonly setStatus: (taskId: TeableRecordId, status: TeableTaskStatus) => Promise<void>
  readonly openSession: (sessionId: SessionId) => void
}

/** Page props from the main Slot, locales, and Teable operations. */
export type TasksPageProps = PropsRuntime<'main'> & PropsLocale<'teableTasks'> & InjectFace<TasksPageFace>

/** Render project linking, task creation, and task status updates. */
export function TasksPage({ useWorkspaces, load, ensureProject, createTask, setStatus, openSession, t }: TasksPageProps): ReactNode {
  const workspaces = useWorkspaces(state => state.items)
  const [projects, setProjects] = useState<TeableProject[]>([])
  const [tasks, setTasks] = useState<TeableTask[]>([])
  const [webUrl, setWebUrl] = useState('')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [projectId, setProjectId] = useState<TeableRecordId | ''>('')
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | ''>('')
  const [sessionId, setSessionId] = useState<SessionId | ''>('')
  const [title, setTitle] = useState('')

  const refresh = async (): Promise<void> => {
    try {
      const rows = await load()
      setProjects(rows.projects)
      setTasks(rows.tasks)
      setWebUrl(rows.webUrl)
      setProjectId(current => rows.projects.some(project => project.id === current) ? current : (rows.projects[0]?.id ?? ''))
      setErrorMessage('')
      setPhase('ready')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '')
      setPhase('error')
    }
  }
  useEffect(() => { void refresh() }, [load])

  const unlinked = useMemo(() => workspaces.filter(workspace =>
    !projects.some(project => project.workspaceId === workspace.workspaceId)), [workspaces, projects])
  const chosenWorkspaceId = unlinked.some(workspace => workspace.workspaceId === workspaceId)
    ? workspaceId : (unlinked[0]?.workspaceId ?? '')
  const project = projects.find(row => row.id === projectId)
  const projectWorkspace = workspaces.find(row => row.workspaceId === project?.workspaceId)
  const visibleTasks = tasks.filter(task => task.projectId === project?.id)
  const chosenSessionId = projectWorkspace?.sessionIds.includes(sessionId as SessionId) ? sessionId : ''

  const run = async (mutation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await mutation()
      await refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '')
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  return <main className={css.page}>
    <div className={css.inner}>
      <header className={css.heading}>
        <div><span className={css.eyebrow}>{t('eyebrow')}</span><h1>{t('title')}</h1><p>{t('intro')}</p></div>
        <div className={css.headingActions}>
          {webUrl && <a href={webUrl} target="_blank" rel="noopener noreferrer">{t('openTeable')}</a>}
          <button type="button" onClick={() => { void refresh() }} disabled={busy}>{t('refresh')}</button>
        </div>
      </header>
      {phase === 'loading' && <p role="status">{t('loading')}</p>}
      {phase === 'error' && <p role="alert" className={css.error}>{t('error')} {errorMessage}</p>}
      <section className={css.section} aria-label={t('projects')}>
        <h2>{t('projects')}</h2>
        <div className={css.controls}>
          <select aria-label={t('projects')} value={projectId} onChange={(event) => { setProjectId(event.target.value as TeableRecordId); setSessionId('') }}>
            {projects.length === 0 && <option value="">{t('noProjects')}</option>}
            {projects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <select aria-label={t('workspace')} value={chosenWorkspaceId} onChange={(event) => { setWorkspaceId(event.target.value as WorkspaceId) }} disabled={unlinked.length === 0}>
            {unlinked.length === 0 && <option value="">{workspaces.length === 0 ? t('noWorkspace') : t('allLinked')}</option>}
            {unlinked.map(row => <option key={row.workspaceId} value={row.workspaceId}>{row.title}</option>)}
          </select>
          <button type="button" className={css.primary} disabled={busy || !chosenWorkspaceId} onClick={() => { void run(() => ensureProject(chosenWorkspaceId as WorkspaceId)) }}>{busy ? t('busy') : t('connect')}</button>
        </div>
      </section>
      <section className={css.section} aria-label={t('tasks')}>
        <h2>{t('tasks')}</h2>
        {project && <form className={css.controls} onSubmit={(event) => {
          event.preventDefault()
          if (!title.trim()) return
          void run(async () => { await createTask(project.id, title.trim(), chosenSessionId || undefined); setTitle('') })
        }}>
          <input aria-label={t('taskTitle')} placeholder={t('taskTitlePlaceholder')} value={title} onChange={(event) => { setTitle(event.target.value) }} />
          <select aria-label={t('session')} value={chosenSessionId} onChange={(event) => { setSessionId(event.target.value as SessionId) }}>
            <option value="">{t('noSession')}</option>
            {projectWorkspace?.sessionIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <button type="submit" className={css.primary} disabled={busy || !title.trim()}>{busy ? t('busy') : t('createTask')}</button>
        </form>}
        {visibleTasks.length === 0 ? <p className={css.empty}>{t('noTasks')}</p> : <ul className={css.taskList}>{visibleTasks.map(task => <li key={task.id}>
          <span className={css.taskTitle}>{task.title}</span>
          {task.sessionId && <button type="button" className={css.link} onClick={() => { openSession(task.sessionId as SessionId) }}>{t('openSession')}</button>}
          <select aria-label={`${t('status')}: ${task.title}`} value={task.status} disabled={busy} onChange={(event) => {
            void run(() => setStatus(task.id, event.target.value as TeableTaskStatus))
          }}>
            <option value="Todo">{t('todo')}</option>
            <option value="In Progress">{t('progress')}</option>
            <option value="Done">{t('done')}</option>
          </select>
        </li>)}</ul>}
      </section>
    </div>
  </main>
}
