/** Opt-in Windows/product acceptance against the installed OmniRoute CLI. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import OmniRouteController from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  private data: Record<string, unknown> = {}

  get writable(): boolean { return true }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.data))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.data[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe.runIf(process.env.DSH_EXPECT_OMNIROUTE === '1')('installed OmniRoute product acceptance', () => {
  it('starts silently, discovers the live catalog, registers the route, and reaps the process tree', async () => {
    const ctx = new Context()
    context = ctx
    ctx.provide('typert', {
      lookups: { configure: () => () => {} },
      contexts: { configureHost: () => () => {} },
    } as never)
    ctx.provide('credentials', {
      resolve: () => Promise.resolve(process.env.OMNIROUTE_API_KEY === undefined
        ? undefined
        : { value: process.env.OMNIROUTE_API_KEY, source: 'environment' }),
    } as never)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(LlmPiAi, {})
    await ctx.plugin(OmniRouteController, {
      dashboardURL: 'http://127.0.0.1:20130',
      startTimeoutMs: 120_000,
      healthTimeoutMs: 2_000,
      healthPollMs: 250,
      disposeGraceMs: 5_000,
    })

    const connected = await ctx.omniRoute.startAndConnect(new AbortController().signal)
    expect(connected.phase).toBe('managed')
    expect(connected.modelCount).toBeGreaterThan(0)
    expect(ctx.llm.listProviders().map(provider => provider.id)).toContain('omniroute')
    const stopped = await ctx.omniRoute.stop(new AbortController().signal)
    expect(stopped).toMatchObject({ phase: 'stopped', connected: true, modelCount: connected.modelCount })
    await expect(ctx.omniRoute.status(new AbortController().signal)).resolves.toMatchObject({ phase: 'stopped' })
  }, 180_000)
})
