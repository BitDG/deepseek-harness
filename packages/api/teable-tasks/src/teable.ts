/** Server-only Teable record transport and strict field projection. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { TeableProject, TeableRecordId, TeableTask, TeableTaskStatus } from './types.ts'

interface TeableRecord {
  readonly id: TeableRecordId
  readonly fields: Record<string, unknown>
}

/** Validated connection values supplied by the opt-in profile row. */
export interface TeableConnection {
  /** HTTPS origin of the Teable instance; loopback HTTP is allowed for local use. */
  readonly baseUrl: string
  /** Teable personal access token with read and write access to both tables. */
  readonly accessToken: string
  /** Record table ID for Projects. */
  readonly projectTableId: string
  /** Record table ID for Tasks. */
  readonly taskTableId: string
  /** Upper bound in milliseconds for one Teable HTTP request. */
  readonly requestTimeoutMs: number
}

/** Read and write the two configured tables without exposing the token to the Client. */
export class TeableRecords {
  private readonly origin: string

  /** @param config - Teable URL, token, table ids, and request timeout. */
  constructor(private readonly config: TeableConnection, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(config.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Teable baseUrl must be an HTTP(S) origin without credentials or a path')
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Teable baseUrl must use HTTPS except on loopback')
    }
    this.origin = url.origin
  }

  /**
   * Return the public Teable site origin without the Host access token.
   * @returns Teable site URL.
   */
  webUrl(): string {
    return this.origin
  }

  /**
   * Read all project rows; a repeated pagination cursor fails instead of looping.
   * @returns projected project rows.
   */
  async projects(): Promise<TeableProject[]> {
    return (await this.list(this.config.projectTableId)).map(projectFromRecord)
  }

  /**
   * Read all task rows; Teable remains the record owner.
   * @returns projected task rows.
   */
  async tasks(): Promise<TeableTask[]> {
    return (await this.list(this.config.taskTableId)).map(taskFromRecord)
  }

  /**
   * Insert the DSH Workspace's current title and stable identity.
   * @param workspace - existing Workspace.
   * @returns created project row.
   */
  async createProject(workspace: { readonly id: WorkspaceId; readonly title: string; readonly path: string }): Promise<TeableProject> {
    const record = await this.create(this.config.projectTableId, {
      Name: workspace.title,
      DshWorkspaceId: workspace.id,
      DshWorkspacePath: workspace.path,
    })
    return projectFromRecord(record)
  }

  /**
   * Insert a task in one Teable project.
   * @param projectId - target project record.
   * @param title - task title.
   * @param sessionId - optional DSH Session identity.
   * @returns created task row.
   */
  async createTask(projectId: TeableRecordId, title: string, sessionId?: SessionId): Promise<TeableTask> {
    const record = await this.create(this.config.taskTableId, {
      Title: title,
      Status: 'Todo',
      ProjectId: projectId,
      ...(sessionId === undefined ? {} : { DshSessionId: sessionId }),
    })
    return taskFromRecord(record)
  }

  /**
   * Patch only Status and return Teable's committed row.
   * @param taskId - existing task record.
   * @param status - configured single-select option.
   * @returns updated task row.
   */
  async setStatus(taskId: TeableRecordId, status: TeableTaskStatus): Promise<TeableTask> {
    const response = await this.request('PATCH', this.config.taskTableId, taskId, {
      fieldKeyType: 'name', record: { fields: { Status: status } },
    })
    return taskFromRecord(parseRecord(response))
  }

  private async create(tableId: string, fields: Record<string, string>): Promise<TeableRecord> {
    const response = await this.request('POST', tableId, undefined, {
      fieldKeyType: 'name', records: [{ fields }],
    })
    const body = requireObject(response)
    if (!Array.isArray(body.records) || body.records.length !== 1) throw new Error('Teable returned an invalid create response')
    return parseRecord(body.records[0])
  }

  private async list(tableId: string): Promise<TeableRecord[]> {
    const rows: TeableRecord[] = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    while (true) {
      const query = new URLSearchParams({ fieldKeyType: 'name', take: '1000' })
      if (cursor !== undefined) query.set('cursor', cursor)
      const response = await this.request('GET', tableId, undefined, undefined, query)
      const body = requireObject(response)
      if (!Array.isArray(body.records)) throw new Error('Teable returned an invalid records response')
      rows.push(...body.records.map(parseRecord))
      const next = body.extra === undefined ? undefined : requireObject(body.extra).nextCursor
      if (next === null || next === undefined || next === '') return rows
      if (typeof next !== 'string' || cursors.has(next)) throw new Error('Teable returned an invalid pagination cursor')
      cursors.add(next)
      cursor = next
    }
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH', tableId: string, recordId?: TeableRecordId,
    body?: object, query?: URLSearchParams,
  ): Promise<unknown> {
    const path = `/api/table/${encodeURIComponent(tableId)}/record${recordId === undefined ? '' : `/${encodeURIComponent(recordId)}`}`
    const url = new URL(path, this.origin)
    if (query !== undefined) url.search = query.toString()
    const response = await this.fetcher(url, {
      method,
      headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    })
    if (!response.ok) throw new Error(`Teable ${method} ${path} returned HTTP ${response.status}`)
    return response.json() as Promise<unknown>
  }
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Teable returned an invalid object')
  return value as Record<string, unknown>
}

function parseRecord(value: unknown): TeableRecord {
  const record = requireObject(value)
  if (typeof record.id !== 'string' || record.id.length === 0) throw new Error('Teable returned a record without an id')
  return { id: record.id as TeableRecordId, fields: requireObject(record.fields) }
}

function field(record: TeableRecord, name: string): string {
  const value = record.fields[name]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Teable record ${record.id} needs text field ${name}`)
  return value
}

function projectFromRecord(record: TeableRecord): TeableProject {
  return {
    id: record.id,
    name: field(record, 'Name'),
    workspaceId: field(record, 'DshWorkspaceId') as WorkspaceId,
    workspacePath: field(record, 'DshWorkspacePath'),
  }
}

function taskFromRecord(record: TeableRecord): TeableTask {
  const status = field(record, 'Status')
  if (status !== 'Todo' && status !== 'In Progress' && status !== 'Done') {
    throw new Error(`Teable record ${record.id} has unsupported Status`)
  }
  const sessionId = record.fields.DshSessionId
  if (sessionId !== undefined && sessionId !== null && sessionId !== '' && typeof sessionId !== 'string') {
    throw new Error(`Teable record ${record.id} has invalid DshSessionId`)
  }
  return {
    id: record.id,
    title: field(record, 'Title'),
    status,
    projectId: field(record, 'ProjectId') as TeableRecordId,
    ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId: sessionId as SessionId } : {}),
  }
}
