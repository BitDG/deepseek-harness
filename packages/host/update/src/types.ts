/** Browser-safe version and update state returned by the DSH update Remote. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one accepted update attempt. */
export type UpdateOperationId = Branded<'UpdateOperationId'>

/** Reason one update action is unavailable. */
export type UpdateBlocker =
  | 'source-checkout-required'
  | 'official-origin-required'
  | 'branch-required'
  | 'clean-worktree-required'
  | 'download-required'
  | 'fast-forward-required'
  | 'version-mismatch'
  | 'install-in-progress'

/** Whether the current state permits one update action. */
export interface UpdateActionAvailability {
  readonly allowed: boolean
  readonly blocker?: UpdateBlocker
}

/** One GitHub Release between the running version and the offered target. */
export interface DshReleaseView {
  readonly version: string
  readonly tag: string
  readonly name: string
  readonly publishedAt: string
  readonly url: string
  /** English section when the release body publishes a bilingual note. */
  readonly notesEn: string
  /** Simplified Chinese section when the release body publishes a bilingual note. */
  readonly notesZh: string
}

/** Latest durable updater outcome retained under the source checkout. */
export interface UpdateOperationView {
  readonly id: UpdateOperationId
  readonly fromVersion: string
  readonly toVersion: string
  readonly phase: 'waiting' | 'applying' | 'building' | 'restarting' | 'succeeded' | 'rolled-back' | 'failed'
  readonly updatedAt: string
  readonly error?: string
}

/** Point-in-time release and source-checkout state shown by Settings. */
export interface DshUpdateSnapshot {
  readonly currentVersion: string
  readonly currentCommit?: string
  readonly installation: 'source-checkout' | 'package'
  readonly branch?: string
  readonly dirty: boolean
  readonly status: 'up-to-date' | 'update-available'
  readonly targetVersion?: string
  readonly targetTag?: string
  readonly targetDownloaded: boolean
  readonly releases: readonly DshReleaseView[]
  readonly compareUrl?: string
  readonly download: UpdateActionAvailability
  readonly install: UpdateActionAvailability
  readonly lastOperation?: UpdateOperationView
}

/** Accepted handoff to the post-shutdown updater process. */
export interface UpdateInstallReceipt {
  readonly operationId: UpdateOperationId
  readonly restarting: true
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** GitHub, Git, or local checkout refused an update operation. */
    'update/rejected': {
      readonly reason: UpdateBlocker | 'download-failed' | 'release-check-failed' | 'worker-start-failed'
    }
  }
}
