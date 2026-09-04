#!/usr/bin/env node
/** Build when required and launch the repository Web profile on Windows. */

import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { connect } from 'node:net'
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUILD_DIRECTORY = '.dsh-build'
const BUILD_RECORD = `${BUILD_DIRECTORY}/client-build-environment.json`
const LAUNCH_BUILD_RECORD = `${BUILD_DIRECTORY}/start-windows-build.json`
const LAUNCH_LOCK = `${BUILD_DIRECTORY}/start-windows.lock`
const LAUNCH_STATE = `${BUILD_DIRECTORY}/start-windows.json`
const LAUNCH_ERROR_LOG = `${BUILD_DIRECTORY}/start-windows-error.log`
const INTERRUPT_PREFIX = 'start-windows-interrupt-'
const READY_PREFIX = 'start-windows-ready-'
const FORMAT_VERSION = 1
const BUILD_TIMEOUT_MS = 20 * 60_000
const STOP_TIMEOUT_MS = 20_000
const START_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 100
const PROCESS_START_TOLERANCE_MS = 10_000
const CODEX_EXECUTABLE_ENV = 'DSH_CODEX_EXECUTABLE_PATH'
const CLAUDE_CODE_EXECUTABLE_ENV = 'DSH_CLAUDE_CODE_EXECUTABLE_PATH'
const WINDOWS_PRODUCT_TARGETS = {
  x64: {
    codexPackage: 'codex-win32-x64',
    codexTriple: 'x86_64-pc-windows-msvc',
  },
  arm64: {
    codexPackage: 'codex-win32-arm64',
    codexTriple: 'aarch64-pc-windows-msvc',
  },
}
const SYSTEM_PROVIDER_DEPENDENCIES = {
  codex: {
    provider: '@deepseek-ai/dsh-subagent-codex',
    manifest: 'packages/subagent/subagent-codex/package.json',
    dependency: '@openai/codex',
  },
  claudeCode: {
    provider: '@deepseek-ai/dsh-subagent-claude-code',
    manifest: 'packages/subagent/subagent-claude-code/package.json',
    dependency: '@anthropic-ai/claude-agent-sdk',
  },
}
const RUNTIME_PATHS = [
  'apps',
  'packages',
  'patches',
  'vendor',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.base.client.json',
  'tsconfig.client.json',
  'tsconfig.host.json',
  'tsconfig.json',
  'tsdown.config.ts',
  'scripts/build.ts',
  'scripts/client-build-environment.ts',
  'scripts/pnpm-invocation.ts',
]

function errorCode(error) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined
}

function delay(milliseconds) {
  return new Promise(resolveWait => setTimeout(resolveWait, milliseconds))
}

function normalizedPath(path) {
  return resolve(path).replaceAll('/', '\\').toLowerCase()
}

function sanitize(text) {
  return text
    .replace(/(https?:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/giu, '$1***@')
    .trim()
}

function commandFailure(command, args, result) {
  const stderr = typeof result.stderr === 'string' ? sanitize(result.stderr) : ''
  const detail = result.error?.message ?? (stderr || `exit status ${String(result.status)}`)
  return new Error(`${command} ${args.join(' ')} failed: ${detail}`)
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout,
    windowsHide: true,
  })
  if (result.status !== 0 && !options.allowStatuses?.includes(result.status)) {
    throw commandFailure(command, args, result)
  }
  return result
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 32 * 1024 * 1024,
    stdio: 'inherit',
    timeout: options.timeout,
    windowsHide: false,
  })
  if (result.status !== 0) throw commandFailure(command, args, result)
}

function gitEnvironment() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C',
  }
}

function git(root, args, options = {}) {
  return capture('git', args, {
    ...options,
    cwd: root,
    env: gitEnvironment(),
  })
}

function gitBuffer(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    env: gitEnvironment(),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (result.status !== 0) throw commandFailure('git', args, result)
  return result.stdout
}

