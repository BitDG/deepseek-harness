import { describe, expect, it, vi } from 'vitest'
import { TeableRecords, type TeableConnection } from '../src/teable.ts'
import type { TeableRecordId } from '../src/types.ts'

const config: TeableConnection = {
  baseUrl: 'http://127.0.0.1:3000',
  accessToken: 'private-token',
  projectTableId: 'tbl-projects',
  taskTableId: 'tbl-tasks',
  requestTimeoutMs: 12000,
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

describe('Teable record transport', () => {
  it('paginates projects and sends the documented create and patch bodies', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ records: [{ id: 'rec-p1', fields: {
        Name: 'Project One', DshWorkspaceId: 'ws-1', DshWorkspacePath: '/work/one',
      } }], extra: { nextCursor: 'cursor-2' } }))
      .mockResolvedValueOnce(response({ records: [{ id: 'rec-p3', fields: {
        Name: 'Project Three', DshWorkspaceId: 'ws-3', DshWorkspacePath: '/work/three',
      } }], extra: { nextCursor: null } }))
      .mockResolvedValueOnce(response({ records: [{ id: 'rec-p2', fields: {
        Name: 'Project Two', DshWorkspaceId: 'ws-2', DshWorkspacePath: '/work/two',
      } }] }, 201))
      .mockResolvedValueOnce(response({ records: [{ id: 'rec-t1', fields: {
        Title: 'Ship', Status: 'Todo', ProjectId: 'rec-p2', DshSessionId: 'session-1',
      } }] }, 201))
      .mockResolvedValueOnce(response({ id: 'rec-t1', fields: {
        Title: 'Ship', Status: 'Done', ProjectId: 'rec-p2', DshSessionId: 'session-1',
      } }))
    const records = new TeableRecords(config, fetcher)

    expect(await records.projects()).toEqual([
      { id: 'rec-p1', name: 'Project One', workspaceId: 'ws-1', workspacePath: '/work/one' },
      { id: 'rec-p3', name: 'Project Three', workspaceId: 'ws-3', workspacePath: '/work/three' },
    ])
    expect(await records.createProject({ id: 'ws-2' as never, title: 'Project Two', path: '/work/two' })).toMatchObject({ id: 'rec-p2' })
    expect(await records.createTask('rec-p2' as TeableRecordId, 'Ship', 'session-1' as never)).toMatchObject({ id: 'rec-t1', status: 'Todo' })
    expect(await records.setStatus('rec-t1' as TeableRecordId, 'Done')).toMatchObject({ id: 'rec-t1', status: 'Done' })

    const calls = fetcher.mock.calls
    expect(calls[0]![0]).toMatchObject({ href: 'http://127.0.0.1:3000/api/table/tbl-projects/record?fieldKeyType=name&take=1000' })
    const secondUrl = calls[1]![0]
    expect(secondUrl).toBeInstanceOf(URL)
    if (secondUrl instanceof URL) expect(secondUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer private-token' })
    expect(JSON.parse(calls[2]![1]?.body as string)).toEqual({
      fieldKeyType: 'name', records: [{ fields: {
        Name: 'Project Two', DshWorkspaceId: 'ws-2', DshWorkspacePath: '/work/two',
      } }],
    })
    expect(JSON.parse(calls[3]![1]?.body as string)).toEqual({
      fieldKeyType: 'name', records: [{ fields: {
        Title: 'Ship', Status: 'Todo', ProjectId: 'rec-p2', DshSessionId: 'session-1',
      } }],
    })
    expect(JSON.parse(calls[4]![1]?.body as string)).toEqual({
      fieldKeyType: 'name', record: { fields: { Status: 'Done' } },
    })
  })

  it('rejects unsupported origins, repeated cursors, and malformed rows', async () => {
    expect(() => new TeableRecords({ ...config, baseUrl: 'http://teable.example' })).toThrow('HTTPS')
    const repeating = vi.fn<typeof fetch>(async () => response({ records: [], extra: { nextCursor: 'same' } }))
    await expect(new TeableRecords(config, repeating).projects()).rejects.toThrow('pagination cursor')
    const malformed = vi.fn<typeof fetch>()
      .mockResolvedValue(response({ records: [{ id: 'rec-1', fields: { Title: 'Task', Status: 'Unknown', ProjectId: 'rec-p1' } }] }))
    await expect(new TeableRecords(config, malformed).tasks()).rejects.toThrow('unsupported Status')
  })

  it('redacts the response body and token in an HTTP failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ detail: 'private-token' }, 403))
    await expect(new TeableRecords(config, fetcher).projects()).rejects.toThrow('Teable GET /api/table/tbl-projects/record returned HTTP 403')
  })
})
