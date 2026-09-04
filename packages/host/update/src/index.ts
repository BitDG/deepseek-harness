/** GitHub Release discovery and guarded source-checkout updates over Typert Remote. */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { ReleaseCatalog, type ReleaseCatalogConfig, type ReleaseSelection } from './release-catalog.ts'
import {
  downloadAvailability, downloadedTarget, downloadTarget, inspectCheckout, installAvailability,
  type CheckoutConfig, type CheckoutState,
} from './source-checkout.ts'
import { runCommand, type CommandRunner } from './command.ts'
import { startUpdateWorker, type StartedUpdateWorker, type WorkerConfig, type WorkerLaunchContext } from './worker-host.ts'
import type {
  DshReleaseView, DshUpdateSnapshot, UpdateBlocker, UpdateInstallReceipt, UpdateOperationView,
} from './types.ts'

export type * from './types.ts'

const DEFAULT_API_BASE = 'https://api.github.com'
const DEFAULT_OWNER = 'deepseek-ai'
const DEFAULT_REPOSITORY = 'deepseek-harness'
const DEFAULT_REMOTE = 'origin'
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_CACHE_TTL_MS = 5 * 60_000
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_PAGES = 5
const DEFAULT_WORKER_READY_TIMEOUT_MS = 5_000
const DEFAULT_PARENT_EXIT_TIMEOUT_MS = 30_000
const DEFAULT_WORKER_POLL_INTERVAL_MS = 100
const DEFAULT_COMMAND_TIMEOUT_MS = 20 * 60_000
const DEFAULT_EXIT_DELAY_MS = 500

/** GitHub, Git, and update-worker policy. */
export interface Config {
  /** GitHub REST API origin used for Release discovery. */
  readonly apiBase?: string
  /** GitHub organization that owns the release repository. */
  readonly owner?: string
  /** GitHub repository whose `dsh-v*` Releases are eligible. */
  readonly repository?: string
  /** Git remote used to fetch an exact eligible tag. */
  readonly remote?: string
  /** Whether Release discovery may offer prerelease versions. */
  readonly includePrereleases?: boolean
  /** Maximum duration of one GitHub request in milliseconds. */
  readonly requestTimeoutMs?: number
  /** Duration of the validated in-process Release cache in milliseconds. */
  readonly cacheTtlMs?: number
  /** Maximum accepted bytes in one GitHub Releases response page. */
  readonly maxResponseBytes?: number
  /** Maximum number of GitHub Release pages read by one check. */
  readonly maxPages?: number
  /** Maximum wait for the detached worker's IPC readiness acknowledgement. */
  readonly workerReadyTimeoutMs?: number
  /** Maximum wait for the current DSH process to exit before mutation. */
  readonly parentExitTimeoutMs?: number
  /** Interval between parent-process exit probes in milliseconds. */
  readonly workerPollIntervalMs?: number
  /** Maximum duration of each install, build, or Git worker command. */
  readonly commandTimeoutMs?: number
  /** Delay after an install response before requesting graceful Host exit. */
  readonly exitDelayMs?: number
}

interface ResolvedConfig extends ReleaseCatalogConfig, CheckoutConfig, WorkerConfig {
  readonly exitDelayMs: number
}

/** Replaceable host integrations for focused tests. */
export interface UpdateGatewayInternals {
  readonly fetch?: typeof fetch
  readonly runCommand?: CommandRunner
  readonly packageManifestPath?: string
  readonly now?: () => number
  readonly startWorker?: typeof startUpdateWorker
  readonly launchContext?: WorkerLaunchContext
}

const operationSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().min(1),
  fromVersion: z.string().min(1),
  toVersion: z.string().min(1),
  phase: z.enum(['waiting', 'applying', 'building', 'restarting', 'succeeded', 'rolled-back', 'failed']),
  updatedAt: z.string().min(1),
  error: z.string().optional(),
})

function resolveConfig(config: Config): ResolvedConfig {
  return {
    apiBase: config.apiBase ?? DEFAULT_API_BASE,
    owner: config.owner ?? DEFAULT_OWNER,
    repository: config.repository ?? DEFAULT_REPOSITORY,
    remote: config.remote ?? DEFAULT_REMOTE,
    includePrereleases: config.includePrereleases ?? true,
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    cacheTtlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    maxResponseBytes: config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    maxPages: config.maxPages ?? DEFAULT_MAX_PAGES,
    readyTimeoutMs: config.workerReadyTimeoutMs ?? DEFAULT_WORKER_READY_TIMEOUT_MS,
    parentExitTimeoutMs: config.parentExitTimeoutMs ?? DEFAULT_PARENT_EXIT_TIMEOUT_MS,
    pollIntervalMs: config.workerPollIntervalMs ?? DEFAULT_WORKER_POLL_INTERVAL_MS,
    commandTimeoutMs: config.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    exitDelayMs: config.exitDelayMs ?? DEFAULT_EXIT_DELAY_MS,
  }
}

