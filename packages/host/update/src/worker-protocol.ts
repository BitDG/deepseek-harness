/** Validated process request shared by the update Host and detached worker. */

import { isAbsolute, relative, resolve } from 'node:path'

/** One argv-only command the worker executes from the repository root. */
export interface UpdateWorkerCommand {
  readonly command: string
  readonly args: readonly string[]
}

/** Relaunch command after a successful update or rollback. */
export interface UpdateWorkerLaunch extends UpdateWorkerCommand {
  readonly cwd: string
  /** A supervising launcher exits only after it verifies readiness. */
  readonly awaitExit: boolean
}

/** Complete handoff written to an owner-only file before the Host exits. */
export interface UpdateWorkerRequest {
  readonly formatVersion: 1
  readonly operationId: string
  readonly repositoryRoot: string
  readonly expectedHead: string
  readonly targetCommit: string
  readonly branch: string
  readonly fromVersion: string
  readonly toVersion: string
  readonly parentPid: number
  readonly parentExitTimeoutMs: number
  readonly pollIntervalMs: number
  readonly commandTimeoutMs: number
  readonly statusPath: string
  readonly buildCommands: readonly UpdateWorkerCommand[]
  readonly launch: UpdateWorkerLaunch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function commandOf(value: unknown): UpdateWorkerCommand | undefined {
  if (!isRecord(value) || typeof value.command !== 'string' || value.command.length === 0) return undefined
  if (!Array.isArray(value.args) || !value.args.every(arg => typeof arg === 'string')) return undefined
  return { command: value.command, args: value.args }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function inside(root: string, path: string): boolean {
  const child = relative(root, path)
  return child !== '' && !child.startsWith('..') && resolve(root, child) === path
}

/**
 * Validate a durable/process-boundary worker request before any Git command.
 * @param value - parsed request JSON.
 * @returns a detached request value.
 */
export function parseWorkerRequest(value: unknown): UpdateWorkerRequest {
  if (!isRecord(value)
    || value.formatVersion !== 1
    || typeof value.operationId !== 'string' || value.operationId.length === 0
    || typeof value.repositoryRoot !== 'string' || !isAbsolute(value.repositoryRoot)
    || typeof value.expectedHead !== 'string' || !/^[a-f\d]{40,64}$/iu.test(value.expectedHead)
    || typeof value.targetCommit !== 'string' || !/^[a-f\d]{40,64}$/iu.test(value.targetCommit)
    || typeof value.branch !== 'string' || value.branch.length === 0
    || typeof value.fromVersion !== 'string' || value.fromVersion.length === 0
    || typeof value.toVersion !== 'string' || value.toVersion.length === 0
    || !positiveInteger(value.parentPid)
    || !positiveInteger(value.parentExitTimeoutMs)
    || !positiveInteger(value.pollIntervalMs)
    || !positiveInteger(value.commandTimeoutMs)
    || typeof value.statusPath !== 'string' || !isAbsolute(value.statusPath)
    || !inside(resolve(value.repositoryRoot, '.dsh-build'), value.statusPath)
    || !Array.isArray(value.buildCommands)) {
    throw new Error('invalid DSH update worker request')
  }
  const buildCommands = value.buildCommands.map(commandOf)
  const launchCommand = commandOf(value.launch)
  if (buildCommands.some(command => command === undefined)
    || launchCommand === undefined
    || !isRecord(value.launch)
    || typeof value.launch.cwd !== 'string' || !isAbsolute(value.launch.cwd)
    || typeof value.launch.awaitExit !== 'boolean') {
    throw new Error('invalid DSH update worker commands')
  }
  return {
    formatVersion: 1,
    operationId: value.operationId,
    repositoryRoot: value.repositoryRoot,
    expectedHead: value.expectedHead,
    targetCommit: value.targetCommit,
    branch: value.branch,
    fromVersion: value.fromVersion,
    toVersion: value.toVersion,
    parentPid: value.parentPid,
    parentExitTimeoutMs: value.parentExitTimeoutMs,
    pollIntervalMs: value.pollIntervalMs,
    commandTimeoutMs: value.commandTimeoutMs,
    statusPath: value.statusPath,
    buildCommands: buildCommands as UpdateWorkerCommand[],
    launch: {
      ...launchCommand,
      cwd: value.launch.cwd,
      awaitExit: value.launch.awaitExit,
    },
  }
}
