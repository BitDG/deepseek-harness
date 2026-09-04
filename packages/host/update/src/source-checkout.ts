/** Source-checkout discovery, official-origin checks, tag download, and install preflight. */

import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { valid } from 'semver'
import type { DshReleaseView, UpdateActionAvailability, UpdateBlocker } from './types.ts'
import { gitEnvironment, runCommand, type CommandRunner } from './command.ts'

/** GitHub repository identity and local remote selected by plugin config. */
export interface CheckoutConfig {
  readonly owner: string
  readonly repository: string
  readonly remote: string
}

/** Source facts re-read before every action. */
export interface CheckoutState {
  readonly installation: 'source-checkout' | 'package'
  readonly currentVersion: string
  readonly root?: string
  readonly head?: string
  readonly branch?: string
  readonly dirty: boolean
  readonly officialOrigin: boolean
}

/** Locally validated target tag facts. */
export interface DownloadedTarget {
  readonly commit: string
  readonly version: string
  readonly descendant: boolean
}

interface Manifest {
  readonly name?: unknown
  readonly version?: unknown
}

function downloadRef(release: DshReleaseView): string {
  return `refs/dsh-update/tags/${release.tag}`
}

/**
 * Return whether one path is the named repository's official GitHub remote.
 * @param url - configured Git remote URL.
 * @param config - accepted GitHub repository identity.
 * @returns whether the URL is an accepted HTTPS or GitHub SSH form.
 */
export function officialGithubRemote(url: string, config: CheckoutConfig): boolean {
  const suffix = `${config.owner}/${config.repository}`.toLowerCase()
  const normalized = url.trim().replace(/\.git$/u, '').replaceAll('\\', '/').toLowerCase()
  return normalized === `https://github.com/${suffix}`
    || normalized === `git@github.com:${suffix}`
    || normalized === `ssh://git@github.com/${suffix}`
}

/** Read a package manifest and require its version. */
async function manifest(path: string): Promise<Manifest & { readonly version: string }> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Manifest
  if (typeof parsed.version !== 'string') throw new Error(`package manifest has no version: ${path}`)
  return { ...parsed, version: parsed.version }
}

/** Run Git with non-interactive, locale-stable output. */
function git(runner: CommandRunner, cwd: string, args: readonly string[], signal?: AbortSignal, allowedExitCodes?: readonly number[]) {
  return runner('git', args, {
    cwd,
    env: gitEnvironment(),
    ...(signal === undefined ? {} : { signal }),
    ...(allowedExitCodes === undefined ? {} : { allowedExitCodes }),
  })
}

/**
 * Locate the repository containing the real package anchor. An installed npm
 * package inside an unrelated Git repository remains package mode because
 * the root manifest identity must match DSH.
 * @param packageManifestPath - physical package manifest used as the source anchor.
 * @param config - official repository and remote identity.
 * @param runner - argv-only command runner.
 * @param signal - optional caller cancellation.
 * @returns current installation, Git, and worktree facts.
 */
export async function inspectCheckout(
  packageManifestPath: string,
  config: CheckoutConfig,
  runner: CommandRunner = runCommand,
  signal?: AbortSignal,
): Promise<CheckoutState> {
  const packageInfo = await manifest(packageManifestPath)
  const anchor = await realpath(packageManifestPath)
  let root: string
  try {
    root = (await git(runner, dirname(anchor), ['rev-parse', '--show-toplevel'], signal)).stdout.trim()
  } catch {
    return { installation: 'package', currentVersion: packageInfo.version, dirty: false, officialOrigin: false }
  }
  const physicalRoot = await realpath(root)
  const inside = relative(physicalRoot, anchor)
  if (inside.startsWith('..') || resolve(physicalRoot, inside) !== anchor) {
    return { installation: 'package', currentVersion: packageInfo.version, dirty: false, officialOrigin: false }
  }
  const rootInfo = await manifest(resolve(physicalRoot, 'package.json'))
  if (rootInfo.name !== '@deepseek-ai/dsh-root') {
    return { installation: 'package', currentVersion: packageInfo.version, dirty: false, officialOrigin: false }
  }
  const head = (await git(runner, physicalRoot, ['rev-parse', 'HEAD'], signal)).stdout.trim()
  const branchResult = await git(
    runner,
    physicalRoot,
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    signal,
    [0, 1],
  )
  const originResult = await git(
    runner,
    physicalRoot,
    ['remote', 'get-url', config.remote],
    signal,
    [0, 2],
  )
  const dirty = (await git(
    runner,
    physicalRoot,
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    signal,
  )).stdout.length > 0
  return {
    installation: 'source-checkout',
    currentVersion: rootInfo.version,
    root: physicalRoot,
    head,
    ...(branchResult.exitCode === 0 ? { branch: branchResult.stdout.trim() } : {}),
    dirty,
    officialOrigin: originResult.exitCode === 0 && officialGithubRemote(originResult.stdout, config),
  }
}

