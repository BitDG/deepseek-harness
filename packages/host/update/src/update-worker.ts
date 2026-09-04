/** Post-shutdown source updater: exact fast-forward, locked build, relaunch, and guarded rollback. */

import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkerRequest, type UpdateWorkerCommand, type UpdateWorkerRequest } from './worker-protocol.ts'

type WorkerPhase = 'waiting' | 'applying' | 'building' | 'restarting' | 'succeeded' | 'rolled-back' | 'failed'

/** Replaceable worker operations used by deterministic source-checkout tests. */
export interface UpdateWorkerInternals {
  readonly run?: (command: UpdateWorkerCommand, request: UpdateWorkerRequest) => void
  readonly launch?: (command: UpdateWorkerRequest['launch'], request: UpdateWorkerRequest) => void
  readonly processIsAlive?: (pid: number) => boolean
  readonly delay?: (milliseconds: number) => Promise<void>
  readonly now?: () => Date
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (errorCode(error) === 'ESRCH') return false
    if (errorCode(error) === 'EPERM') return true
    throw error
  }
}

function run(command: UpdateWorkerCommand, request: UpdateWorkerRequest): void {
  const result = spawnSync(command.command, command.args, {
    cwd: request.repositoryRoot,
    env: command.command === 'git'
      ? { ...process.env, GIT_TERMINAL_PROMPT: '0', LANG: 'C', LC_ALL: 'C' }
      : process.env,
    stdio: 'inherit',
    timeout: request.commandTimeoutMs,
    windowsHide: false,
  })
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    throw new Error(`${command.command} ${command.args.join(' ')} failed: ${result.error?.message ?? (result.signal === null ? `exit ${String(result.status)}` : result.signal)}`)
  }
}

function captureGit(request: UpdateWorkerRequest, args: readonly string[]): string {
  const result = spawnSync('git', args, {
    cwd: request.repositoryRoot,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: request.commandTimeoutMs,
    windowsHide: true,
  })
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    const detail = result.error?.message ?? (result.stderr.trim() || `exit ${String(result.status)}`)
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
  return result.stdout.trim()
}

function launch(command: UpdateWorkerRequest['launch'], request: UpdateWorkerRequest): void {
  if (command.awaitExit) {
    run(command, { ...request, repositoryRoot: command.cwd })
    return
  }
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    detached: true,
    env: process.env,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function assertRegularFile(path: string): void {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`update state target is not a regular single-link file: ${path}`)
  }
}

/** Publish one updater phase without following a replaced status path. */
function writeStatus(
  request: UpdateWorkerRequest,
  phase: WorkerPhase,
  now: () => Date,
  error?: string,
): void {
  const temporary = `${request.statusPath}.${request.operationId}.tmp`
  const handle = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(handle, `${JSON.stringify({
      formatVersion: 1,
      id: request.operationId,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      phase,
      updatedAt: now().toISOString(),
      ...(error === undefined ? {} : { error }),
    }, undefined, 2)}\n`)
  } finally {
    closeSync(handle)
  }
  try {
    if (existsSync(request.statusPath)) {
      assertRegularFile(request.statusPath)
      unlinkSync(request.statusPath)
    }
    renameSync(temporary, request.statusPath)
  } catch (cause) {
    try {
      unlinkSync(temporary)
    } catch (cleanupError) {
      if (errorCode(cleanupError) !== 'ENOENT') throw new AggregateError([cause, cleanupError])
    }
    throw cause
  }
}

/** Wait until the Host process has fully exited before touching its checkout. */
async function waitForParent(
  request: UpdateWorkerRequest,
  alive: (pid: number) => boolean,
  delay: (milliseconds: number) => Promise<void>,
): Promise<void> {
  const deadline = Date.now() + request.parentExitTimeoutMs
  while (alive(request.parentPid)) {
    if (Date.now() >= deadline) throw new Error(`DSH process ${String(request.parentPid)} did not exit before the update deadline`)
    await delay(request.pollIntervalMs)
  }
}

