import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { SettingsDescriptor, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import OmniRouteController from '../src/index.ts'

/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
/* oxlint-disable typescript/unbound-method -- SubprocessHandle methods are Vitest mocks in this fixture. */

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail })
  return { promise, resolve, reject }
}

function health(): Response {
  return new Response(JSON.stringify({ status: 'ok', timestamp: '2026-09-01T00:00:00.000Z', latencyMs: 0 }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-omniroute-route-class': 'PUBLIC' },
  })
}

function descriptor(profile?: { readonly models: readonly unknown[] }): SettingsDescriptor {
  return {
    ns: 'llm-pi-ai' as SettingsDescriptor['ns'],
    schema: {},
    value: { providers: profile === undefined ? {} : { omniroute: profile } },
    applies: 'live',
    revision: 0,
  }
}

interface HarnessOptions {
  readonly fetch?: typeof fetch
  readonly models?: readonly LlmDiscoveredModel[]
  readonly resolveExecutable?: (command: string, signal?: AbortSignal) => Promise<string>
  readonly child?: SubprocessHandle
  readonly initialProfile?: { readonly models: readonly unknown[] }
  readonly credential?: string
}

function harness(options: HarnessOptions = {}) {
  const ctx = new Context()
  const writes: Array<{ readonly ns: string; readonly ops: readonly SettingsPathOp[]; readonly revision?: number }> = []
  const spawns: SubprocessSpawnSpec[] = []
  let current = descriptor(options.initialProfile)
  const discoverModels = vi.fn(() => Promise.resolve(options.models ?? [
    { id: 'antigravity/gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)', contextWindow: 1_048_576 },
    { id: 'oc/big-pickle', name: 'Big Pickle' },
    { id: 'opencode-go/glm-5.2-high', name: 'GLM-5.2 (high effort)', maxTokens: 65_536 },
    { id: 'auto/best-coding', name: 'Auto: Best Coding' },
    { id: 'agy/gemini-3.1-pro-low', name: 'agy/Gemini 3.1 Pro (Low)' },
  ]))
  ctx.provide('llm', { discoverModels } as never)
  ctx.provide('settings', {
    describe: () => [current],
    mutate: async (ns: string, ops: readonly SettingsPathOp[], revision?: number) => {
      writes.push({ ns, ops, ...revision === undefined ? {} : { revision } })
      const set = ops[0]
      if (set?.op === 'set') {
        const value = set.value as { readonly models: readonly unknown[] }
        current = descriptor({ models: value.models })
      }
    },
  } as never)
  ctx.provide('credentials', {
    resolve: () => Promise.resolve((options.credential ?? 'fixture-key').length === 0
      ? undefined
      : { value: options.credential ?? 'fixture-key', source: 'fixture' }),
  } as never)
  const child = options.child ?? childHandle()
  ctx.provide('subprocess', {
    resolveExecutable: (command: string, _env?: unknown, signal?: AbortSignal) =>
      options.resolveExecutable?.(command, signal) ?? Promise.resolve('C:\\tools\\omniroute.exe'),
    spawn: (spec: SubprocessSpawnSpec) => { spawns.push(spec); return child },
  } as never)
  ctx.provide('typert', {
    lookups: { configure: () => () => {} },
    contexts: { configureHost: () => () => {} },
  } as never)
  const previousFetch = globalThis.fetch
  globalThis.fetch = options.fetch ?? vi.fn(() => Promise.reject(new TypeError('connection refused')))
  const controller = new OmniRouteController(ctx, {
    dashboardURL: 'http://127.0.0.1:20128',
    startTimeoutMs: 200,
    healthTimeoutMs: 20,
    healthPollMs: 1,
    disposeGraceMs: 10,
  })
  return {
    child,
    controller,
    ctx,
    discoverModels,
    restore: () => { globalThis.fetch = previousFetch },
    spawns,
    writes,
  }
}

