/** Optional recent-sessions card, independently mounted into the dashboard. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-dashboard/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { DashboardSessionsKey } from './locales.ts'
import { en, zh } from './locales.ts'
import { SessionsCard } from './SessionsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Recent Sessions card text. */
    'dashboard.sessions': DashboardSessionsKey
  }
}

/** Services required to register the card and navigate to a Session. */
export const inject = ['slots', 'locale', 'uiWorkspace']

/** Register one card for each lifetime of the dashboard's list declaration. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('dashboard.sessions', { zh, en }), 'dashboard-sessions: dictionaries')
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'sessions', order: 10,
    locale: 'dashboard.sessions',
    inject: () => ({ openSession: (id: Parameters<typeof ctx.uiWorkspace.openSession>[0]) => { ctx.uiWorkspace.openSession(id) } }),
  }, SessionsCard))
}
