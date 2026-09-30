/** Register the optional Beszel device card and its dictionary. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-dashboard/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { DeviceCard } from './DeviceCard.tsx'
import { DeviceSource } from './source.ts'
import { en, zh, type DeviceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Labels for device resources and source status. */
    'dashboard.devices': DeviceKey
  }
}

/** Card registration requires slots and locale services. */
export const inject = ['slots', 'locale']

/**
 * Register one independently disposable device card.
 * @param ctx - Client context with the dashboard slot and dictionary registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('dashboard.devices', { zh, en }), 'dashboard-devices: dictionary')
  const source = new DeviceSource()
  const refresh = () => { void source.refresh() }
  ctx.effect(() => () => source.dispose(), 'dashboard-devices: source')
  ctx.slots.inject('dashboard.card', () => ctx.slots.register({
    name: 'dashboard.card', id: 'devices', order: 80, locale: 'dashboard.devices',
    inject: () => ({ hooks: { devices: source.store }, refresh }),
  }, DeviceCard))
}
