import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runUpdateWorker } from '../src/update-worker.ts'
import { parseWorkerRequest, type UpdateWorkerCommand, type UpdateWorkerRequest } from '../src/worker-protocol.ts'

const roots: string[] = []
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<{ request: UpdateWorkerRequest; old: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-worker-'))
  roots.push(root)
  await mkdir(join(root, '.dsh-build'))
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'DSH test')
  await writeFile(join(root, '.gitignore'), '.dsh-build/\n')
  await writeFile(join(root, 'value.txt'), 'old')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'old')
  const old = git(root, 'rev-parse', 'HEAD')
  await writeFile(join(root, 'value.txt'), 'target')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'target')
  const target = git(root, 'rev-parse', 'HEAD')
  git(root, 'reset', '--hard', old)
  return {
    old,
    target,
    request: {
      formatVersion: 1,
      operationId: 'operation',
      repositoryRoot: root,
      expectedHead: old,
      targetCommit: target,
      branch: 'main',
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
      parentPid: 123,
      parentExitTimeoutMs: 100,
      pollIntervalMs: 1,
      commandTimeoutMs: 5_000,
      statusPath: join(root, '.dsh-build', 'update-state.json'),
      buildCommands: [{ command: 'build', args: ['locked'] }],
      launch: { command: 'node', args: ['start.js'], cwd: root, awaitExit: false },
    },
  }
}

function gitRun(command: UpdateWorkerCommand, request: UpdateWorkerRequest): void {
  if (command.command === 'git') execFileSync('git', command.args, { cwd: request.repositoryRoot })
}

async function phase(request: UpdateWorkerRequest): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(request.statusPath, 'utf8')) as Record<string, unknown>
}

describe('update worker', () => {
  it('fast-forwards, runs the locked build, relaunches, and records success', async () => {
    const { request, target } = await fixture()
    const supervisedRequest = { ...request, launch: { ...request.launch, awaitExit: true } }
    const commands: UpdateWorkerCommand[] = []
    const launch = vi.fn()
    await runUpdateWorker(supervisedRequest, {
      processIsAlive: () => false,
      run: (command, owner) => { commands.push(command); gitRun(command, owner) },
      launch,
      now: () => new Date('2026-09-03T01:00:00Z'),
    })
    expect(git(supervisedRequest.repositoryRoot, 'rev-parse', 'HEAD')).toBe(target)
    expect(commands).toContainEqual({ command: 'build', args: ['locked'] })
    expect(launch).toHaveBeenCalledWith(supervisedRequest.launch, supervisedRequest)
    expect(await phase(supervisedRequest)).toMatchObject({ phase: 'succeeded', fromVersion: '0.1.0', toVersion: '0.2.0' })
  })

  it('rolls back and relaunches when a build fails while the target tree stays clean', async () => {
    const { request, old } = await fixture()
    let builds = 0
    const launch = vi.fn()
    await runUpdateWorker(request, {
      processIsAlive: () => false,
      run: (command, owner) => {
        gitRun(command, owner)
        if (command.command === 'build' && builds++ === 0) throw new Error('build failed')
      },
      launch,
    })
    expect(git(request.repositoryRoot, 'rev-parse', 'HEAD')).toBe(old)
    expect(builds).toBe(2)
    expect(launch).toHaveBeenCalledOnce()
    expect(await phase(request)).toMatchObject({ phase: 'rolled-back', error: 'build failed' })
  })

  it('does not erase edits made after the fast-forward', async () => {
    const { request, target } = await fixture()
    await runUpdateWorker(request, {
      processIsAlive: () => false,
      run: (command, owner) => {
        gitRun(command, owner)
        if (command.command === 'build') {
          execFileSync(process.execPath, ['-e', "require('fs').writeFileSync('mine.txt','mine')"], { cwd: owner.repositoryRoot })
          throw new Error('build failed after edit')
        }
      },
      launch: vi.fn(),
    })
    expect(git(request.repositoryRoot, 'rev-parse', 'HEAD')).toBe(target)
    expect(await readFile(join(request.repositoryRoot, 'mine.txt'), 'utf8')).toBe('mine')
    expect(await phase(request)).toMatchObject({ phase: 'failed', error: 'build failed after edit' })
  })

  it('rejects paths outside .dsh-build before executing commands', async () => {
    const { request } = await fixture()
    expect(() => parseWorkerRequest({ ...request, statusPath: join(request.repositoryRoot, 'outside.json') }))
      .toThrow('invalid DSH update worker request')
    expect(parseWorkerRequest(request)).toEqual(request)
  })
})
