/** Optional Hacker News card contributed to the dashboard list slot. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-dashboard/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { DashboardHackerNewsKey } from './locales.ts'
import { en, zh } from './locales.ts'
import { HackerNewsCard } from './HackerNewsCard.tsx'
import { HackerNewsSource } from './source.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Hacker News card text. */
    'dashboard.hackerNews': DashboardHackerNewsKey
  }
}

/** Services required to contribute the card. */
export const inject = ['slots', 'locale']

/** Register one card and own its request lifetime. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('dashboard.hackerNews', { zh, en }), 'dashboard-hacker-news: dictionaries')
  const source = new HackerNewsSource()
  const actions = { ensure: () => { source.ensure() }, refresh: () => { void source.refresh() } }
  ctx.effect(() => () => source.dispose(), 'dashboard-hacker-news: source')
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'hacker-news', order: 20,
    locale: 'dashboard.hackerNews',
    inject: () => ({
      hooks: { news: source.store },
      ...actions,
    }),
  }, HackerNewsCard))
}
