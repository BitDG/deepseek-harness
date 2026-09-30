/** Workspace file removal keeps the listing's version and root confinement authoritative. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
beforeEach(async () => { harness = await openWorkspace('dsh-workspace-files-remove-') })
afterEach(async () => { await harness.dispose() })

describe('workspaceFiles.deleteFile', () => {
  it('removes a listed regular file and reports its absence', async () => {
    const path = join(harness.workspace, 'note.txt')
    await writeFile(path, 'old')
    const service = harness.endpoint()
    const listing = await service.list(harness.scope, '.', signal())
    const version = listing.entries.find(entry => entry.name === 'note.txt')?.version
    expect(version).toBeTypeOf('string')
    const changes: unknown[] = []
    harness.ctx.on('fs/observed', (_target, observation) => { changes.push(observation) })
    await service.deleteFile(harness.scope, path, version!, signal())
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(changes).toContainEqual({ kind: 'absent' })
  })

  it('keeps a file whose listed version is stale', async () => {
    const path = join(harness.workspace, 'note.txt')
    await writeFile(path, 'old')
    const service = harness.endpoint()
    const version = (await service.list(harness.scope, '.', signal())).entries[0]?.version
    await writeFile(path, 'new contents')
    expect((await failureOf(service.deleteFile(harness.scope, path, version!, signal()))).code).toBe('workspace-file/stale')
    expect(await readFile(path, 'utf8')).toBe('new contents')
  })

  it('reports a file removed after listing as stale', async () => {
    const path = join(harness.workspace, 'note.txt')
    await writeFile(path, 'old')
    const service = harness.endpoint()
    const version = (await service.list(harness.scope, '.', signal())).entries[0]?.version
    await unlink(path)
    expect((await failureOf(service.deleteFile(harness.scope, path, version!, signal()))).code).toBe('workspace-file/stale')
  })

  it('refuses outside paths, directories, and symlinks', async () => {
    const service = harness.endpoint()
    const outside = join(harness.outside, 'outside.txt')
    await writeFile(outside, 'keep')
    expect((await failureOf(service.deleteFile(harness.scope, outside, 'v', signal()))).code)
      .toBe('workspace-file/outside-workspace')
    expect((await failureOf(service.deleteFile(harness.scope, harness.workspace, 'v', signal()))).code)
      .toBe('workspace-file/not-regular-file')
    const link = join(harness.workspace, 'link.txt')
    await symlink(outside, link)
    expect((await failureOf(service.deleteFile(harness.scope, link, 'v', signal()))).code)
      .toBe('workspace-file/not-regular-file')
    expect(await readFile(outside, 'utf8')).toBe('keep')
  })
})
