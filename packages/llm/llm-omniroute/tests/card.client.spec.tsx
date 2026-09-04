// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { OmniRouteConnectValue, OmniRouteStatus, OmniRouteStopValue } from '../src/types.ts'
import { OmniRouteCard } from '../src/client/OmniRouteCard.tsx'
import type { OmniRouteCardInjected, OmniRouteOperations } from '../src/client/OmniRouteCard.tsx'
import { en } from '../src/client/locales.ts'

/* oxlint-disable typescript/unbound-method -- OmniRouteOperations methods are Vitest mocks in this fixture. */

afterEach(cleanup)

const t: OmniRouteCardInjected['t'] = (key, params) => {
  let value = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

function status(overrides: Partial<OmniRouteStatus> = {}): OmniRouteStatus {
  return {
    phase: 'stopped',
    baseURL: 'http://127.0.0.1:20128/v1',
    dashboardURL: 'http://127.0.0.1:20128',
    executableAvailable: true,
    connected: false,
    ...overrides,
  }
}

function operations(initial: OmniRouteStatus = status()): OmniRouteOperations {
  return {
    status: vi.fn((): Promise<RemoteResult<OmniRouteStatus>> => Promise.resolve({ ok: true, value: initial })),
    startAndConnect: vi.fn((): Promise<RemoteResult<OmniRouteConnectValue>> => Promise.resolve({
      ok: true,
      value: { ...status(), phase: 'managed', connected: true, modelCount: 115 },
    })),
    stop: vi.fn((): Promise<RemoteResult<OmniRouteStopValue>> => Promise.resolve({
      ok: true,
      value: { ...status({ connected: true, modelCount: 115 }), phase: 'stopped' },
    })),
  }
}

describe('OmniRoute Models card', () => {
  it('starts, reports imported models, opens explicitly, and stops the owned service', async () => {
    const calls = operations()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<OmniRouteCard operations={calls} t={t} />)

    const start = await screen.findByRole('button', { name: en.start })
    fireEvent.click(start)
    await screen.findByText('115 models connected.')
    expect(calls.startAndConnect).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: en.open }))
    expect(open).toHaveBeenCalledWith('http://127.0.0.1:20128', '_blank', 'noopener,noreferrer')

    fireEvent.click(screen.getByRole('button', { name: en.stop }))
    await waitFor(() => { expect(calls.stop).toHaveBeenCalledOnce() })
    await screen.findByRole('button', { name: en.start })
    open.mockRestore()
  })

  it('renders install guidance and disables start when the executable is unavailable', async () => {
    const calls = operations(status({
      phase: 'unavailable',
      executableAvailable: false,
      message: 'not found',
    }))
    render(<OmniRouteCard operations={calls} t={t} />)
    expect(await screen.findByText(en.install)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.start }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('not found')
  })

  it('connects a healthy external service that has no provider profile yet', async () => {
    const calls = operations(status({ phase: 'external', connected: false }))
    vi.mocked(calls.startAndConnect).mockResolvedValue({
      ok: true,
      value: { ...status(), phase: 'external', connected: true, modelCount: 2 },
    })
    render(<OmniRouteCard operations={calls} t={t} />)

    fireEvent.click(await screen.findByRole('button', { name: en.start }))
    await screen.findByText('2 models connected.')
    expect(calls.startAndConnect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: en.start })).toBeNull()
    expect(screen.queryByRole('button', { name: en.stop })).toBeNull()
    expect(screen.getByRole('button', { name: en.open })).toBeTruthy()
  })

  it('surfaces Remote failures and offers retry without claiming success', async () => {
    const calls = operations(status({ phase: 'failed' }))
    vi.mocked(calls.startAndConnect).mockResolvedValue({
      ok: false,
      error: new RemoteError('gateway/internal', 'model discovery failed', {}),
    })
    render(<OmniRouteCard operations={calls} t={t} />)
    const retry = await screen.findByRole('button', { name: en.retry })
    fireEvent.click(retry)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('model discovery failed') })
    expect(screen.queryByText(/models connected/)).toBeNull()
  })

  it('reports an initial status failure without losing the card', async () => {
    const calls = operations()
    vi.mocked(calls.status).mockResolvedValue({
      ok: false,
      error: new RemoteError('gateway/internal', 'wire unavailable', {}),
    })
    render(<OmniRouteCard operations={calls} t={t} />)
    expect((await screen.findByRole('alert')).textContent).toContain('wire unavailable')
    expect(screen.getByRole('heading', { name: 'OmniRoute' })).toBeTruthy()
  })
})
