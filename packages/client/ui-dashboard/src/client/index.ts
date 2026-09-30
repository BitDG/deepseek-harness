/** Browser entry for the opt-in dashboard and its additive information-card slot. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DashboardPage } from './DashboardPage.tsx'
import { DashboardIcon } from './DashboardIcon.tsx'
import { DashboardFooterAction } from './DashboardFooterAction.tsx'
import { en, zh, type DashboardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Additive root-scoped information cards; each plugin owns one id and its fetch lifecycle. */
    'dashboard.card': { kind: 'list'; scope: 'root' }
  }
  interface LocaleNamespaceMap {
    /** Dashboard shell and empty-state text. */
    dashboard: DashboardKey
  }
}

/** Dashboard panel id shared by its sidebar entry. */
export const PANEL_ID = 'dashboard' as MainPanelId
/** Services required to contribute the panel and its navigation row. */
export const inject = ['slots', 'locale', 'layout']

/** Register the dashboard page and its independently populated card slot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('dashboard', { zh, en }), 'ui-dashboard: dictionaries')
  const t = ctx.locale.bind('dashboard')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: 'dashboard',
    children: { 'dashboard.card': { kind: 'list', scope: 'root' } },
  }, DashboardPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 15,
    label: () => t('panel'), locale: 'dashboard',
  }, DashboardIcon))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'dashboard-open', order: 15,
    locale: 'dashboard',
    inject: () => ({ openDashboard: () => { ctx.layout.selectPanel(PANEL_ID) } }),
  }, DashboardFooterAction))
}
