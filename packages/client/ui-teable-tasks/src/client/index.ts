/** Optional Teable task page in the DSH Web sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { TasksPageFace } from './TasksPage.tsx'
import { TasksPage } from './TasksPage.tsx'
import { TasksFooter, TasksIcon } from './Navigation.tsx'
import { en, zh, type TeableTasksKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Teable project and task page text. */
    teableTasks: TeableTasksKey
  }
}

const PANEL_ID = 'teable-tasks' as MainPanelId

/** Services needed for navigation, localized copy, and Teable Remote calls. */
export const inject = ['slots', 'locale', 'layout', 'remote', 'remote.teableTasks', 'uiWorkspace']

/** Register the page and its sidebar navigation. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('teableTasks', { zh, en }), 'ui-teable-tasks: dictionaries')
  const t = ctx.locale.bind('teableTasks')
  const face: TasksPageFace = {
    load: async () => {
      const [projects, tasks, webUrl] = await Promise.all([
        ctx.remote.teableTasks.listProjects(),
        ctx.remote.teableTasks.listTasks(),
        ctx.remote.teableTasks.webUrl(),
      ])
      if (!projects.ok) throw new Error(projects.error.message)
      if (!tasks.ok) throw new Error(tasks.error.message)
      if (!webUrl.ok) throw new Error(webUrl.error.message)
      return { projects: projects.value, tasks: tasks.value, webUrl: webUrl.value }
    },
    ensureProject: async (workspaceId) => {
      const result = await ctx.remote.teableTasks.ensureProject({ workspaceId })
      if (!result.ok) throw new Error(result.error.message)
    },
    createTask: async (projectId, title, sessionId) => {
      const result = await ctx.remote.teableTasks.createTask({ projectId, title, ...(sessionId === undefined ? {} : { sessionId }) })
      if (!result.ok) throw new Error(result.error.message)
    },
    setStatus: async (taskId, status) => {
      const result = await ctx.remote.teableTasks.setTaskStatus({ taskId, status })
      if (!result.ok) throw new Error(result.error.message)
    },
    openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: 'teableTasks', inject: () => face,
  }, TasksPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 20,
    label: () => t('panel'), locale: 'teableTasks',
  }, TasksIcon))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'teable-tasks-open', order: 20,
    locale: 'teableTasks', inject: () => ({ openTasks: () => { ctx.layout.selectPanel(PANEL_ID) } }),
  }, TasksFooter))
}