function childHandle(done = deferred<SubprocessOutcome>()) {
  const terminate = vi.fn()
  const waitForExit = vi.fn(() => Promise.resolve(true))
  const handle: SubprocessHandle = {
    pid: 42,
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    collected: {
      stderr: { readFrom: () => ({ text: 'startup diagnostic', nextOffset: 18, lossy: false }) },
    },
    done: done.promise,
    terminate,
    waitForExit,
  }
  return Object.assign(handle, { deferred: done, terminate, waitForExit })
}

describe('OmniRoute Host lifecycle', () => {
  it('reports an actionable unavailable state without mutating anything', async () => {
    const h = harness({ resolveExecutable: () => Promise.reject(new Error('not found')) })
    try {
      await expect(h.controller.status(new AbortController().signal)).resolves.toMatchObject({
        phase: 'unavailable',
        executableAvailable: false,
        connected: false,
        message: expect.stringContaining('npm install -g omniroute'),
      })
      expect(h.spawns).toEqual([])
      expect(h.writes).toEqual([])
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('adopts a healthy external service and stores its deduplicated model profile', async () => {
    const fetch = vi.fn(() => Promise.resolve(health()))
    const h = harness({ fetch })
    try {
      const result = await h.controller.startAndConnect(new AbortController().signal)
      expect(result).toMatchObject({ phase: 'external', connected: true, modelCount: 3 })
      expect(h.spawns).toEqual([])
      expect(h.discoverModels).toHaveBeenCalledWith('llm-pi-ai', {
        baseURL: 'http://127.0.0.1:20128/v1',
        api: 'openai-completions',
        apiKey: 'fixture-key',
      }, expect.any(AbortSignal))
      expect(h.writes).toHaveLength(1)
      expect(h.writes[0]).toMatchObject({ ns: 'llm-pi-ai', revision: 0 })
      expect(h.writes[0]?.ops[0]).toMatchObject({
        op: 'set',
        path: ['providers', 'omniroute'],
        value: {
          displayName: 'OmniRoute',
          apiKeyEnv: 'OMNIROUTE_API_KEY',
          api: 'openai-completions',
          baseURL: 'http://127.0.0.1:20128/v1',
          models: [
            {
              id: 'antigravity/gemini-3.1-pro-low',
              name: 'Gemini 3.1 Pro (Low) [AGY]',
              contextWindow: 1_048_576,
            },
            { id: 'oc/big-pickle', name: 'Big Pickle [OPC]' },
            {
              id: 'opencode-go/glm-5.2-high',
              name: 'GLM-5.2 (high effort) [OPC]',
              maxTokens: 65_536,
            },
          ],
        },
      })
      await expect(h.controller.status(new AbortController().signal)).resolves.toMatchObject({
        phase: 'external', connected: true, modelCount: 3,
      })
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('single-flights concurrent starts and publishes a managed child only after health', async () => {
    let probes = 0
    const fetch = vi.fn(() => {
      probes++
      return probes < 3 ? Promise.reject(new TypeError('refused')) : Promise.resolve(health())
    })
    const h = harness({ fetch })
    try {
      const first = h.controller.startAndConnect(new AbortController().signal)
      const second = h.controller.startAndConnect(new AbortController().signal)
      expect(second).toBe(first)
      await expect(h.controller.status(new AbortController().signal)).resolves.toMatchObject({ phase: 'starting' })
      await expect(first).resolves.toMatchObject({ phase: 'managed', modelCount: 3 })
      expect(h.spawns).toHaveLength(1)
      expect(h.spawns[0]).toMatchObject({
        argv: ['C:\\tools\\omniroute.exe', 'serve', '--port', '20128', '--no-open', '--no-tray'],
        stdio: { stdin: 'ignore' },
        env: { BASE_URL: undefined, OMNIROUTE_API_KEY: 'fixture-key' },
        graceMs: 10,
      })
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('refuses an occupied endpoint and never replaces or stops it', async () => {
    const h = harness({ fetch: vi.fn(() => Promise.resolve(new Response('{"status":"ok"}', { status: 200 }))) })
    try {
      await expect(h.controller.startAndConnect(new AbortController().signal)).rejects.toMatchObject({
        name: RemoteError.name,
        code: 'gateway/internal',
        message: expect.stringContaining('unrecognized health document'),
      })
      expect(h.spawns).toEqual([])
      expect(h.writes).toEqual([])
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('stops only an owned child and keeps the model profile', async () => {
    let probes = 0
    const h = harness({ fetch: vi.fn(() => ++probes === 1
      ? Promise.reject(new TypeError('refused'))
      : Promise.resolve(health())) })
    try {
      await h.controller.startAndConnect(new AbortController().signal)
      const stopped = await h.controller.stop(new AbortController().signal)
      expect(stopped).toMatchObject({ phase: 'stopped', connected: true, modelCount: 3 })
      expect(h.child.terminate).toHaveBeenCalledOnce()
      expect(h.child.waitForExit).toHaveBeenCalledOnce()
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('never stops an externally managed healthy service', async () => {
    const h = harness({ fetch: vi.fn(() => Promise.resolve(health())), initialProfile: { models: [{}] } })
    try {
      await expect(h.controller.stop(new AbortController().signal)).rejects.toMatchObject({
        code: 'gateway/bad-request',
        message: expect.stringContaining('externally managed'),
      })
      expect(h.child.terminate).not.toHaveBeenCalled()
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('rolls back a newly launched child when model discovery fails', async () => {
    let probes = 0
    const h = harness({
      fetch: vi.fn(() => ++probes === 1 ? Promise.reject(new TypeError('refused')) : Promise.resolve(health())),
      models: [],
    })
    try {
      await expect(h.controller.startAndConnect(new AbortController().signal)).rejects.toMatchObject({
        code: 'gateway/internal',
        message: expect.stringContaining('advertised no Antigravity or OpenCode models'),
      })
      expect(h.child.terminate).toHaveBeenCalledOnce()
      expect(h.child.waitForExit).toHaveBeenCalledOnce()
      await expect(h.controller.status(new AbortController().signal)).resolves.toMatchObject({ phase: 'external' })
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('fails before discovery when the configured credential is missing', async () => {
    const h = harness({ fetch: vi.fn(() => Promise.resolve(health())), credential: '' })
    try {
      await expect(h.controller.startAndConnect(new AbortController().signal)).rejects.toMatchObject({
        code: 'gateway/internal',
        message: expect.stringContaining('OMNIROUTE_API_KEY is not configured'),
      })
      expect(h.discoverModels).not.toHaveBeenCalled()
      expect(h.writes).toEqual([])
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('does not launch a managed child when the configured credential is missing', async () => {
    let probes = 0
    const h = harness({
      fetch: vi.fn(() => ++probes === 1
        ? Promise.reject(new TypeError('refused'))
        : Promise.resolve(health())),
      credential: '',
    })
    try {
      await expect(h.controller.startAndConnect(new AbortController().signal)).rejects.toMatchObject({
        code: 'gateway/internal',
        message: expect.stringContaining('OMNIROUTE_API_KEY is not configured'),
      })
      expect(h.spawns).toEqual([])
      expect(h.discoverModels).not.toHaveBeenCalled()
      expect(h.writes).toEqual([])
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })

  it('reports a startup exit with bounded child diagnostics', async () => {
    const child = childHandle()
    let probes = 0
    const h = harness({ fetch: vi.fn(() => {
      probes++
      if (probes === 1) return Promise.reject(new TypeError('refused'))
      child.deferred.resolve({ exitCode: 7, signal: null })
      return Promise.reject(new TypeError('refused'))
    }), child })
    try {
      await expect(h.controller.startAndConnect(new AbortController().signal)).rejects.toMatchObject({
        message: expect.stringContaining('exit code 7'),
      })
      await expect(h.controller.status(new AbortController().signal)).resolves.toMatchObject({
        phase: 'failed', message: expect.stringContaining('startup diagnostic'),
      })
    } finally {
      h.restore()
      await h.ctx.fiber.dispose()
    }
  })
})
