/**
 * Visual body of one inline reference chip: the DecoratorNode's React
 * face. Pure display — identity, invalidation, and lifecycle live on the
 * ReferenceChipNode; this component renders whatever the node carries.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ReferenceIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReferenceIconKind } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ReferenceChip.module.css'

/** Display inputs of one chip (the node's cached owner projections). */
export interface ReferenceChipProps {
  readonly label: string
  /** Domain glyph; absent renders the trigger marker instead of an icon. */
  readonly appearance?: ReferenceIconKind | undefined
  /** Owner-resolution failure styling bit. */
  readonly invalid: boolean
  /** Remove this file reference; absent keeps non-file references display-only. */
  readonly onRemove?: (() => void) | undefined
}

/**
 * Render one inline reference chip.
 * @param props - label, optional domain glyph, invalid bit, and optional removal action.
 * @returns the chip body (icon + truncating label + file removal action).
 */
export function ReferenceChip({ label, appearance, invalid, onRemove }: ReferenceChipProps): ReactNode {
  return (
    <span className={clsx(css.chip, invalid && css.invalid)} title={label}>
      {appearance === undefined
        ? <span className={css.marker} aria-hidden>@</span>
        : <ReferenceIcon kind={appearance} size={14} className={css.icon} />}
      <span className={css.label}>{label}</span>
      {onRemove === undefined ? null : (
        <button
          type="button"
          className={css.remove}
          aria-label={label}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </span>
  )
}
