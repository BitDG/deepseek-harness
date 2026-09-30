/** Teable-backed project and task Remote for an opt-in Web profile. */
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {} from '@deepseek-ai/dsh-workspace'
import { TeableRecords, type TeableConnection } from './teable.ts'
import type {
  CreateTeableTaskRequest, EnsureTeableProjectRequest, SetTeableTaskStatusRequest,
  TeableProject, TeableTask,
} from './types.ts'

export type * from './types.ts'

/** Required connection and table names for one Teable base. */
export type Config = TeableConnection

/** Token stays on the Host and is redacted by Settings. */
export const Config: Schema<Config> = Schema.object({
  baseUrl: Schema.string().required(),
  accessToken: Schema.string().role('secret').required(),
  projectTableId: Schema.string().required(),
  taskTableId: Schema.string().required(),
  requestTimeoutMs: Schema.number().min(1000).max(60000).default(12000),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Teable task API and Remote namespace owner. */
    teableTasks: TeableTasksController
  }
}

/** Host owner of the generated `ctx.remote.teableTasks` namespace. */
export class TeableTasksController extends TypertRemoteService {
  static inject = ['typert', 'workspaceRegistry']
  static Config = Config
  private readonly records: TeableRecords
  private readonly pendingProjects = new Map<WorkspaceId, Promise<TeableProject>>()

  /** @param ctx - Host context with the Workspace registry. @param config - Teable connection. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'teableTasks', { namespace: 'teableTasks' })
    this.records = new TeableRecords(config)
  }

  /**
   * List configured Teable project rows.
   * @returns every project row.
   */
  @Remote
  listProjects(): Promise<TeableProject[]> {
    return this.records.projects()
  }

  /**
   * List Teable task rows for Client filtering.
   * @returns every task row.
   */
  @Remote
  listTasks(): Promise<TeableTask[]> {
    return this.records.tasks()
  }

  /**
   * Open the Teable site for its full table views.
   * @returns token-free Teable site URL.
   */
  @Remote
  webUrl(): string {
    return this.records.webUrl()
  }

  /**
   * Reuse the Teable row for a DSH Workspace, or create one from its current title and path.
   * @param request - existing Workspace identity.
   * @returns Teable project row after the read or insert.
   */
  @Remote
  ensureProject(request: EnsureTeableProjectRequest): Promise<TeableProject> {
    const pending = this.pendingProjects.get(request.workspaceId)
    if (pending !== undefined) return pending
    const result = this.findOrCreateProject(request)
    this.pendingProjects.set(request.workspaceId, result)
    const clear = (): void => { this.pendingProjects.delete(request.workspaceId) }
    void result.then(clear, clear)
    return result
  }

  private async findOrCreateProject(request: EnsureTeableProjectRequest): Promise<TeableProject> {
    const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (workspace === undefined) throw new Error(`DSH Workspace ${request.workspaceId} does not exist`)
    const matches = (await this.records.projects()).filter(project => project.workspaceId === workspace.id)
    if (matches.length > 1) throw new Error(`Teable has duplicate project rows for DSH Workspace ${workspace.id}`)
    return matches[0] ?? this.records.createProject(workspace)
  }

  /**
   * Create a task linked to a Teable project and optionally a Session of that project's DSH Workspace.
   * @param request - project, title, and optional Session id.
   * @returns newly created Teable task row.
   */
  @Remote
  async createTask(request: CreateTeableTaskRequest): Promise<TeableTask> {
    const title = request.title.trim()
    if (!title) throw new Error('Teable task title is required')
    const projects = (await this.records.projects()).filter(project => project.id === request.projectId)
    const project = projects[0]
    if (projects.length !== 1 || project === undefined) throw new Error(`Teable project ${request.projectId} does not exist`)
    if (request.sessionId !== undefined) {
      const workspace = this.ctx.workspaceRegistry.get(project.workspaceId)
      if (!workspace?.sessionIds.includes(request.sessionId)) {
        throw new Error(`DSH Session ${request.sessionId} is not in the linked Workspace`)
      }
    }
    return this.records.createTask(request.projectId, title, request.sessionId)
  }

  /**
   * Update one Teable task status while retaining its other fields.
   * @param request - task id and one of the configured status options.
   * @returns updated Teable task row.
   */
  @Remote
  setTaskStatus(request: SetTeableTaskStatusRequest): Promise<TeableTask> {
    if (!['Todo', 'In Progress', 'Done'].includes(request.status)) throw new Error('Unsupported Teable task status')
    return this.records.setStatus(request.taskId, request.status)
  }
}

export default TeableTasksController
