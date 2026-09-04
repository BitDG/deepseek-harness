/** Browser contribution for OmniRoute Remote mounting and Models-page card. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import omniRouteRemote from '@deepseek-ai/dsh-llm-omniroute/remote'
import type {} from '@deepseek-ai/dsh-llm-omniroute/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { OmniRouteCardInjected } from './OmniRouteCard.tsx'
import { OmniRouteCard } from './OmniRouteCard.tsx'
import { en, zh, type OmniRouteKey } from './locales.ts'

export type { OmniRouteCardInjected, OmniRouteOperations } from './OmniRouteCard.tsx'
export type { OmniRouteKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** OmniRoute Models-page card copy. */
    'settings.models.omniroute': OmniRouteKey
  }
}

const NS = 'settings.models.omniroute'

/** Required Client services and slot declarer. */
export const inject = ['remote', 'slots', 'locale']

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'llm-omniroute.client: dictionaries')
  const t = ctx.locale.bind(NS) as OmniRouteCardInjected['t']
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'omniroute',
    order: 10,
    label: () => t('title'),
    inject: () => ({ operations: ctx.remote.omniroute, t }),
  }, OmniRouteCard))
}

/** Mount the generated namespace and register the Models-page footer card. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(omniRouteRemote)
  const ui = ctx.inject(['remote.omniroute', 'slots', 'locale'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmount()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmount()
  }
}
