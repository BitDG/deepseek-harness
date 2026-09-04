// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DshUpdateSnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { UpdateSection, type UpdateSectionInjected, type UpdateSectionProps } from '../src/client/UpdateSection.tsx'
import { en, type UpdateLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: UpdateLocaleKey, params?: Record<string, string>): string =>
  Object.entries(params ?? {}).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
    en[key],
  )) as UpdateSectionProps['t']

const release = {
  version: '0.1.2-alpha.5',
  tag: 'dsh-v0.1.2-alpha.5',
  name: 'DSH v0.1.2-alpha.5',
  publishedAt: '2026-09-02T12:00:00Z',
  url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.5',
  notesEn: 'Fix **startup** after an update.',
  notesZh: '修复更新后的启动。',
}

function snapshot(overrides: Partial<DshUpdateSnapshot> = {}): DshUpdateSnapshot {
  return {
    currentVersion: '0.1.2-alpha.3',
    currentCommit: '1234567890abcdef',
    installation: 'source-checkout',
    branch: 'main',
    dirty: true,
    status: 'update-available',
    targetVersion: release.version,
    targetTag: release.tag,
    targetDownloaded: false,
    releases: [release],
    compareUrl: 'https://github.com/deepseek-ai/deepseek-harness/compare/old...new',
    download: { allowed: true },
    install: { allowed: false, blocker: 'clean-worktree-required' },
    ...overrides,
  }
}

function props(overrides: Partial<UpdateSectionInjected> = {}): UpdateSectionProps {
  return {
    t,
    check: vi.fn(async () => snapshot()),
    download: vi.fn(async () => snapshot({ targetDownloaded: true })),
    install: vi.fn(async () => ({ operationId: 'operation' as never, restarting: true as const })),
    language: () => 'en',
    ...overrides,
  } as UpdateSectionProps
}

describe('UpdateSection', () => {
  it('shows the version rail, safe checkout facts, release notes, and dirty install blocker', async () => {
    const view = render(<UpdateSection {...props()} />)
    await screen.findByRole('heading', { name: en.releaseNotes })
    expect(screen.getByText('v0.1.2-alpha.3')).toBeTruthy()
    expect(screen.getAllByText('v0.1.2-alpha.5')).toHaveLength(2)
    expect(screen.getByText(en.dirty)).toBeTruthy()
    expect(screen.getByText(en.blockerClean)).toBeTruthy()
    expect(screen.getByText('startup')).toBeTruthy()
    expect(screen.getByRole('link', { name: en.compare }).getAttribute('href')).toContain('/compare/')
    expect(view.container.querySelector('[data-update-status="update-available"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.install }).hasAttribute('disabled')).toBe(true)
  })

  it('downloads the exact target and refreshes explicitly', async () => {
    const check = vi.fn(async () => snapshot())
    const download = vi.fn(async () => snapshot({
      dirty: false,
      targetDownloaded: true,
      install: { allowed: true },
    }))
    render(<UpdateSection {...props({ check, download })} />)
    await screen.findByRole('button', { name: en.download })
    fireEvent.click(screen.getByRole('button', { name: en.download }))
    await screen.findByText(en.downloaded)
    expect(download).toHaveBeenCalledWith(release.tag)

    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    await waitFor(() => { expect(check).toHaveBeenLastCalledWith(true) })
  })

  it('confirms install before handoff and reports the restarting state', async () => {
    const install = vi.fn(async () => ({ operationId: 'operation' as never, restarting: true as const }))
    render(<UpdateSection {...props({
      check: async () => snapshot({ dirty: false, targetDownloaded: true, install: { allowed: true } }),
      install,
    })} />)
    await screen.findByRole('button', { name: en.install })
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    const confirmation = screen.getByRole('group', { name: 'Install 0.1.2-alpha.5 and restart DSH?' })
    fireEvent.click(within(confirmation).getByRole('button', { name: en.confirm }))
    await screen.findByText(en.restarting)
    expect(install).toHaveBeenCalledWith(release.tag)
  })

  it('retries a failed check and surfaces an action failure', async () => {
    const check = vi.fn<UpdateSectionInjected['check']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(snapshot())
    const download = vi.fn<UpdateSectionInjected['download']>().mockRejectedValue(new Error('fetch rejected'))
    render(<UpdateSection {...props({ check, download })} />)
    await screen.findByText('offline')
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await screen.findByRole('button', { name: en.download })
    fireEvent.click(screen.getByRole('button', { name: en.download }))
    await screen.findByText('Action failed: fetch rejected')
  })

  it('renders package and up-to-date state without update actions', async () => {
    render(<UpdateSection {...props({
      check: async () => snapshot({
        installation: 'package',
        dirty: false,
        status: 'up-to-date',
        targetVersion: undefined,
        targetTag: undefined,
        releases: [],
        download: { allowed: false },
        install: { allowed: false },
      }),
    })} />)
    await screen.findByText(en.latest)
    expect(screen.getByText(en.packageInstall)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.download })).toBeNull()
  })
})
