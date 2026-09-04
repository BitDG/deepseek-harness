import { execFileSync, spawn } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ownedProcessMatches,
  installedProductExecutables,
  runtimeFingerprint,
  webPort,
  windowsInstallArguments,
  windowsProductEnvironment,
} from './start-windows.mjs'

interface Fixture {
  container: string
  local: string
}

const fixtureRoots: string[] = []

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LANG: 'C', LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function configureRepository(root: string): void {
  git(root, ['config', 'user.email', 'start-windows@example.com'])
  git(root, ['config', 'user.name', 'Start Windows Tests'])
  git(root, ['config', 'commit.gpgsign', 'false'])
}

function createFixture(): Fixture {
  const container = mkdtempSync(join(tmpdir(), 'dsh-start-windows-'))
  fixtureRoots.push(container)
  const local = join(container, 'local')
  git(container, ['init', '--initial-branch=master', local])
  configureRepository(local)
  write(join(local, 'package.json'), `${JSON.stringify({ version: '1.0.0' }, undefined, 2)}\n`)
  write(join(local, 'README.md'), '# Fixture\n')
  write(join(local, 'packages/example/src.ts'), 'export const value = 1\n')
  git(local, ['add', '.'])
  git(local, ['commit', '-m', 'initial'])
  return { container, local }
}