function operationOf(state: CheckoutState): UpdateOperationView | undefined {
  if (state.root === undefined) return undefined
  const path = join(state.root, '.dsh-build', 'update-state.json')
  if (!existsSync(path)) return undefined
  try {
    const parsed = operationSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    if (!parsed.success) return undefined
    const { formatVersion: _formatVersion, ...view } = parsed.data
    return view as UpdateOperationView
  } catch {
    return undefined
  }
}

function rejected(
  reason: UpdateBlocker | 'download-failed' | 'release-check-failed' | 'worker-start-failed',
  message: string,
  cause?: unknown,
): RemoteError {
  return new RemoteError('update/rejected', message, { reason }, cause === undefined ? {} : { cause })
}

/** Remote-only Host owner of the `update` namespace. */
export class UpdateGateway extends TypertRemoteService {
  static inject = ['appExit', 'cmdlineArgs']

  static Config: Schema<Config> = Schema.object({
    apiBase: Schema.string().default(DEFAULT_API_BASE),
    owner: Schema.string().default(DEFAULT_OWNER),
    repository: Schema.string().default(DEFAULT_REPOSITORY),
    remote: Schema.string().default(DEFAULT_REMOTE),
    includePrereleases: Schema.boolean().default(true),
    requestTimeoutMs: Schema.natural().min(1).default(DEFAULT_REQUEST_TIMEOUT_MS),
    cacheTtlMs: Schema.natural().min(1).default(DEFAULT_CACHE_TTL_MS),
    maxResponseBytes: Schema.natural().min(1).default(DEFAULT_MAX_RESPONSE_BYTES),
    maxPages: Schema.natural().min(1).default(DEFAULT_MAX_PAGES),
    workerReadyTimeoutMs: Schema.natural().min(1).default(DEFAULT_WORKER_READY_TIMEOUT_MS),
    parentExitTimeoutMs: Schema.natural().min(1).default(DEFAULT_PARENT_EXIT_TIMEOUT_MS),
    workerPollIntervalMs: Schema.natural().min(1).default(DEFAULT_WORKER_POLL_INTERVAL_MS),
    commandTimeoutMs: Schema.natural().min(1).default(DEFAULT_COMMAND_TIMEOUT_MS),
    exitDelayMs: Schema.natural().min(1).default(DEFAULT_EXIT_DELAY_MS),
  })

  private readonly config: ResolvedConfig
  private readonly catalog: ReleaseCatalog
  private readonly runner: CommandRunner
  private readonly packageManifestPath: string
  private readonly startWorker: typeof startUpdateWorker
  private readonly launchContext: WorkerLaunchContext
  private installPending = false

  /** @param ctx - Host context carrying launcher exit and argument facts. */
  constructor(ctx: Context, config: Config = {}, internals: UpdateGatewayInternals = {}) {
    super(ctx, 'update')
    this.config = resolveConfig(config)
    this.runner = internals.runCommand ?? runCommand
    this.packageManifestPath = internals.packageManifestPath
      ?? fileURLToPath(new URL('../package.json', import.meta.url))
    this.catalog = new ReleaseCatalog(this.config, internals.fetch, internals.now)
    this.startWorker = internals.startWorker ?? startUpdateWorker
    const cmdlineArgs = ctx.get('cmdlineArgs')
    if (cmdlineArgs === undefined) throw new Error('dsh update requires ctx.cmdlineArgs')
    this.launchContext = internals.launchContext ?? {
      processId: process.pid,
      execPath: process.execPath,
      execArgv: process.execArgv,
      argv: process.argv,
      cwd: process.cwd(),
      platform: process.platform,
      environment: process.env,
      cmdlineArgs,
    }
  }

  /**
   * Compare the running DSH version with GitHub Releases and return every
   * intermediate release note through the newest offered version.
   * @param force - bypass the short process cache for an explicit refresh.
   * @param signal - caller cancellation.
   * @returns current checkout, action availability, and release notes.
   */
  @Remote
  async check(force: boolean, signal: AbortSignal): Promise<DshUpdateSnapshot> {
    try {
      const state = await inspectCheckout(this.packageManifestPath, this.config, this.runner, signal)
      const selection = await this.catalog.select(state.currentVersion, force, signal)
      return await this.snapshot(state, selection, signal)
    } catch (error) {
      if (signal.aborted) throw error
      throw rejected('release-check-failed', `DSH update check failed: ${error instanceof Error ? error.message : String(error)}`, error)
    }
  }