function readJson(path, label) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} ${path} is invalid JSON: ${detail}`)
  }
}

function assertRegularFile(path, label) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`start-windows: refusing ${label} because it is not a regular single-link file: ${path}`)
  }
  return stat
}

function ensureBuildDirectory(root) {
  const path = join(root, BUILD_DIRECTORY)
  mkdirSync(path, { recursive: true })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`start-windows: refusing build state path because it is not a real directory: ${path}`)
  }
  return path
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(handle, `${JSON.stringify(value, undefined, 2)}\n`)
  } finally {
    closeSync(handle)
  }
  try {
    if (existsSync(path)) {
      assertRegularFile(path, 'state replacement target')
      unlinkSync(path)
    }
    renameSync(temporary, path)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch (cleanupError) {
      if (errorCode(cleanupError) !== 'ENOENT') throw new AggregateError([error, cleanupError])
    }
    throw error
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (errorCode(error) === 'ESRCH') return false
    if (errorCode(error) === 'EPERM') return true
    throw error
  }
}

function parseLock(text) {
  try {
    const value = JSON.parse(text)
    return value?.formatVersion === FORMAT_VERSION
      && Number.isSafeInteger(value.pid)
      && value.pid > 0
      && typeof value.id === 'string'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

function acquireLock(root) {
  const path = join(root, LAUNCH_LOCK)
  const record = `${JSON.stringify({ formatVersion: FORMAT_VERSION, pid: process.pid, id: randomUUID() })}\n`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(path, 'wx', 0o600)
      let ownedStat
      try {
        ownedStat = fstatSync(handle)
        writeFileSync(handle, record)
      } finally {
        closeSync(handle)
      }
      return () => {
        const current = assertRegularFile(path, 'launcher lock')
        if (current.dev !== ownedStat.dev || current.ino !== ownedStat.ino || readFileSync(path, 'utf8') !== record) {
          throw new Error(`start-windows: launcher lock ownership changed: ${path}`)
        }
        unlinkSync(path)
      }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
      assertRegularFile(path, 'launcher lock')
      const owner = parseLock(readFileSync(path, 'utf8'))
      if (owner === undefined) {
        throw new Error(`start-windows: invalid launcher lock; confirm no launcher is running, remove ${path}, and retry`)
      }
      if (processIsAlive(owner.pid)) {
        throw new Error(`start-windows: another launcher is running as PID ${String(owner.pid)}`)
      }
      unlinkSync(path)
    }
  }
  throw new Error('start-windows: could not acquire launcher lock')
}

export function webPort(args) {
  let value = '3080'
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--port') {
      const candidate = args[index + 1]
      if (candidate === undefined) throw new Error('start-windows: --port requires a value')
      value = candidate
      index += 1
    } else if (arg.startsWith('--port=')) {
      value = arg.slice('--port='.length)
    }
  }
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`start-windows: invalid Web port ${JSON.stringify(value)}`)
  }
  return port
}

function repositoryManifestVersion(root) {
  const manifest = readJson(join(root, 'package.json'), 'repository manifest')
  if (manifest === undefined || typeof manifest.version !== 'string') {
    throw new Error('start-windows: package.json must contain a string version')
  }
  return manifest.version
}

function inspectCheckout(root) {
  const reportedRoot = git(root, ['rev-parse', '--show-toplevel']).stdout.trim()
  if (normalizedPath(realpathSync(reportedRoot)) !== normalizedPath(realpathSync(root))) {
    throw new Error(`start-windows: script root ${root} does not match Git root ${reportedRoot}`)
  }
  return {
    localSha: git(root, ['rev-parse', 'HEAD']).stdout.trim(),
    localVersion: repositoryManifestVersion(root),
    dirtyAny: git(root, ['status', '--porcelain=v1', '--untracked-files=normal']).stdout !== '',
  }
}

function nulPaths(buffer) {
  if (buffer.length === 0) return []
  const output = buffer.at(-1) === 0 ? buffer.subarray(0, -1) : buffer
  return output.toString('utf8').split('\0')
}

function hashFile(hash, root, path) {
  const absolute = join(root, ...path.split('/'))
  hash.update(path)
  hash.update('\0')
  if (!existsSync(absolute)) {
    hash.update('deleted\0')
    return
  }
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink()) {
    hash.update(`symlink:${readlinkSync(absolute)}\0`)
    return
  }
  if (!stat.isFile()) {
    hash.update(`non-file:${stat.mode}\0`)
    return
  }
  hash.update(readFileSync(absolute))
  hash.update('\0')
}

export function runtimeFingerprint(root, head = git(root, ['rev-parse', 'HEAD']).stdout.trim()) {
  const changed = nulPaths(gitBuffer(root, ['diff', '--name-only', '-z', 'HEAD', '--', ...RUNTIME_PATHS]))
  const untracked = nulPaths(gitBuffer(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...RUNTIME_PATHS]))
  const paths = [...new Set([...changed, ...untracked])].sort()
  const hash = createHash('sha256').update(`${head}\0`)
  for (const path of paths) hashFile(hash, root, path)
  return { dirty: paths.length > 0, paths, sha256: hash.digest('hex') }
}

function buildRecordMatches(root, report, fingerprint) {
  const record = readJson(join(root, BUILD_RECORD), 'client build record')
  if (
    record === undefined
    || record.formatVersion !== 1
    || typeof record.environment !== 'object'
    || record.environment === null
    || record.environment.DSH_CLIENT_COMMIT_HASH !== report.localSha.slice(0, 7)
    || record.environment.DSH_CLIENT_VERSION !== report.localVersion
    || (record.environment.DSH_CLIENT_GIT_DIRTY === 'true') !== report.dirtyAny
    || !existsSync(join(root, 'apps/web/dist/index.html'))
  ) return false
  if (!fingerprint.dirty) return true
  const launcherRecord = readJson(join(root, LAUNCH_BUILD_RECORD), 'launcher build record')
  return launcherRecord?.formatVersion === FORMAT_VERSION
    && launcherRecord.runtimeFingerprint === fingerprint.sha256
}

function corepackInvocation(args) {
  const corepack = join(dirname(process.execPath), 'node_modules/corepack/dist/corepack.js')
  if (!existsSync(corepack)) {
    throw new Error(`start-windows: Corepack is unavailable beside Node at ${corepack}`)
  }
  return { command: process.execPath, args: [corepack, ...args] }
}

function assertPrerequisites(root) {
  const engine = readJson(join(root, 'package.json'), 'repository manifest')?.engines?.node
  console.log(`Node: ${process.version}${typeof engine === 'string' ? ` (required ${engine})` : ''}`)
  const invocation = corepackInvocation(['pnpm', '--version'])
  const pnpm = capture(invocation.command, invocation.args, { cwd: root, timeout: 30_000 }).stdout.trim()
  console.log(`pnpm: ${pnpm} through Corepack`)
}

function regularFile(path) {
  if (!existsSync(path)) return undefined
  try {
    const resolved = realpathSync(path)
    return lstatSync(resolved).isFile() ? resolved : undefined
  } catch {
    return undefined
  }
}

function probeExecutable(path, label) {
  const result = capture(path, ['--version'], { timeout: 30_000 })
  const version = sanitize(`${result.stdout}\n${result.stderr}`).split(/\r?\n/u)[0]
  if (version.length === 0) {
    throw new Error(`start-windows: ${label} executable returned no version: ${path}`)
  }
  return { path, version }
}

function configuredExecutable(environment, name, label) {
  const configured = environment[name]?.trim()
  if (configured === undefined || configured.length === 0) return undefined
  if (!isAbsolute(configured)) {
    throw new Error(`start-windows: ${name} must be an absolute ${label} executable path`)
  }
  const path = regularFile(configured)
  if (path === undefined) {
    throw new Error(`start-windows: ${name} does not name a file: ${configured}`)
  }
  return probeExecutable(path, label)
}

function pathEntries(environment) {
  return (environment.Path ?? environment.PATH ?? '')
    .split(delimiter)
    .map(entry => entry.trim().replace(/^"|"$/gu, ''))
    .filter(Boolean)
}

function findClaudeCodeExecutable(environment) {
  for (const directory of pathEntries(environment)) {
    const path = regularFile(join(directory, 'claude.exe'))
    if (path === undefined) continue
    try {
      return probeExecutable(path, 'Claude Code')
    } catch {
      // PATH may contain stale shims; a later executable can still be valid.
    }
  }
  return undefined
}

function codexPackageRoots(directory) {
  const roots = [join(directory, 'node_modules', '@openai', 'codex')]
  if (basename(directory).toLowerCase() === '.bin') {
    roots.unshift(join(dirname(directory), '@openai', 'codex'))
  }
  return roots
}

function findCodexExecutable(environment, target) {
  const seen = new Set()
  for (const directory of pathEntries(environment)) {
    const direct = regularFile(join(directory, 'codex.exe'))
    const candidates = direct === undefined ? [] : [direct]
    for (const packageRoot of codexPackageRoots(directory)) {
      candidates.push(
        regularFile(join(
          packageRoot,
          'node_modules',
          '@openai',
          target.codexPackage,
          'vendor',
          target.codexTriple,
          'bin',
          'codex.exe',
        )),
        regularFile(join(packageRoot, 'vendor', target.codexTriple, 'bin', 'codex.exe')),
      )
    }
    for (const path of candidates) {
      if (path === undefined || seen.has(normalizedPath(path))) continue
      seen.add(normalizedPath(path))
      try {
        return probeExecutable(path, 'Codex')
      } catch {
        // PATH may contain an incomplete package; continue to later installs.
      }
    }
  }
  return undefined
}

/** Resolve valid system product executables without changing the host PATH. */
export function installedProductExecutables(environment = process.env) {
  const target = WINDOWS_PRODUCT_TARGETS[process.arch]
  if (target === undefined) return {}
  return {
    codex: configuredExecutable(environment, CODEX_EXECUTABLE_ENV, 'Codex')
      ?? findCodexExecutable(environment, target),
    claudeCode: configuredExecutable(environment, CLAUDE_CODE_EXECUTABLE_ENV, 'Claude Code')
      ?? findClaudeCodeExecutable(environment),
  }
}

/** Map probed system product executables to the repository providers' explicit environment entries. */
export function windowsProductEnvironment(executables) {
  return {
    ...(executables.codex === undefined
      ? {}
      : { [CODEX_EXECUTABLE_ENV]: executables.codex.path }),
    ...(executables.claudeCode === undefined
      ? {}
      : { [CLAUDE_CODE_EXECUTABLE_ENV]: executables.claudeCode.path }),
  }
}

function providerDependencyReady(root, product) {
  const requirement = SYSTEM_PROVIDER_DEPENDENCIES[product]
  const manifest = readJson(join(root, requirement.manifest), `${product} provider manifest`)
  const expected = manifest?.dependencies?.[requirement.dependency]
  const installed = readJson(
    join(root, ...requirement.manifest.split('/').slice(0, -1), 'node_modules', ...requirement.dependency.split('/'), 'package.json'),
    `${product} installed dependency`,
  )
  return typeof expected === 'string'
    && !expected.startsWith('workspace:')
    && installed?.version === expected
}

/** Build the locked install command while preserving system-backed provider closures. */
export function windowsInstallArguments(executables, root = REPOSITORY_ROOT) {
  const excludedProviders = Object.entries(SYSTEM_PROVIDER_DEPENDENCIES)
    .filter(([product]) =>
      executables[product] !== undefined && providerDependencyReady(root, product))
    .map(([, requirement]) => requirement.provider)
  return [
    'pnpm',
    ...excludedProviders.map(packageName => `--filter=!${packageName}`),
    'install',
    '--frozen-lockfile',
  ]
}

function buildRepository(root, fingerprint, executables) {
  console.log('Build: installing the locked dependency graph through Corepack.')
  const installArguments = windowsInstallArguments(executables)
  const install = corepackInvocation(installArguments)
  run(install.command, install.args, { cwd: root, timeout: BUILD_TIMEOUT_MS })
  console.log('Build: creating a complete repository artifact set.')
  const build = corepackInvocation(['pnpm', 'run', 'build'])
  run(build.command, build.args, { cwd: root, timeout: BUILD_TIMEOUT_MS })
  writeJsonAtomic(join(root, LAUNCH_BUILD_RECORD), {
    formatVersion: FORMAT_VERSION,
    runtimeFingerprint: fingerprint.sha256,
  })
}

export function ownedProcessMatches(state, processInfo, expected = {}) {
  if (
    state?.formatVersion !== FORMAT_VERSION
    || !Number.isSafeInteger(state.pid)
    || state.pid <= 0
    || typeof state.id !== 'string'
    || typeof state.createdAt !== 'string'
    || typeof state.interruptFile !== 'string'
    || !isAbsolute(state.interruptFile)
    || processInfo === undefined
    || processInfo.processId !== state.pid
    || typeof processInfo.commandLine !== 'string'
    || typeof processInfo.executablePath !== 'string'
    || typeof processInfo.startedAt !== 'string'
  ) return false
  const expectedExecutable = normalizedPath(expected.executablePath ?? process.execPath)
  if (normalizedPath(processInfo.executablePath) !== expectedExecutable) return false
  const command = processInfo.commandLine.replaceAll('/', '\\').toLowerCase()
  for (const fragment of expected.commandFragments ?? []) {
    if (!command.includes(fragment.replaceAll('/', '\\').toLowerCase())) return false
  }
  const created = Date.parse(state.createdAt)
  const started = Date.parse(processInfo.startedAt)
  return Number.isFinite(created)
    && Number.isFinite(started)
    && Math.abs(created - started) <= PROCESS_START_TOLERANCE_MS
}

function windowsProcess(pid) {
  const script = [
    `$c = Get-CimInstance Win32_Process -Filter 'ProcessId = ${String(pid)}' -ErrorAction SilentlyContinue`,
    'if ($null -eq $c) { exit 3 }',
    `$p = Get-Process -Id ${String(pid)} -ErrorAction Stop`,
    "[pscustomobject]@{ processId = [int]$c.ProcessId; executablePath = [string]$c.ExecutablePath; commandLine = [string]$c.CommandLine; startedAt = $p.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress",
  ].join('; ')
  const result = capture('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script,
  ], { allowStatuses: [3], timeout: 10_000 })
  if (result.status === 3) return undefined
  return JSON.parse(result.stdout)
}

function readLaunchState(root) {
  const path = join(root, LAUNCH_STATE)
  if (!existsSync(path)) return undefined
  assertRegularFile(path, 'launcher state')
  const state = readJson(path, 'launcher state')
  if (state === undefined) return undefined
  if (
    state.formatVersion !== FORMAT_VERSION
    || !Number.isSafeInteger(state.pid)
    || typeof state.id !== 'string'
    || typeof state.createdAt !== 'string'
    || typeof state.interruptFile !== 'string'
    || !isAbsolute(state.interruptFile)
    || dirname(normalizedPath(state.interruptFile)) !== normalizedPath(join(root, BUILD_DIRECTORY))
    || !state.interruptFile.split(/[\\/]/u).at(-1)?.startsWith(INTERRUPT_PREFIX)
  ) {
    throw new Error(`start-windows: invalid launcher state; inspect ${path} before retrying`)
  }
  return state
}

function expectedCommandFragments(root) {
  return [
    normalizedPath(join(root, 'scripts/start-windows-signal.mjs')),
    normalizedPath(join(root, 'apps/cli/src/bin.ts')),
    ' web',
  ]
}

async function waitForProcessExit(pid, timeout) {
  const deadline = Date.now() + timeout
  while (processIsAlive(pid)) {
    if (Date.now() >= deadline) return false
    await delay(POLL_INTERVAL_MS)
  }
  return true
}

function removeOwnedFile(path, label) {
  if (!existsSync(path)) return
  assertRegularFile(path, label)
  unlinkSync(path)
}

async function stopPreviousInstance(root) {
  const state = readLaunchState(root)
  if (state === undefined) return false
  const readyFile = join(root, BUILD_DIRECTORY, `${READY_PREFIX}${state.id}`)
  const info = windowsProcess(state.pid)
  if (info === undefined) {
    removeOwnedFile(join(root, LAUNCH_STATE), 'stale launcher state')
    removeOwnedFile(state.interruptFile, 'stale interrupt marker')
    removeOwnedFile(readyFile, 'stale readiness marker')
    return false
  }
  if (!ownedProcessMatches(state, info, { commandFragments: expectedCommandFragments(root) })) {
    throw new Error(`start-windows: PID ${String(state.pid)} does not match the recorded dsh web instance; refusing to terminate it`)
  }
  console.log(`Restart: requesting graceful shutdown from PID ${String(state.pid)}.`)
  const markerHandle = openSync(state.interruptFile, 'wx', 0o600)
  closeSync(markerHandle)
  if (!await waitForProcessExit(state.pid, STOP_TIMEOUT_MS)) {
    console.warn(`Restart: PID ${String(state.pid)} did not stop within ${String(STOP_TIMEOUT_MS / 1000)} seconds; terminating its process tree.`)
    run('taskkill.exe', ['/PID', String(state.pid), '/T', '/F'], { timeout: 30_000 })
    if (!await waitForProcessExit(state.pid, 10_000)) {
      throw new Error(`start-windows: PID ${String(state.pid)} remained alive after taskkill`)
    }
  }
  removeOwnedFile(join(root, LAUNCH_STATE), 'launcher state')
  removeOwnedFile(state.interruptFile, 'interrupt marker')
  removeOwnedFile(readyFile, 'readiness marker')
  return true
}

function portListening(port) {
  if (port === 0) return Promise.resolve(false)
  return new Promise(resolveResult => {
    const socket = connect({ host: '127.0.0.1', port })
    const finish = value => {
      socket.removeAllListeners()
      socket.destroy()
      resolveResult(value)
    }
    socket.setTimeout(500)
    socket.once('connect', () => { finish(true) })
    socket.once('error', () => { finish(false) })
    socket.once('timeout', () => { finish(false) })
  })
}

async function waitForReadyMarker(pid, path, timeout) {
  const deadline = Date.now() + timeout
  while (processIsAlive(pid)) {
    if (existsSync(path)) {
      assertRegularFile(path, 'readiness marker')
      return true
    }
    if (Date.now() >= deadline) return false
    await delay(POLL_INTERVAL_MS)
  }
  return false
}

function launchArguments(root, webArgs) {
  return [
    '--import', pathToFileURL(join(root, 'scripts/start-windows-signal.mjs')).href,
    '--import', 'tsx/esm',
    join(root, 'apps/cli/src/bin.ts'),
    'web',
    ...webArgs,
  ]
}

async function startWeb(root, webArgs, executables) {
  const port = webPort(webArgs)
  if (port !== 0 && await portListening(port)) {
    throw new Error(`start-windows: port ${String(port)} is owned by an unrecorded process; refusing to terminate it`)
  }
  const id = randomUUID()
  const interruptFile = join(root, BUILD_DIRECTORY, `${INTERRUPT_PREFIX}${id}`)
  const readyFile = join(root, BUILD_DIRECTORY, `${READY_PREFIX}${id}`)
  const errorLog = join(root, LAUNCH_ERROR_LOG)
  removeOwnedFile(interruptFile, 'pre-existing interrupt marker')
  removeOwnedFile(readyFile, 'pre-existing readiness marker')
  const errorHandle = openSync(errorLog, 'w', 0o600)
  const createdAt = new Date().toISOString()
  const child = spawn(process.execPath, launchArguments(root, webArgs), {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      DSH_START_WINDOWS_INTERRUPT_FILE: interruptFile,
      DSH_START_WINDOWS_READY_FILE: readyFile,
      ...windowsProductEnvironment(executables),
    },
    stdio: ['ignore', 'ignore', errorHandle],
    windowsHide: true,
  })
  closeSync(errorHandle)
  child.unref()
  writeJsonAtomic(join(root, LAUNCH_STATE), {
    formatVersion: FORMAT_VERSION,
    pid: child.pid,
    id,
    createdAt,
    interruptFile,
    port,
  })
  const announced = await waitForReadyMarker(child.pid, readyFile, START_TIMEOUT_MS)
  let failure
  if (!announced) {
    const exited = !processIsAlive(child.pid)
    failure = `dsh web ${exited ? 'exited before announcing readiness' : `did not become ready within ${String(START_TIMEOUT_MS / 1000)} seconds`}; see ${errorLog}`
  } else if (port !== 0 && !await portListening(port)) {
    failure = `dsh web announced readiness but port ${String(port)} is not listening; see ${errorLog}`
  }
  if (failure !== undefined) {
    await stopPreviousInstance(root)
    throw new Error(`start-windows: ${failure}`)
  }
  removeOwnedFile(readyFile, 'readiness marker')
  console.log(`Web: started PID ${String(child.pid)}${port === 0 ? '' : ` at http://127.0.0.1:${String(port)}`}.`)
}

async function main(args = process.argv.slice(2), root = REPOSITORY_ROOT) {
  if (process.platform !== 'win32') {
    throw new Error('start-windows: start.bat is supported only on Windows')
  }
  ensureBuildDirectory(root)
  const releaseLock = acquireLock(root)
  try {
    console.log('DeepSeek Harness Windows launcher')
    assertPrerequisites(root)
    const executables = installedProductExecutables()
    console.log(executables.codex === undefined
      ? 'Codex: no system executable found; the locked platform payload remains enabled.'
      : `Codex: reusing ${executables.codex.path} (${executables.codex.version}).`)
    console.log(executables.claudeCode === undefined
      ? 'Claude Code: no system executable found; the locked platform payload remains enabled.'
      : `Claude Code: reusing ${executables.claudeCode.path} (${executables.claudeCode.version}).`)
    const report = inspectCheckout(root)
    const fingerprint = runtimeFingerprint(root, report.localSha)
    const buildReady = buildRecordMatches(root, report, fingerprint)
    console.log(`Build: ${buildReady ? 'current complete artifacts found.' : 'complete artifacts need regeneration.'}`)
    if (!buildReady) buildRepository(root, fingerprint, executables)
    else console.log('Build: skipped install and build.')
    await stopPreviousInstance(root)
    await startWeb(root, args, executables)
  } finally {
    releaseLock()
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
