/** Dashboard navigation for sidebar implementations that omit panel rows. */
import type { ReactNode } from 'react'
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DashboardKey } from './locales.ts'
import css from './DashboardFooterAction.module.css'

interface DashboardFooterFace {
  openDashboard: () => void
}

/** Render a footer entry for sidebars that expose footer actions but no panel list. */
export function DashboardFooterAction({ wide, openDashboard, t }: PropsRuntime<'sidebar.footer.action'> & InjectFace<DashboardFooterFace> & PropsLocale<'dashboard'>): ReactNode {
  return <button type="button" className={css.action} aria-label={t('panel' satisfies DashboardKey)} onClick={() => { openDashboard() }}>
    <IconDataOutline16 size={16} />
    {wide && <span>{t('panel')}</span>}
  </button>
}
