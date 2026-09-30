import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { ComponentCatalog } from './ComponentCatalog.tsx'
import { en, zh, type CatalogKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Component catalog and interface guidance. */
    'settings.designSystem': CatalogKey
  }
}

/** Services used to mount the catalog and switch the real application theme. */
export const inject = ['slots', 'locale', 'theme']

/** Contribute the component catalog to Settings; registrations leave with this fiber. */
export function apply(ctx: Context): void {
  const namespace = 'settings.designSystem'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-design-system: dictionaries')
  const t = ctx.locale.bind(namespace)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'design-system',
    order: 90,
    label: () => t('title'),
    locale: namespace,
    inject: () => ({ setTheme: (id: 'light' | 'dark') => { ctx.theme.setTheme(id) } }),
  }, ComponentCatalog))
}
