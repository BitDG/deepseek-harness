/** Host-side creation and readiness handoff for the detached update worker. */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CmdlineArgs } from '@deepseek-ai/dsh-cmdline'
import type { CheckoutState, DownloadedTarget } from './source-checkout.ts'
import type { DshReleaseView, UpdateOperationId } from './types.ts'
import type { UpdateWorkerCommand, UpdateWorkerRequest } from './worker-protocol.ts'

/** Process timings passed from validated plugin configuration. */
export interface WorkerConfig {
  readonly readyTimeoutMs: number
  readonly parentExitTimeoutMs: number
  readonly pollIntervalMs: number
  readonly commandTimeoutMs: number
}

/** Facts needed to preserve the current DSH invocation after an update. */
export interface WorkerLaunchContext {
  readonly processId: number
  readonly execPath: string
  readonly execArgv: readonly string[]
  readonly argv: readonly string[]
  readonly cwd: string
  readonly platform: NodeJS.Platform
  readonly environment: NodeJS.ProcessEnv
  readonly cmdlineArgs: CmdlineArgs
}

/** Accepted worker process and operation identity. */
export interface StartedUpdateWorker {
  readonly operationId: UpdateOperationId
}

function assertDirectory(path: string): void {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`DSH update state path is not a real directory: ${path}`)
  }
}

function corepackCommands(execPath: string): UpdateWorkerCommand[] {
  const corepack = join(dirname(execPath), 'node_modules', 'corepack', 'dist', 'corepack.js')
  if (!existsSync(corepack)) throw new Error(`Corepack is unavailable beside Node at ${corepack}`)
  return [
    { command: execPath, args: [corepack, 'pnpm', 'install', '--frozen-lockfile'] },
    { command: execPath, args: [corepack, 'pnpm', 'run', 'build'] },
  ]
}

function launchCommand(root: string, context: WorkerLaunchContext): UpdateWorkerRequest['launch'] {
  const windowsLauncher = resolve(root, 'scripts', 'start-windows.mjs')
  if (context.platform === 'win32'
    && context.environment.DSH_START_WINDOWS_INTERRUPT_FILE !== undefined
    && existsSync(windowsLauncher)) {
    return {
      command: context.execPath,
      args: [windowsLauncher, ...context.cmdlineArgs.get()],
      cwd: root,
      awaitExit: true,
    }
  }
  return {
    command: context.execPath,
    args: [...context.execArgv, ...context.argv.slice(1)],
    cwd: context.cwd,
    awaitExit: false,
  }
}

function workerArguments(): string[] {
  const source = import.meta.url.endsWith('/worker-host.ts') || import.meta.url.endsWith('\\worker-host.ts')
  const worker = fileURLToPath(new URL(source ? './update-worker.ts' : './types/update-worker.js', import.meta.url))
  return source ? ['--import', import.meta.resolve('tsx/esm'), worker] : [worker]
}

/**
 * Spawn the update worker and wait for its IPC readiness acknowledgement.
 * The acknowledgement means the complete worker module and owner-only request
 * were read before the Host begins shutdown.
 * @param state - clean named-branch source-checkout facts.
 * @param target - downloaded fast-forward target.
 * @param release - selected GitHub Release.
 * @param config - worker timeouts.
 * @param context - current process and launcher invocation.
 * @returns accepted update operation identity.
 */
export async function startUpdateWorker(
  state: CheckoutState,
  target: DownloadedTarget,
  release: DshReleaseView,
  config: WorkerConfig,
  context: WorkerLaunchContext,
): Promise<StartedUpdateWorker> {
  if (state.root === undefined || state.head === undefined || state.branch === undefined) {
    throw new Error('source checkout facts are incomplete')
  }
  const buildRoot = join(state.root, '.dsh-build')
  mkdirSync(buildRoot, { recursive: true })
  assertDirectory(buildRoot)
  const requestRoot = mkdtempSync(join(buildRoot, 'update-'))
  const operationId = randomUUID() as UpdateOperationId
  const requestPath = join(requestRoot, 'request.json')
  const statusPath = join(buildRoot, 'update-state.json')
  const logPath = join(buildRoot, `update-${operationId}.log`)
  const request: UpdateWorkerRequest = {
    formatVersion: 1,
    operationId,
    repositoryRoot: state.root,
    expectedHead: state.head,
    targetCommit: target.commit,
    branch: state.branch,
    fromVersion: state.currentVersion,
    toVersion: release.version,
    parentPid: context.processId,
    parentExitTimeoutMs: config.parentExitTimeoutMs,
    pollIntervalMs: config.pollIntervalMs,
    commandTimeoutMs: config.commandTimeoutMs,
    statusPath,
    buildCommands: corepackCommands(context.execPath),
    launch: launchCommand(state.root, context),
  }
  const requestHandle = openSync(requestPath, 'wx', 0o600)
  try {
    writeFileSync(requestHandle, `${JSON.stringify(request, undefined, 2)}\n`)
  } finally {
    closeSync(requestHandle)
  }
  const logHandle = openSync(logPath, 'wx', 0o600)
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(context.execPath, [...workerArguments(), requestPath], {
      cwd: state.root,
      detached: true,
      env: context.environment,
      stdio: ['ignore', logHandle, logHandle, 'ipc'],
      windowsHide: true,
    })
  } finally {
    closeSync(logHandle)
  }
  await new Promise<void>((resolveReady, rejectReady) => {
    let settled = false
    let readinessError: Error | undefined
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.removeListener('message', onMessage)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      if (error === undefined) resolveReady()
      else rejectReady(error)
    }
    const onMessage = (message: unknown): void => {
      if (typeof message !== 'object' || message === null
        || Reflect.get(message, 'type') !== 'ready'
        || Reflect.get(message, 'operationId') !== operationId) return
      finish()
    }
    const onError = (error: Error): void => { finish(error) }
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(readinessError ?? new Error(`update worker exited before readiness: ${signal ?? String(code)}`))
    }
    const timeout = setTimeout(() => {
      readinessError = new Error(`update worker did not become ready within ${String(config.readyTimeoutMs)} ms`)
      if (!child.kill()) finish(readinessError)
    }, config.readyTimeoutMs)
    child.on('message', onMessage)
    child.once('error', onError)
    child.once('exit', onExit)
  })
  child.unref()
  return { operationId }
}
