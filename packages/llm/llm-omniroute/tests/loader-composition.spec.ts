/** Real Loader composition: external OmniRoute adoption through a live model request. */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import * as OmniRoute from '../src/index.ts'
import { assemble } from '../../llm-pi-ai/tests/assemble.ts'

let root: string | undefined
let context: Context | undefined
let server: Server | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (server !== undefined) await new Promise<void>((resolve) => { server?.close(() => { resolve() }) })
  server = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class NoSpawnSubprocess extends SubprocessRuntime {
  resolveExecutable(): Promise<string> {
    return Promise.resolve('/unused/omniroute')
  }

  spawn(_spec: SubprocessSpawnSpec): SubprocessHandle {
    throw new Error('external adoption must not spawn')
  }

  spawnTerminal(_spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    throw new Error('not used')
  }
}

interface OmniRouteFixture {
  readonly origin: string
  readonly requests: Array<{ readonly path: string; readonly authorization?: string }>
}

async function omniRouteFixture(): Promise<OmniRouteFixture> {
  const requests: Array<{ readonly path: string; readonly authorization?: string }> = []
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = request.url ?? ''
    requests.push({ path, ...request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization } })
    if (path === '/api/health/ping') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'x-omniroute-route-class': 'PUBLIC',
      })
      response.end(JSON.stringify({ status: 'ok', timestamp: '2026-09-01T00:00:00.000Z', latencyMs: 0 }))
      return
    }
    if (path === '/v1/models') {
      if (request.headers.authorization !== 'Bearer fixture-key') {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Authentication required' } }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        object: 'list',
        data: [{ id: 'oc/fixture-model', name: 'Fixture Model', object: 'model', owned_by: 'opencode' }],
      }))
      return
    }
    if (path === '/v1/chat/completions') {
      if (request.headers.authorization !== 'Bearer fixture-key') {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Authentication required' } }))
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const event of [
        '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
        '{"choices":[{"delta":{"content":"hello from OmniRoute"},"index":0,"finish_reason":null}]}',
        '{"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":3}}',
        '[DONE]',
      ]) response.write(`data: ${event}\n\n`)
      response.end()
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>((resolve) => { server?.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture did not bind')
  return { origin: `http://127.0.0.1:${String(address.port)}`, requests }
}

async function loadComposition(origin: string): Promise<{ readonly ctx: Context; readonly settingsPath: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-omniroute-composition-'))
  const settingsPath = join(root, 'settings.yaml')
  await writeFile(settingsPath, '# personal settings\n')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: typert',
    "  name: '@deepseek-ai/dsh-typert-registry'",
    '- id: llm',
    "  name: '@deepseek-ai/dsh-llm'",
    '- id: settings',
    "  name: '@deepseek-ai/dsh-settings-file'",
    '  config:',
    `    path: ${JSON.stringify(settingsPath)}`,
    '    debounceMs: 10',
    '- id: subprocess',
    "  name: 'test-subprocess'",
    '- id: llm-pi-ai',
    "  name: '@deepseek-ai/dsh-llm-pi-ai'",
    '- id: llm-omniroute',
    "  name: '@deepseek-ai/dsh-llm-omniroute'",
    '  config:',
    `    dashboardURL: ${JSON.stringify(origin)}`,
    '    healthTimeoutMs: 1000',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.provide('credentials', {
    resolve: () => Promise.resolve({ value: 'fixture-key', source: 'fixture' }),
  } as never)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-typert-registry', TypertRegistry],
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
    ['test-subprocess', NoSpawnSubprocess],
    ['@deepseek-ai/dsh-llm-pi-ai', LlmPiAi],
    ['@deepseek-ai/dsh-llm-omniroute', OmniRoute],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return { ctx, settingsPath }
}

describe('llm-omniroute real Loader composition', () => {
  it('adopts, discovers, persists, registers, and serves one OpenAI-compatible model', async () => {
    const fixture = await omniRouteFixture()
    const { ctx, settingsPath } = await loadComposition(fixture.origin)
    const connected = await ctx.omniRoute.startAndConnect(new AbortController().signal)
    expect(connected).toMatchObject({ phase: 'external', connected: true, modelCount: 1 })
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toContain('omniroute')
    })
    const document = await readFile(settingsPath, 'utf8')
    expect(document).toContain('omniroute:')
    expect(document).toContain('apiKeyEnv: OMNIROUTE_API_KEY')
    expect(document).toContain('id: oc/fixture-model')
    expect(document).toContain('name: Fixture Model [OPC]')
    expect(document).not.toContain('fixture-key')

    const result = await assemble(ctx, { provider: 'omniroute', model: 'oc/fixture-model', messages: [] })
    expect(result.message.content).toEqual([{ type: 'text', text: 'hello from OmniRoute' }])
    expect(fixture.requests.map(request => request.path)).toEqual([
      '/api/health/ping', '/v1/models', '/v1/chat/completions',
    ])
    expect(fixture.requests[1]?.authorization).toBe('Bearer fixture-key')
    expect(fixture.requests[2]?.authorization).toBe('Bearer fixture-key')
  })
})