/**
 * Validate an existing downloaded update ref against its manifest and ancestry.
 * @param state - current source-checkout facts.
 * @param release - offered GitHub Release.
 * @param runner - argv-only command runner.
 * @param signal - optional caller cancellation.
 * @returns validated target facts, or `undefined` before download.
 */
export async function downloadedTarget(
  state: CheckoutState,
  release: DshReleaseView,
  runner: CommandRunner = runCommand,
  signal?: AbortSignal,
): Promise<DownloadedTarget | undefined> {
  if (state.root === undefined || state.head === undefined) return undefined
  const reference = downloadRef(release)
  const exists = await git(
    runner,
    state.root,
    ['show-ref', '--verify', '--quiet', reference],
    signal,
    [0, 1],
  )
  if (exists.exitCode !== 0) return undefined
  const commit = (await git(runner, state.root, ['rev-parse', `${reference}^{commit}`], signal)).stdout.trim()
  const manifestText = (await git(runner, state.root, ['show', `${reference}:package.json`], signal)).stdout
  const targetManifest = JSON.parse(manifestText) as Manifest
  const version = typeof targetManifest.version === 'string' ? targetManifest.version : ''
  const ancestor = await git(
    runner,
    state.root,
    ['merge-base', '--is-ancestor', state.head, commit],
    signal,
    [0, 1],
  )
  return { commit, version, descendant: ancestor.exitCode === 0 }
}

/**
 * Download exactly one validated GitHub Release tag into the source checkout.
 * @param state - current source-checkout facts.
 * @param release - offered GitHub Release.
 * @param config - selected official Git remote.
 * @param runner - argv-only command runner.
 * @param signal - optional caller cancellation.
 * @returns the isolated downloaded ref's validated target facts.
 */
export async function downloadTarget(
  state: CheckoutState,
  release: DshReleaseView,
  config: CheckoutConfig,
  runner: CommandRunner = runCommand,
  signal?: AbortSignal,
): Promise<DownloadedTarget> {
  if (valid(release.version) === null || release.tag !== `dsh-v${release.version}`) {
    throw new Error(`release tag does not match its SemVer: ${release.tag}`)
  }
  if (state.root === undefined) throw new Error('DSH is not running from a source checkout')
  await git(runner, state.root, [
    'fetch', '--no-tags', config.remote,
    `+refs/tags/${release.tag}:${downloadRef(release)}`,
  ], signal)
  const downloaded = await downloadedTarget(state, release, runner, signal)
  if (downloaded === undefined) throw new Error(`Git did not create the isolated update ref for ${release.tag}`)
  if (downloaded.version !== release.version) {
    throw new Error(`downloaded ${release.tag} contains DSH ${downloaded.version || 'without a version'}`)
  }
  return downloaded
}

/**
 * Pick the first blocking condition for the download action.
 * @param state - current installation and origin facts.
 * @param hasTarget - whether GitHub offered a newer Release.
 * @returns action availability and, when blocked, its reason.
 */
export function downloadAvailability(state: CheckoutState, hasTarget: boolean): UpdateActionAvailability {
  if (!hasTarget) return { allowed: false }
  if (state.installation !== 'source-checkout') return blocked('source-checkout-required')
  if (!state.officialOrigin) return blocked('official-origin-required')
  return { allowed: true }
}

/**
 * Pick the first blocking condition for the install action.
 * @param state - current source-checkout facts.
 * @param target - locally downloaded target facts.
 * @param release - currently offered target Release.
 * @param installPending - whether this process already accepted an install.
 * @returns action availability and, when blocked, its reason.
 */
export function installAvailability(
  state: CheckoutState,
  target: DownloadedTarget | undefined,
  release: DshReleaseView | undefined,
  installPending: boolean,
): UpdateActionAvailability {
  if (release === undefined) return { allowed: false }
  if (installPending) return blocked('install-in-progress')
  if (state.installation !== 'source-checkout') return blocked('source-checkout-required')
  if (!state.officialOrigin) return blocked('official-origin-required')
  if (state.branch === undefined) return blocked('branch-required')
  if (state.dirty) return blocked('clean-worktree-required')
  if (target === undefined) return blocked('download-required')
  if (target.version !== release.version) return blocked('version-mismatch')
  if (!target.descendant) return blocked('fast-forward-required')
  return { allowed: true }
}

function blocked(blocker: UpdateBlocker): UpdateActionAvailability {
  return { allowed: false, blocker }
}
