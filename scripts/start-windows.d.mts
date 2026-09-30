/** Runtime-relevant worktree paths and their content digest. */
export interface RuntimeFingerprint {
  readonly dirty: boolean
  readonly paths: string[]
  readonly sha256: string
}

/** Launcher-owned process state persisted beneath `.dsh-build`. */
export interface LauncherProcessState {
  readonly formatVersion: number
  readonly pid: number
  readonly id: string
  readonly createdAt: string
  readonly interruptFile: string
}

/** Windows process fields used to prove launcher ownership. */
export interface WindowsProcessInfo {
  readonly processId: number
  readonly executablePath: string
  readonly commandLine: string
  readonly startedAt: string
}

/** Probed system product executable and its reported version. */
export interface ProductExecutable {
  readonly path: string
  readonly version: string
}

/** System product executables available to the Windows launcher. */
export interface InstalledProductExecutables {
  readonly codex?: ProductExecutable
  readonly claudeCode?: ProductExecutable
}

/** Resolve the Web port from forwarded arguments. */
export function webPort(args: readonly string[]): number

/** Digest runtime-relevant worktree changes. */
export function runtimeFingerprint(root: string, head?: string): RuntimeFingerprint

/** Check whether a live process still matches its recorded launcher identity. */
export function ownedProcessMatches(
  state: LauncherProcessState,
  processInfo: WindowsProcessInfo,
  expected?: { readonly executablePath?: string; readonly commandFragments?: readonly string[] },
): boolean

/** Resolve valid system product executables without changing the host PATH. */
export function installedProductExecutables(
  environment?: Readonly<Record<string, string | undefined>>,
): InstalledProductExecutables

/** Map probed system product executables to the repository providers' explicit environment entries. */
export function windowsProductEnvironment(
  executables: InstalledProductExecutables,
): Record<string, string>

/** Build the locked install command while preserving system-backed provider closures. */
export function windowsInstallArguments(
  executables: InstalledProductExecutables,
  root?: string,
): string[]