async function waitForFile(path: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!existsSync(path)) {
    if (child.exitCode !== null) throw new Error(`child exited before writing ${path}`)
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`)
    await new Promise(resolveWait => setTimeout(resolveWait, 20))
  }
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode
  return await new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => { reject(new Error('timed out waiting for child exit')) }, 10_000)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
}

describe('start-windows launcher logic', () => {
  it('validates forwarded Web ports', () => {
    expect(webPort([])).toBe(3080)
    expect(webPort(['--port=4317'])).toBe(4317)
    expect(() => webPort(['--port', 'invalid'])).toThrow('invalid Web port')
  })

  it('fingerprints runtime edits but ignores documentation-only work', () => {
    const fixture = createFixture()
    expect(runtimeFingerprint(fixture.local).dirty).toBe(false)
    write(join(fixture.local, 'README.md'), '# Documentation edit\n')
    expect(runtimeFingerprint(fixture.local).dirty).toBe(false)
    write(join(fixture.local, 'packages/example/src.ts'), 'export const value = 2\n')
    const changed = runtimeFingerprint(fixture.local)
    expect(changed.dirty).toBe(true)
    expect(changed.paths).toEqual(['packages/example/src.ts'])
  })

  it('requires the recorded executable, command paths, and process start time before termination', () => {
    const createdAt = new Date().toISOString()
    const state = {
      formatVersion: 1,
      pid: 1234,
      id: 'instance',
      createdAt,
      interruptFile: join(process.cwd(), '.dsh-build', 'start-windows-interrupt-instance'),
    }
    const info = {
      processId: 1234,
      executablePath: process.execPath,
      commandLine: `"${process.execPath}" --import start-windows-signal.mjs apps/cli/src/bin.ts web`,
      startedAt: createdAt,
    }
    const expected = { commandFragments: ['start-windows-signal.mjs', 'apps/cli/src/bin.ts', ' web'] }
    expect(ownedProcessMatches(state, info, expected)).toBe(true)
    expect(ownedProcessMatches(state, { ...info, commandLine: 'unrelated.exe' }, expected)).toBe(false)
    expect(ownedProcessMatches(state, { ...info, startedAt: '2000-01-01T00:00:00.000Z' }, expected)).toBe(false)
  })

  it('reuses probed Codex and Claude Code executables and excludes only their payloads', () => {
    const container = mkdtempSync(join(tmpdir(), 'dsh-start-windows-products-'))
    fixtureRoots.push(container)
    const bin = join(container, 'node_modules', '.bin')
    const tools = join(container, 'tools')
    const codexTriple = process.arch === 'arm64'
      ? 'aarch64-pc-windows-msvc'
      : 'x86_64-pc-windows-msvc'
    const codexPackage = process.arch === 'arm64'
      ? 'codex-win32-arm64'
      : 'codex-win32-x64'
    const codex = join(
      container,
      'node_modules',
      '@openai',
      'codex',
      'node_modules',
      '@openai',
      codexPackage,
      'vendor',
      codexTriple,
      'bin',
      'codex.exe',
    )
    const claudeCode = join(tools, 'claude.exe')
    write(join(container, 'packages/subagent/subagent-codex/package.json'), `${JSON.stringify({
      dependencies: { '@openai/codex': '0.149.1' },
    })}\n`)
    write(join(container, 'packages/subagent/subagent-codex/node_modules/@openai/codex/package.json'), `${JSON.stringify({ version: '0.149.1' })}\n`)
    write(join(container, 'packages/subagent/subagent-claude-code/package.json'), `${JSON.stringify({
      dependencies: { '@anthropic-ai/claude-agent-sdk': '0.3.241' },
    })}\n`)
    write(join(container, 'packages/subagent/subagent-claude-code/node_modules/@anthropic-ai/claude-agent-sdk/package.json'), `${JSON.stringify({ version: '0.3.241' })}\n`)
    mkdirSync(dirname(codex), { recursive: true })
    mkdirSync(tools, { recursive: true })
    linkSync(process.execPath, codex)
    linkSync(process.execPath, claudeCode)

    const executables = installedProductExecutables({
      Path: [bin, tools].join(delimiter),
    })
    expect(executables.codex?.path).toBe(codex)
    expect(executables.claudeCode?.path).toBe(claudeCode)
    expect(executables.codex?.version).toBe(process.version)
    expect(executables.claudeCode?.version).toBe(process.version)
    expect(windowsProductEnvironment(executables)).toEqual({
      DSH_CODEX_EXECUTABLE_PATH: codex,
      DSH_CLAUDE_CODE_EXECUTABLE_PATH: claudeCode,
    })
    expect(windowsInstallArguments(executables, container)).toEqual([
      'pnpm',
      '--filter=!@deepseek-ai/dsh-subagent-codex',
      '--filter=!@deepseek-ai/dsh-subagent-claude-code',
      'install',
      '--frozen-lockfile',
    ])
  })

  it('rejects a configured relative product executable before launch', () => {
    expect(() => installedProductExecutables({
      DSH_CODEX_EXECUTABLE_PATH: 'relative/codex.exe',
      Path: '',
    })).toThrow('DSH_CODEX_EXECUTABLE_PATH must be an absolute Codex executable path')
  })

  it('converts an owned Windows stop marker into the dsh SIGTERM event', { timeout: 20_000 }, async () => {
    const container = mkdtempSync(join(tmpdir(), 'dsh-start-windows-signal-'))
    fixtureRoots.push(container)
    const ready = join(container, 'ready')
    const disposed = join(container, 'disposed')
    const interrupt = join(container, 'interrupt')
    const signalModule = fileURLToPath(new URL('./start-windows-signal.mjs', import.meta.url))
    const program = [
      "const { writeFileSync } = require('node:fs')",
      `writeFileSync(${JSON.stringify(ready)}, 'ready')`,
      `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(disposed)}, 'disposed'); process.exit(0) })`,
      'setInterval(() => {}, 1000)',
    ].join('; ')
    const child = spawn(process.execPath, ['--import', pathToFileURL(signalModule).href, '-e', program], {
      env: { ...process.env, DSH_START_WINDOWS_INTERRUPT_FILE: interrupt },
      stdio: 'ignore',
    })
    try {
      await waitForFile(ready, child)
      writeFileSync(interrupt, '')
      await waitForFile(disposed, child)
      expect(await waitForExit(child)).toBe(0)
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await waitForExit(child)
      }
    }
  })

  it('marks readiness only when the Web profile announces full startup', { timeout: 20_000 }, async () => {
    const container = mkdtempSync(join(tmpdir(), 'dsh-start-windows-ready-'))
    fixtureRoots.push(container)
    const ready = join(container, 'ready')
    const signalModule = fileURLToPath(new URL('./start-windows-signal.mjs', import.meta.url))
    const child = spawn(process.execPath, [
      '--import', pathToFileURL(signalModule).href,
      '-e',
      "console.log('dsh web: http://127.0.0.1:3080/?token=secret'); setInterval(() => {}, 1000)",
    ], {
      env: { ...process.env, DSH_START_WINDOWS_READY_FILE: ready },
      stdio: 'ignore',
    })
    try {
      await waitForFile(ready, child)
      expect(readFileSync(ready, 'utf8')).toBe('')
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await waitForExit(child)
      }
    }
  })

  it('does not mark readiness for an early listener message', { timeout: 20_000 }, async () => {
    const container = mkdtempSync(join(tmpdir(), 'dsh-start-windows-not-ready-'))
    fixtureRoots.push(container)
    const ready = join(container, 'ready')
    const signalModule = fileURLToPath(new URL('./start-windows-signal.mjs', import.meta.url))
    const child = spawn(process.execPath, [
      '--import', pathToFileURL(signalModule).href,
      '-e',
      "console.log('webserver listening on 127.0.0.1:3080')",
    ], {
      env: { ...process.env, DSH_START_WINDOWS_READY_FILE: ready },
      stdio: 'ignore',
    })
    expect(await waitForExit(child)).toBe(0)
    expect(existsSync(ready)).toBe(false)
  })
})