  /**
   * Fetch one exact offered GitHub tag without changing the working tree.
   * Dirty source checkouts may download; package installs and unofficial
   * origins are rejected.
   * @param tag - exact offered `dsh-v*` Release tag.
   * @param signal - caller cancellation.
   * @returns refreshed checkout and download state.
   */
  @Remote
  async download(tag: string, signal: AbortSignal): Promise<DshUpdateSnapshot> {
    const { state, selection, release } = await this.resolveRelease(tag, signal)
    const availability = downloadAvailability(state, true)
    if (!availability.allowed) {
      if (availability.blocker === undefined) throw new Error('blocked update download has no reason')
      throw rejected(availability.blocker, `DSH update download is blocked: ${availability.blocker}`)
    }
    try {
      await downloadTarget(state, release, this.config, this.runner, signal)
      const fresh = await inspectCheckout(this.packageManifestPath, this.config, this.runner, signal)
      return await this.snapshot(fresh, selection, signal)
    } catch (error) {
      if (signal.aborted) throw error
      throw rejected('download-failed', `DSH update download failed: ${error instanceof Error ? error.message : String(error)}`, error)
    }
  }

  /**
   * Hand a clean, downloaded, fast-forward target to a detached worker, then
   * request graceful Host shutdown after the Remote response can flush.
   * @param tag - exact downloaded `dsh-v*` Release tag.
   * @param signal - caller cancellation.
   * @returns accepted update operation identity.
   */
  @Remote
  async apply(tag: string, signal: AbortSignal): Promise<UpdateInstallReceipt> {
    const { state, release } = await this.resolveRelease(tag, signal)
    const target = await downloadedTarget(state, release, this.runner, signal)
    const availability = installAvailability(state, target, release, this.installPending)
    if (!availability.allowed) {
      if (availability.blocker === undefined) throw new Error('blocked update install has no reason')
      throw rejected(availability.blocker, `DSH update install is blocked: ${availability.blocker}`)
    }
    if (target === undefined) throw new Error('downloaded update target disappeared after install preflight')
    let started: StartedUpdateWorker
    try {
      started = await this.startWorker(state, target, release, this.config, this.launchContext)
    } catch (error) {
      throw rejected('worker-start-failed', `DSH update worker failed to start: ${error instanceof Error ? error.message : String(error)}`, error)
    }
    this.installPending = true
    const exit = this.ctx.get('appExit')
    if (exit === undefined) throw new Error('dsh update requires ctx.appExit')
    const timer = setTimeout(() => { exit(0) }, this.config.exitDelayMs)
    timer.unref()
    return { operationId: started.operationId, restarting: true }
  }

  private async resolveRelease(tag: string, signal: AbortSignal): Promise<{
    state: CheckoutState
    selection: ReleaseSelection
    release: DshReleaseView
  }> {
    const state = await inspectCheckout(this.packageManifestPath, this.config, this.runner, signal)
    const selection = await this.catalog.select(state.currentVersion, false, signal)
    const release = selection.releases.find(candidate => candidate.tag === tag)
    if (release === undefined) throw rejected('version-mismatch', `GitHub Release ${tag} is not newer than DSH ${state.currentVersion}`)
    return { state, selection, release }
  }

  private async snapshot(
    state: CheckoutState,
    selection: ReleaseSelection,
    signal: AbortSignal,
  ): Promise<DshUpdateSnapshot> {
    const target = selection.target === undefined
      ? undefined
      : await downloadedTarget(state, selection.target, this.runner, signal)
    const lastOperation = operationOf(state)
    return {
      currentVersion: state.currentVersion,
      ...(state.head === undefined ? {} : { currentCommit: state.head }),
      installation: state.installation,
      ...(state.branch === undefined ? {} : { branch: state.branch }),
      dirty: state.dirty,
      status: selection.target === undefined ? 'up-to-date' : 'update-available',
      ...(selection.target === undefined ? {} : {
        targetVersion: selection.target.version,
        targetTag: selection.target.tag,
      }),
      targetDownloaded: target !== undefined,
      releases: selection.releases,
      ...(selection.compareUrl === undefined ? {} : { compareUrl: selection.compareUrl }),
      download: downloadAvailability(state, selection.target !== undefined),
      install: installAvailability(state, target, selection.target, this.installPending),
      ...(lastOperation === undefined ? {} : { lastOperation }),
    }
  }
}

export default UpdateGateway
