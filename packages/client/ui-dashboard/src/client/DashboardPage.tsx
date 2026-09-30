/** Information dashboard shell. Card ownership stays with each contributing plugin. */
import { useRef, type ReactNode } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DashboardKey } from './locales.ts'
import css from './DashboardPage.module.css'
import { useCardLayout } from './card-layout.ts'

/** Props derived from the main panel and the dashboard's card slot. */
export type DashboardPageProps = PropsRuntime<'main'> & PropsRenderSlots<'dashboard.card'> & PropsLocale<'dashboard'>

/** Render the adjustable card grid and empty state. */
export function DashboardPage({ renderSlot, t }: DashboardPageProps): ReactNode {
  const grid = useRef<HTMLDivElement>(null)
  const reset = useCardLayout(grid, t)
  const empty = (
    <div className={css.empty}>
      <h2>{t('emptyTitle' satisfies DashboardKey)}</h2>
      <p>{t('emptyDescription' satisfies DashboardKey)}</p>
    </div>
  )
  return (
    <main className={css.page}>
      <div className={css.inner}>
        <div className={css.toolbar}><button type="button" onClick={reset}>{t('resetLayout')}</button></div>
        <div ref={grid} className={css.grid}>{renderSlot('dashboard.card', {}, { fallback: empty })}</div>
      </div>
    </main>
  )
}
