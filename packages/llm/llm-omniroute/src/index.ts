/**
 * Managed local OmniRoute lifecycle and one-click `llm-pi-ai` route onboarding.
 *
 * The plugin adopts a healthy endpoint without claiming ownership, starts a
 * missing local service through the subprocess seam, and only stops the child
 * it created. Model requests remain entirely owned by `llm-pi-ai`.
 * @module @deepseek-ai/dsh-llm-omniroute
 */

import { stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { SettingsDescriptor, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { OmniRouteConnectValue, OmniRouteStatus, OmniRouteStopValue } from './types.ts'

export type * from './types.ts'

/** Route key written into `llm-pi-ai.providers`. */
export const OMNIROUTE_PROVIDER = 'omniroute'

const PI_AI_NAMESPACE = 'llm-pi-ai'
const HEALTH_PATH = '/api/health/ping'
const API_PATH = '/v1'
const HEALTH_BODY_LIMIT = 16 * 1024
const DIAGNOSTIC_TAIL_BYTES = 64 * 1024

/** Deployment-varying OmniRoute executable, endpoint, and lifecycle bounds. */
export interface Config {
  /** Bare PATH command or absolute OmniRoute executable. */
  executable?: string
  /** Local OmniRoute dashboard origin; startup accepts loopback HTTP URLs only. */
  dashboardURL?: string
  /** Credential reference used for model discovery and requests. */
  apiKeyEnv?: string
  /** Maximum time to wait for a newly spawned service to become healthy. */
  startTimeoutMs?: number
  /** Per-request health probe timeout. */
  healthTimeoutMs?: number
  /** Delay between startup health probes. */
  healthPollMs?: number
  /** TERM-to-KILL grace for the plugin-owned process tree. */
  disposeGraceMs?: number
}

const DEFAULT_EXECUTABLE = 'omniroute'
const DEFAULT_DASHBOARD_URL = 'http://127.0.0.1:20128'
const DEFAULT_API_KEY_ENV = 'OMNIROUTE_API_KEY'
const DEFAULT_START_TIMEOUT_MS = 90_000
const DEFAULT_HEALTH_TIMEOUT_MS = 2_000
const DEFAULT_HEALTH_POLL_MS = 250
const DEFAULT_DISPOSE_GRACE_MS = 5_000

const MODEL_SOURCES = [
  { prefix: 'antigravity/', suffix: 'AGY' },
  { prefix: 'oc/', suffix: 'OPC' },
  { prefix: 'opencode-go/', suffix: 'OPC' },
] as const

/** User-configurable lifecycle values; security caps and protocol paths stay fixed. */
export const Config: Schema<Config> = Schema.object({
  executable: Schema.string().default(DEFAULT_EXECUTABLE),
  dashboardURL: Schema.string().default(DEFAULT_DASHBOARD_URL),
  apiKeyEnv: Schema.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  startTimeoutMs: Schema.natural().min(1).default(DEFAULT_START_TIMEOUT_MS),
  healthTimeoutMs: Schema.natural().min(1).default(DEFAULT_HEALTH_TIMEOUT_MS),
  healthPollMs: Schema.natural().min(1).default(DEFAULT_HEALTH_POLL_MS),
  disposeGraceMs: Schema.natural().min(1).default(DEFAULT_DISPOSE_GRACE_MS),
})

interface ResolvedConfig {
  readonly executable: string
  readonly dashboardURL: string
  readonly baseURL: string
  readonly apiKeyEnv: CredentialRef
  readonly port: number
  readonly startTimeoutMs: number
  readonly healthTimeoutMs: number
  readonly healthPollMs: number
  readonly disposeGraceMs: number
}

type EndpointProbe =
  | { readonly kind: 'healthy' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'occupied'; readonly message: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Resolve and validate the local-only startup target once at plugin load. */
function resolveConfig(config: Config): ResolvedConfig {
  const executable = config.executable ?? DEFAULT_EXECUTABLE
  if (executable.trim().length === 0) throw new TypeError('llm-omniroute: executable must not be blank')
  const raw = config.dashboardURL ?? DEFAULT_DASHBOARD_URL
  let dashboard: URL
  try {
    dashboard = new URL(raw)
  } catch (error: unknown) {
    throw new TypeError(`llm-omniroute: dashboardURL is invalid: ${messageOf(error)}`)
  }
  if (dashboard.protocol !== 'http:' || dashboard.username.length > 0 || dashboard.password.length > 0) {
    throw new TypeError('llm-omniroute: dashboardURL must be an unauthenticated loopback HTTP URL')
  }
  const host = dashboard.hostname.toLowerCase()
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
    throw new TypeError('llm-omniroute: dashboardURL must target localhost, 127.0.0.1, or [::1]')
  }
  if (dashboard.pathname !== '/' || dashboard.search.length > 0 || dashboard.hash.length > 0) {
    throw new TypeError('llm-omniroute: dashboardURL must contain only an origin')
  }
  const port = dashboard.port.length === 0 ? 80 : Number(dashboard.port)
  const origin = dashboard.origin
  return {
    executable,
    dashboardURL: origin,
    baseURL: `${origin}${API_PATH}`,
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    port,
    startTimeoutMs: config.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS,
    healthTimeoutMs: config.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS,
    healthPollMs: config.healthPollMs ?? DEFAULT_HEALTH_POLL_MS,
    disposeGraceMs: config.disposeGraceMs ?? DEFAULT_DISPOSE_GRACE_MS,
  }
}

/** Read a small JSON health body without trusting an occupied port's response size. */
async function readHealthBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (reader === undefined) return undefined
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const item = await reader.read()
    if (item.done) break
    size += item.value.byteLength
    if (size > HEALTH_BODY_LIMIT) {
      await reader.cancel()
      throw new Error(`health response exceeded ${String(HEALTH_BODY_LIMIT)} bytes`)
    }
    chunks.push(item.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(bytes)
  return text.length === 0 ? undefined : JSON.parse(text) as unknown
}

/** OmniRoute's public ping response carries its route-class header and status. */
function isOmniRouteHealth(response: Response, value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const status: unknown = Reflect.get(value, 'status')
  return response.headers.get('x-omniroute-route-class') === 'PUBLIC'
    && (status === 'ok' || status === 'healthy')
}

function profileModelCount(descriptor: SettingsDescriptor | undefined): number | undefined {
  if (descriptor === undefined || typeof descriptor.value !== 'object' || descriptor.value === null) return undefined
  const providers: unknown = Reflect.get(descriptor.value, 'providers')
  if (typeof providers !== 'object' || providers === null) return undefined
  const profile: unknown = Reflect.get(providers, OMNIROUTE_PROVIDER)
  if (typeof profile !== 'object' || profile === null) return undefined
  const models: unknown = Reflect.get(profile, 'models')
  return Array.isArray(models) ? models.length : 0
}

function modelProfile(
  model: LlmDiscoveredModel,
  suffix: typeof MODEL_SOURCES[number]['suffix'],
): Record<string, string | number> {
  const profile: Record<string, string | number> = {
    id: model.id,
    name: `${model.name ?? model.id} [${suffix}]`,
  }
  if (model.contextWindow !== undefined) profile.contextWindow = model.contextWindow
  if (model.maxTokens !== undefined) profile.maxTokens = model.maxTokens
  return profile
}

function selectedModelProfiles(models: readonly LlmDiscoveredModel[]): Array<Record<string, string | number>> {
  return models.flatMap((model) => {
    const source = MODEL_SOURCES.find(candidate => model.id.startsWith(candidate.prefix))
    return source === undefined ? [] : [modelProfile(model, source.suffix)]
  })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `omniroute` Remote namespace. */
    omniRoute: OmniRouteController
  }
}

/** Host service backing one-click OmniRoute lifecycle and provider onboarding. */
export class OmniRouteController extends TypertRemoteService {
  static Config = Config
  static inject = ['typert', 'subprocess', 'llm', 'settings', 'credentials']

  private readonly config: ResolvedConfig
  private child: SubprocessHandle | undefined
  private startOperation: Promise<OmniRouteConnectValue> | undefined
  private lastFailure: string | undefined
  private disposing = false

  /**
   * @param ctx - Host context carrying Typert, subprocess, LLM, settings, and credential services.
   * @param config - local executable, endpoint, and lifecycle bounds.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'omniRoute', { namespace: 'omniroute' })
    this.config = resolveConfig(config)
    ctx.effect(() => async () => { await this.disposeManaged() }, 'llm-omniroute: managed child teardown')
  }

  /**
   * Inspect the endpoint without starting a process or changing settings.
   * @param signal - caller cancellation.
   * @returns current endpoint, ownership, executable, and provider-profile facts.
   */
  @Remote
  async status(signal: AbortSignal): Promise<OmniRouteStatus> {
    const modelCount = this.connectedModelCount()
    if (this.startOperation !== undefined) return this.view('starting', true, modelCount)
    const probe = await this.probe(signal)
    if (probe.kind === 'healthy') {
      return this.view(this.child === undefined ? 'external' : 'managed', true, modelCount)
    }
    const executable = await this.executableAvailable(signal)
    if (probe.kind === 'occupied') return this.view('failed', executable, modelCount, probe.message)
    if (this.lastFailure !== undefined) return this.view('failed', executable, modelCount, this.lastFailure)
    return this.view(executable ? 'stopped' : 'unavailable', executable, modelCount,
      executable ? undefined : this.installMessage())
  }

  /**
   * Adopt or silently start OmniRoute, select its Antigravity and OpenCode
   * models, and write one live `llm-pi-ai.providers.omniroute` profile.
   * @param signal - caller cancellation; a child created by a cancelled call is rolled back.
   * @returns managed/adopted state and the stored model count.
   * @throws RemoteError when the port is occupied by another service, startup fails, discovery fails, or settings refuse the profile.
   */
  @Remote
  startAndConnect(signal: AbortSignal): Promise<OmniRouteConnectValue> {
    if (this.startOperation !== undefined) return this.startOperation
    const operation = this.startAndConnectOnce(signal).finally(() => {
      if (this.startOperation === operation) this.startOperation = undefined
    })
    this.startOperation = operation
    return operation
  }

  /**
   * Stop only the process tree created by this plugin instance.
   * @param signal - caller cancellation while waiting for tree quiescence.
   * @returns stopped state; the provider profile remains configured.
   * @throws RemoteError when the healthy service is external or teardown does not settle.
   */
  @Remote
  async stop(signal: AbortSignal): Promise<OmniRouteStopValue> {
    const child = this.child
    if (child === undefined) {
      const probe = await this.probe(signal)
      if (probe.kind === 'healthy') {
        throw new RemoteError('gateway/bad-request', 'OmniRoute is externally managed; DeepSeek Harness will not stop it', {})
      }
      return { ...this.view('stopped', await this.executableAvailable(signal), this.connectedModelCount()), phase: 'stopped' }
    }
    child.terminate()
    const exited = await child.waitForExit(signal)
    if (!exited) throw new RemoteError('gateway/cancelled', 'waiting for the OmniRoute process tree was cancelled', {})
    if (this.child === child) this.child = undefined
    this.lastFailure = undefined
    return { ...this.view('stopped', true, this.connectedModelCount()), phase: 'stopped' }
  }

  private async startAndConnectOnce(signal: AbortSignal): Promise<OmniRouteConnectValue> {
    signal.throwIfAborted()
    let launchedHere = false
    try {
      const initial = await this.probe(signal)
      if (initial.kind === 'occupied') throw new Error(initial.message)
      const credential = await this.ctx.credentials.resolve(this.config.apiKeyEnv)
      if (credential === undefined) {
        throw new Error(`OmniRoute credential ${this.config.apiKeyEnv} is not configured`)
      }
      if (initial.kind === 'absent') {
        if (this.child === undefined) {
          this.child = await this.spawn(signal, credential.value)
          launchedHere = true
        }
        await this.waitUntilHealthy(this.child, signal)
      }
      const discovered = await this.ctx.llm.discoverModels(PI_AI_NAMESPACE, {
        baseURL: this.config.baseURL,
        api: 'openai-completions',
        apiKey: credential.value,
      }, signal)
      const models = selectedModelProfiles(discovered)
      if (models.length === 0) throw new Error('OmniRoute advertised no Antigravity or OpenCode models at /v1/models')
      await this.connect(models)
      this.lastFailure = undefined
      const phase = this.child === undefined ? 'external' : 'managed'
      return {
        ...this.view(phase, true, models.length),
        phase,
        connected: true,
        modelCount: models.length,
      }
    } catch (error: unknown) {
      if (launchedHere) await this.rollbackChild()
      const cancelled = signal.aborted
      const message = cancelled ? 'OmniRoute start and connection was cancelled' : messageOf(error)
      this.lastFailure = message
      throw new RemoteError(cancelled ? 'gateway/cancelled' : 'gateway/internal', message, {}, { cause: error })
    }
  }

  private async probe(signal: AbortSignal): Promise<EndpointProbe> {
    signal.throwIfAborted()
    const timeout = AbortSignal.timeout(this.config.healthTimeoutMs)
    const bound = AbortSignal.any([signal, timeout])
    let response: Response
    try {
      response = await fetch(`${this.config.dashboardURL}${HEALTH_PATH}`, {
        headers: { accept: 'application/json' },
        signal: bound,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      return { kind: 'absent' }
    }
    if (!response.ok) {
      return { kind: 'occupied', message: `${this.config.dashboardURL} answered ${String(response.status)} but not as a healthy OmniRoute service` }
    }
    try {
      const body = await readHealthBody(response)
      return isOmniRouteHealth(response, body)
        ? { kind: 'healthy' }
        : { kind: 'occupied', message: `${this.config.dashboardURL} answered an unrecognized health document; refusing to replace or stop that service` }
    } catch (error: unknown) {
      return { kind: 'occupied', message: `${this.config.dashboardURL} answered an invalid health document: ${messageOf(error)}` }
    }
  }

  private async spawn(signal: AbortSignal, apiKey: string): Promise<SubprocessHandle> {
    const launch = await this.resolveLaunch(signal)
    const child = this.ctx.subprocess.spawn({
      argv: [...launch, 'serve', '--port', String(this.config.port), '--no-open', '--no-tray'],
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: DIAGNOSTIC_TAIL_BYTES },
        stderr: { maxBytes: DIAGNOSTIC_TAIL_BYTES },
      },
      // Subprocess providers remove ambient secrets, so the managed CLI needs
      // its resolved key explicitly. Harness/Vite BASE_URL remains unrelated.
      env: { BASE_URL: undefined, OMNIROUTE_API_KEY: apiKey },
      graceMs: this.config.disposeGraceMs,
    })
    void child.done.then(
      (outcome) => { this.observeExit(child, outcome) },
      (error: unknown) => { this.observeSpawnFailure(child, error) },
    )
    return child
  }

  private async resolveLaunch(signal: AbortSignal): Promise<readonly string[]> {
    let executable: string
    try {
      executable = await this.ctx.subprocess.resolveExecutable(this.config.executable, undefined, signal)
    } catch (error: unknown) {
      throw new Error(`${this.installMessage()} (${messageOf(error)})`, { cause: error })
    }
    if (process.platform !== 'win32' || extname(executable).toLowerCase() !== '.cmd') return [executable]
    const expected = join(dirname(executable), 'node_modules', 'omniroute', 'bin', 'omniroute.mjs')
    try {
      if (!(await stat(expected)).isFile()) throw new Error('not a file')
    } catch (error: unknown) {
      throw new Error(`llm-omniroute: ${executable} is a Windows command shim, but ${expected} is missing`, { cause: error })
    }
    const node = await this.ctx.subprocess.resolveExecutable('node', undefined, signal)
    return [node, expected]
  }

  private async waitUntilHealthy(child: SubprocessHandle, signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + this.config.startTimeoutMs
    while (true) {
      signal.throwIfAborted()
      const probe = await this.probe(signal)
      if (probe.kind === 'healthy') return
      const outcome = await Promise.race([
        child.done.then(value => ({ kind: 'exit' as const, value }), (error: unknown) => ({ kind: 'spawn-error' as const, error })),
        new Promise<{ readonly kind: 'poll' }>(resolve => setTimeout(() => { resolve({ kind: 'poll' }) }, this.config.healthPollMs)),
      ])
      if (outcome.kind === 'exit') throw new Error(this.exitMessage(outcome.value, child))
      if (outcome.kind === 'spawn-error') throw new Error(`OmniRoute failed to spawn: ${messageOf(outcome.error)}`, { cause: outcome.error })
      if (Date.now() >= deadline) throw new Error(`OmniRoute did not become healthy within ${String(this.config.startTimeoutMs)}ms`)
    }
  }

  private async connect(models: readonly Record<string, string | number>[]): Promise<void> {
    const descriptor = this.settingsDescriptor()
    if (descriptor === undefined) throw new Error(`settings namespace "${PI_AI_NAMESPACE}" is not mounted`)
    const profile = {
      displayName: 'OmniRoute',
      apiKeyEnv: this.config.apiKeyEnv,
      api: 'openai-completions',
      baseURL: this.config.baseURL,
      models,
    }
    const op: SettingsPathOp = { op: 'set', path: ['providers', OMNIROUTE_PROVIDER], value: profile }
    await this.ctx.settings.mutate(PI_AI_NAMESPACE, [op], descriptor.revision)
  }

  private settingsDescriptor(): SettingsDescriptor | undefined {
    return this.ctx.settings.describe().find(candidate => candidate.ns === PI_AI_NAMESPACE)
  }

  private connectedModelCount(): number | undefined {
    return profileModelCount(this.settingsDescriptor())
  }

  private view(
    phase: OmniRouteStatus['phase'],
    executableAvailable: boolean,
    modelCount: number | undefined,
    message?: string,
  ): OmniRouteStatus {
    return {
      phase,
      baseURL: this.config.baseURL,
      dashboardURL: this.config.dashboardURL,
      executableAvailable,
      connected: modelCount !== undefined,
      ...modelCount === undefined ? {} : { modelCount },
      ...message === undefined ? {} : { message },
    }
  }

  private async executableAvailable(signal: AbortSignal): Promise<boolean> {
    try {
      await this.resolveLaunch(signal)
      return true
    } catch {
      return false
    }
  }

  private observeExit(child: SubprocessHandle, outcome: SubprocessOutcome): void {
    if (this.child !== child) return
    this.child = undefined
    if (!this.disposing && outcome.exitCode !== 0) this.lastFailure = this.exitMessage(outcome, child)
  }

  private observeSpawnFailure(child: SubprocessHandle, error: unknown): void {
    if (this.child !== child) return
    this.child = undefined
    if (!this.disposing) this.lastFailure = `OmniRoute failed to spawn: ${messageOf(error)}`
  }

  private exitMessage(outcome: SubprocessOutcome, child: SubprocessHandle): string {
    const stderr = child.collected.stderr?.readFrom(0).text.trim()
    const fact = outcome.exitCode === null ? `signal ${outcome.signal ?? 'unknown'}` : `exit code ${String(outcome.exitCode)}`
    return `OmniRoute exited during startup (${fact})${stderr === undefined || stderr.length === 0 ? '' : `: ${stderr}`}`
  }

  private async rollbackChild(): Promise<void> {
    const child = this.child
    if (child === undefined) return
    child.terminate()
    await child.waitForExit()
    if (this.child === child) this.child = undefined
  }

  private async disposeManaged(): Promise<void> {
    this.disposing = true
    const child = this.child
    if (child === undefined) return
    child.terminate()
    await child.waitForExit()
    if (this.child === child) this.child = undefined
  }

  private installMessage(): string {
    return `OmniRoute executable "${this.config.executable}" was not found; install it with npm install -g omniroute`
  }
}

export default OmniRouteController