/** Re-read the exact clean branch and commit that authorized the update. */
function assertPreflight(request: UpdateWorkerRequest): void {
  const reportedRoot = resolve(captureGit(request, ['rev-parse', '--show-toplevel']))
  if (reportedRoot !== resolve(request.repositoryRoot)) throw new Error('update worker repository root changed')
  if (captureGit(request, ['rev-parse', 'HEAD']) !== request.expectedHead) throw new Error('checkout HEAD changed before update')
  if (captureGit(request, ['symbolic-ref', '--quiet', '--short', 'HEAD']) !== request.branch) {
    throw new Error('checkout branch changed before update')
  }
  if (captureGit(request, ['status', '--porcelain=v1', '--untracked-files=normal']) !== '') {
    throw new Error('checkout became dirty before update')
  }
  if (captureGit(request, ['rev-parse', `${request.targetCommit}^{commit}`]) !== request.targetCommit) {
    throw new Error('downloaded update commit changed before update')
  }
}

/** Whether rollback can overwrite only the exact clean target tree the updater produced. */
function canRollback(request: UpdateWorkerRequest): boolean {
  try {
    return captureGit(request, ['rev-parse', 'HEAD']) === request.targetCommit
      && captureGit(request, ['symbolic-ref', '--quiet', '--short', 'HEAD']) === request.branch
      && captureGit(request, ['status', '--porcelain=v1', '--untracked-files=normal']) === ''
  } catch {
    return false
  }
}

/**
 * Execute one validated update request. The worker rolls back only while the
 * target checkout remains byte-for-byte clean, so it cannot erase edits made
 * after the Host stopped.
 * @param request - exact source commit, build, and relaunch request.
 * @param internals - deterministic process replacements for tests.
 */
export async function runUpdateWorker(
  request: UpdateWorkerRequest,
  internals: UpdateWorkerInternals = {},
): Promise<void> {
  const execute = internals.run ?? run
  const relaunch = internals.launch ?? launch
  const alive = internals.processIsAlive ?? processIsAlive
  const delay = internals.delay ?? (milliseconds => new Promise((resolveDelay) => { setTimeout(resolveDelay, milliseconds) }))
  const now = internals.now ?? (() => new Date())
  let merged = false
  writeStatus(request, 'waiting', now)
  try {
    await waitForParent(request, alive, delay)
    assertPreflight(request)
    writeStatus(request, 'applying', now)
    execute({ command: 'git', args: ['merge', '--ff-only', request.targetCommit] }, request)
    merged = true
    writeStatus(request, 'building', now)
    for (const command of request.buildCommands) execute(command, request)
    writeStatus(request, 'restarting', now)
    relaunch(request.launch, request)
    if (request.launch.awaitExit) writeStatus(request, 'succeeded', now)
  } catch (error) {
    const failure = messageOf(error)
    if (merged && canRollback(request)) {
      try {
        execute({ command: 'git', args: ['reset', '--hard', request.expectedHead] }, request)
        for (const command of request.buildCommands) execute(command, request)
        relaunch(request.launch, request)
        writeStatus(request, 'rolled-back', now, failure)
        return
      } catch (rollbackError) {
        writeStatus(request, 'failed', now, `${failure}; rollback failed: ${messageOf(rollbackError)}`)
        return
      }
    }
    writeStatus(request, 'failed', now, failure)
  }
}

async function main(): Promise<void> {
  const requestPath = process.argv[2]
  if (requestPath === undefined) throw new Error('DSH update worker requires a request path')
  assertRegularFile(requestPath)
  const request = parseWorkerRequest(JSON.parse(readFileSync(requestPath, 'utf8')))
  if (process.send === undefined) throw new Error('DSH update worker requires an IPC readiness channel')
  process.send({ type: 'ready', operationId: request.operationId })
  process.disconnect()
  await runUpdateWorker(request)
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(`dsh update worker failed: ${messageOf(error)}`)
    process.exitCode = 1
  })
}
