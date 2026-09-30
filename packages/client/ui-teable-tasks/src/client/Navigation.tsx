/** Task navigation in the sidebar. */
import { IconListPenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TasksPage.module.css'

/** Sidebar panel icon. */
export function TasksIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconListPenOutline16 size={size} />
}

interface FooterFace { readonly openTasks: () => void }

/** Footer fallback for sidebar implementations without panel rows. */
export function TasksFooter({ wide, openTasks, t }: PropsRuntime<'sidebar.footer.action'> & InjectFace<FooterFace> & PropsLocale<'teableTasks'>) {
  return <button type="button" className={css.footer} aria-label={t('panel')} onClick={openTasks}>
    <IconListPenOutline16 size={16} />
    {wide && <span>{t('panel')}</span>}
  </button>
}
