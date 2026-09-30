/** Browser-safe project and task values backed by one Teable base. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** One Teable record identity. */
export type TeableRecordId = Branded<'TeableRecordId'>

/** Status values configured in the Tasks table's single-select field. */
export type TeableTaskStatus = 'Todo' | 'In Progress' | 'Done'

/** A Teable project linked to a durable DSH Workspace identity. */
export interface TeableProject {
  readonly id: TeableRecordId
  readonly name: string
  readonly workspaceId: WorkspaceId
  readonly workspacePath: string
}

/** A task in Teable; its optional DSH Session link is informational. */
export interface TeableTask {
  readonly id: TeableRecordId
  readonly title: string
  readonly status: TeableTaskStatus
  readonly projectId: TeableRecordId
  readonly sessionId?: SessionId
}

/** Create a Teable project for an existing DSH Workspace if none is linked. */
export interface EnsureTeableProjectRequest {
  readonly workspaceId: WorkspaceId
}

/** A new task in an existing Teable project. */
export interface CreateTeableTaskRequest {
  readonly projectId: TeableRecordId
  readonly title: string
  readonly sessionId?: SessionId
}

/** Change a task's status without modifying its other fields. */
export interface SetTeableTaskStatusRequest {
  readonly taskId: TeableRecordId
  readonly status: TeableTaskStatus
}
