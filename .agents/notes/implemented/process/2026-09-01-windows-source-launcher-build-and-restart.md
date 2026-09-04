# Agent Note: Windows source launcher builds and restarts the Web profile

Status: implemented

English | [中文](2026-09-01-windows-source-launcher-build-and-restart.zh.md)

## Problem

Opening the Web UI from a source checkout required several commands. Repeated manual launches could leave an earlier server running, while port ownership alone could not identify which process belonged to the checkout.

The repository binds Web artifacts to a version, source commit, dirty marker, and artifact digest. Launching after a local source change without regenerating the complete artifact set could mix source and artifact versions.

## Decision

The repository root provides `start.bat` as a thin Windows entry point. It invokes the dependency-free `scripts/start-windows.mjs` launcher, which verifies the Git root, Node engine, Corepack-provided pnpm version, and complete-build record before it changes runtime state. It forwards every command-line argument to the Web profile. The launcher never fetches, compares upstream revisions, or changes the checkout or Git history.

A complete build runs only when the recorded local version, commit, dirty marker, Web artifact, or launcher runtime-source fingerprint is stale. Before installation, the launcher probes absolute Codex and Claude Code executables from explicit environment overrides or deterministic Windows `PATH` package locations and records each reported version in the console. The build runs Corepack's JavaScript entry beside `process.execPath`, because direct Windows `spawnSync` of `corepack.cmd` returns `EINVAL`, then uses `pnpm install --frozen-lockfile` and the repository root build. When a system executable passed its probe and the provider's exact JavaScript dependency is installed, pnpm preserves that dependency closure by excluding the provider workspace from the reinstall; otherwise the ordinary locked install remains enabled. A matching record skips installation and build.

The launcher passes each probed absolute path to the Web process through a dedicated environment entry. The optional Codex and Claude Code Bundle patches map those entries to explicit `executablePath` configuration. Each provider validates the path during load; Codex starts the native binary with `app-server --stdio`, while the Claude provider supplies the path as the official SDK's `pathToClaudeCodeExecutable`. Neither provider performs an implicit `PATH` fallback.

The launcher records its process state under `.dsh-build/`. A rebuild finishes before a restart changes process state. A restart checks the stored PID, executable, command line, process start time, source CLI path, and launcher preload path before it requests shutdown. `scripts/start-windows-signal.mjs` converts an owned marker into the CLI's ordinary `SIGTERM` event because Windows cannot deliver that signal to the process. The launcher waits for process exit and uses `taskkill /T /F` only as a bounded fallback for that verified process tree. An unrecorded listener is never terminated by port number.

The new process starts through the source `dsh web` CLI. The profile owns its authenticated launch URL and default-browser handoff. The preload converts the profile's `dsh web:` announcement, which follows Loader settlement, into an empty launcher-owned readiness marker. The launcher requires that marker and, for a fixed port, a live loopback listener before it reports success; it never persists the authenticated URL.

## Testing

The script specification covers forwarded Web ports, runtime-source fingerprints, process identity, system executable discovery, exact provider-workspace exclusions, the readiness announcement marker, an early-listener rejection, and the Windows marker-to-`SIGTERM` bridge. Keyless real-product tests run one local-fixture task through the installed Codex and Claude Code binaries and prove that each provider spawned the configured path. Windows acceptance rejects a profile that opens the port and then fails during plugin loading, runs the locked install without fetching either redundant platform package, starts the repaired Web profile, observes the expected unauthenticated `401` response on the recorded loopback listener, then launches again and proves that the first PID exits before a different recorded PID owns the same port without another build.

## Alternatives considered

**Fetch or fast-forward before launch.** Rejected because a launcher does not own source updates. Updating remains an explicit user operation with its own dirty-worktree and remote-state checks.

**Terminate whichever process listens on the Web port.** Rejected because a port does not prove checkout ownership and could belong to another service or checkout.

**Build on every launch.** Rejected because the repository already records a complete artifact set. Local version, commit, dirty state, and runtime-source fingerprints identify when regeneration is required without making unchanged restarts pay the full build cost.

**Search `PATH` inside each provider.** Rejected because deployment selection must be explicit and validated during plugin load. The launcher owns Windows discovery and converts the result into ordinary provider configuration; other profiles keep the pinned package payload unless they supply a path themselves.

**Run the incremental Web development watcher.** Rejected because it requires an existing complete build, stays resident as a second process tree, and rewrites artifacts continuously. It serves source editing rather than one-shot startup.

## Consequences

An unchanged checkout restarts quickly, while a local source change pays for one locked install and complete build. Existing compatible product installations avoid two large redundant Windows payload downloads. The launcher neither reports nor applies repository updates. A failed build leaves the existing recorded server running; a startup failure after the verified shutdown leaves no mixed-version server and requires the user to fix the checkout before retrying.

Process state and diagnostics remain local build data and are removed by the repository clean command. The launcher gives up automatic recovery from invalid ownership records and unrelated port conflicts in exchange for never terminating an unverified process.
