import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  downloadedTarget, downloadAvailability, inspectCheckout, installAvailability, officialGithubRemote,
} from '../src/source-checkout.ts'
import type { DshReleaseView } from '../src/types.ts'

const roots: string[] = []
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const checkoutConfig = { owner: 'deepseek-ai', repository: 'deepseek-harness', remote: 'origin' }

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function repository(): Promise<{ root: string; manifest: string; head: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-checkout-'))
  roots.push(root)
  await mkdir(join(root, 'packages', 'host', 'update'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"@deepseek-ai/dsh-root","version":"0.1.0"}\n')
  const manifest = join(root, 'packages', 'host', 'update', 'package.json')
  await writeFile(manifest, '{"name":"@deepseek-ai/dsh-host-update","version":"0.1.0"}\n')
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'DSH test')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'current')
  const head = git(root, 'rev-parse', 'HEAD')
  await writeFile(join(root, 'package.json'), '{"name":"@deepseek-ai/dsh-root","version":"0.2.0"}\n')
  git(root, 'add', 'package.json')
  git(root, 'commit', '-m', 'target')
  git(root, 'tag', 'dsh-v0.2.0')
  const target = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', 'refs/dsh-update/tags/dsh-v0.2.0', target)
  git(root, 'reset', '--hard', head)
  git(root, 'remote', 'add', 'origin', 'https://github.com/deepseek-ai/deepseek-harness.git')
  return { root, manifest, head, target }
}

const release: DshReleaseView = {
  version: '0.2.0',
  tag: 'dsh-v0.2.0',
  name: '0.2.0',
  publishedAt: '2026-09-03T00:00:00Z',
  url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0',
  notesEn: 'notes',
  notesZh: '说明',
}

describe('source checkout policy', () => {
  it('recognizes only encrypted official GitHub transports', () => {
    expect(officialGithubRemote('https://github.com/deepseek-ai/deepseek-harness.git', checkoutConfig)).toBe(true)
    expect(officialGithubRemote('git@github.com:deepseek-ai/deepseek-harness.git', checkoutConfig)).toBe(true)
    expect(officialGithubRemote('ssh://git@github.com/deepseek-ai/deepseek-harness', checkoutConfig)).toBe(true)
    expect(officialGithubRemote('http://github.com/deepseek-ai/deepseek-harness.git', checkoutConfig)).toBe(false)
    expect(officialGithubRemote('https://github.com/other/deepseek-harness.git', checkoutConfig)).toBe(false)
  })

  it('reads source facts and validates a downloaded tag without changing HEAD', async () => {
    const fixture = await repository()
    const state = await inspectCheckout(fixture.manifest, checkoutConfig)
    expect(state).toMatchObject({
      installation: 'source-checkout', currentVersion: '0.1.0', head: fixture.head,
      branch: 'main', dirty: false, officialOrigin: true,
    })
    await expect(downloadedTarget(state, release)).resolves.toEqual({
      commit: fixture.target, version: '0.2.0', descendant: true,
    })
    expect(downloadAvailability(state, true)).toEqual({ allowed: true })
    expect(installAvailability(state, await downloadedTarget(state, release), release, false)).toEqual({ allowed: true })
    expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(fixture.head)

    await writeFile(join(fixture.root, 'dirty.txt'), 'mine')
    const dirty = await inspectCheckout(fixture.manifest, checkoutConfig)
    expect(installAvailability(dirty, await downloadedTarget(dirty, release), release, false)).toEqual({
      allowed: false, blocker: 'clean-worktree-required',
    })
    expect(downloadAvailability(dirty, true)).toEqual({ allowed: true })
  })

  it('treats a package anchor outside a DSH Git root as package installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-update-package-'))
    roots.push(root)
    const manifest = join(root, 'package.json')
    await writeFile(manifest, '{"name":"@deepseek-ai/dsh-host-update","version":"3.0.0"}\n')
    await expect(inspectCheckout(manifest, checkoutConfig)).resolves.toEqual({
      installation: 'package', currentVersion: '3.0.0', dirty: false, officialOrigin: false,
    })
  })

  it('reports action blockers in mutation order', () => {
    const packaged = { installation: 'package', currentVersion: '1.0.0', dirty: false, officialOrigin: false } as const
    expect(downloadAvailability(packaged, true).blocker).toBe('source-checkout-required')
    expect(installAvailability(packaged, undefined, release, false).blocker).toBe('source-checkout-required')
    expect(installAvailability({ ...packaged, installation: 'source-checkout' }, undefined, release, false).blocker)
      .toBe('official-origin-required')
    expect(installAvailability({ ...packaged, installation: 'source-checkout', officialOrigin: true }, undefined, release, true).blocker)
      .toBe('install-in-progress')
  })
})
