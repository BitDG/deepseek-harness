/** Five native DSH cards adapted from Glance community and built-in widgets. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-dashboard/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { GITHUB_PATH, TIBO_PATH } from '../route.ts'
import { parseRepository, parseTiboCard, type TrendingRepository } from '../model.ts'
import { CalendarCard, CountdownCard, GithubCard, TiboCard, TimeProgressCard } from './Cards.tsx'
import { en, zh, type DashboardCommunityKey } from './locales.ts'
import { FeedSource } from './source.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the five adapted information cards. */
    'dashboard.community': DashboardCommunityKey
  }
}

/** Services required to register card entries and their dictionary. */
export const inject = ['slots', 'locale']

/** Register five independently rendered cards and own both feed lifetimes. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('dashboard.community', { zh, en }), 'dashboard-community: dictionaries')
  const tibo = new FeedSource(TIBO_PATH, parseTiboCard)
  const github = new FeedSource(GITHUB_PATH, (value): readonly TrendingRepository[] | undefined => {
    if (!Array.isArray(value)) return undefined
    const rows = value.map(parseRepository)
    return rows.some(row => row === undefined) ? undefined : rows as TrendingRepository[]
  })
  const tiboActions = { ensure: () => { tibo.ensure() }, refresh: () => { void tibo.refresh() } }
  const githubActions = { ensure: () => { github.ensure() }, refresh: () => { void github.refresh() } }
  ctx.effect(() => async () => { await Promise.all([tibo.dispose(), github.dispose()]) }, 'dashboard-community: feeds')
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'tibo', order: 30, locale: 'dashboard.community',
    inject: () => ({ hooks: { tibo: tibo.store }, ...tiboActions }),
  }, TiboCard))
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'github-trending', order: 40, locale: 'dashboard.community',
    inject: () => ({ hooks: { github: github.store }, ...githubActions }),
  }, GithubCard))
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'calendar', order: 50, locale: 'dashboard.community',
  }, CalendarCard))
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'countdown', order: 60, locale: 'dashboard.community',
  }, CountdownCard))
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'time-progress', order: 70, locale: 'dashboard.community',
  }, TimeProgressCard))
}
