/** Bounded argv-only child-process execution used by checkout inspection and download. */

import { spawn } from 'node:child_process'

/** One completed command. */
export interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/** Command execution options. */
export interface CommandOptions {
  readonly cwd: string
  readonly signal?: AbortSignal
  readonly allowedExitCodes?: readonly number[]
  readonly env?: NodeJS.ProcessEnv
}

/** Replaceable argv runner used by Host unit tests. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<CommandResult>

/**
 * Run one command without a shell and capture its bounded diagnostic output.
 * @param command - executable name or path.
 * @param args - literal argv entries.
 * @param options - cwd, cancellation, accepted exits, and environment.
 * @returns captured completion.
 */
export const runCommand: CommandRunner = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    signal: options.signal,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
  child.once('error', reject)
  child.once('close', (code, childSignal) => {
    const exitCode = code ?? -1
    const result = {
      exitCode,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }
    if (childSignal === null && (options.allowedExitCodes ?? [0]).includes(exitCode)) resolve(result)
    else reject(new Error(`${command} ${args.join(' ')} failed: ${result.stderr.trim() || `exit ${String(exitCode)}${childSignal === null ? '' : ` (${childSignal})`}`}`))
  })
})

/**
 * Environment that prevents Git from prompting or localizing parsed output.
 * @returns a copy of the process environment with stable Git settings.
 */
export function gitEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0', LANG: 'C', LC_ALL: 'C' }
}
