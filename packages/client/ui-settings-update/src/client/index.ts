/** DSH update Settings contribution over the generated Host Remote. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { UpdateSection, type UpdateSectionInjected } from './UpdateSection.tsx'
import { en, zh, type UpdateLocaleKey } from './locales.ts'

export type { UpdateSectionInjected, UpdateSectionProps } from './UpdateSection.tsx'
export type { UpdateLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** DSH release comparison and guarded install copy. */
    'settings.update': UpdateLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.update'

/** Services required by the Settings registration and generated update Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.update']

/** Register the DSH update section without reading GitHub until the page mounts. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-update: dictionaries')
  const t = ctx.locale.bind(NS)
  const unwrap = async <T>(result: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> => {
    const resolved = await result
    if (!resolved.ok) throw new Error(resolved.error.message)
    return resolved.value
  }
  const injected = (): UpdateSectionInjected => ({
    check: force => unwrap(ctx.remote.update.check(force)),
    download: tag => unwrap(ctx.remote.update.download(tag)),
    install: tag => unwrap(ctx.remote.update.apply(tag)),
    language: () => ctx.locale.getLocale().active,
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'update',
    order: 40,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, UpdateSection))
}
