# Agent Note: Update a clean DSH source checkout from GitHub Releases

Status: implemented

English | [中文](2026-09-03-github-release-source-updates.zh.md)

## Problem

The Web surface showed neither the running DSH version nor the newer versions and release notes published on GitHub. Updating a source launch required leaving the product and manually choosing Git commands. Putting network or Git behavior into `start.bat` would also make every ordinary launch depend on remote state and would mix startup recovery with a user-authorized repository mutation.

A self-update crosses three failure-sensitive transitions: selecting the intended upstream version, changing the checkout only after the running Host has stopped, and rebuilding before the replacement process starts. Existing user changes must never be hidden or erased, including changes created after an update begins.

## Decision

The Web bundle composes a Host `update` Remote and one **DSH update** Settings section. The Host reads the GitHub Releases list, includes prereleases by default, selects only `dsh-v<SemVer>` versions newer than the running root manifest, and returns every intermediate release note. DSH's `cn-*` and `en-*` release headings produce locale-specific text; a single-language body remains visible in both locales. The Client renders the current-to-target version rail, checkout facts, release notes, GitHub comparison link, explicit refresh, download, and confirmed install-and-restart actions.

Checking never mutates Git. Download requires a DSH source checkout whose configured remote URL is the official `deepseek-ai/deepseek-harness` repository over HTTPS or GitHub SSH. It fetches the exact Release tag into `refs/dsh-update/tags/<tag>` rather than trusting or replacing a local tag, then validates the target root manifest and ancestry. A dirty checkout may download because this changes no working-tree file.

Installation requires the official source checkout, a named branch, a clean working tree, the isolated downloaded ref, matching target SemVer, and a fast-forward relationship. The Host writes an owner-only request under `.dsh-build`, starts a bundled detached worker, waits for its IPC readiness acknowledgement, returns the accepted operation id, and only then requests graceful application shutdown. `start.bat` remains a local launcher and performs no fetch, comparison, or update decision.

After the Host exits, the worker revalidates the exact repository root, branch, starting commit, target commit, and clean status. It fast-forwards to the target commit, runs `pnpm install --frozen-lockfile` through the Node-adjacent Corepack and then the repository build, and relaunches the same DSH invocation. When the Windows source launcher owns the original process, the worker delegates restart to its existing readiness supervisor and records success only after that launcher returns successfully. A direct detached invocation remains recorded as `restarting` because process creation is not readiness proof.

If build or restart fails after the fast-forward, rollback is permitted only while HEAD is the exact target, the branch is unchanged, and the working tree is still clean. The worker then resets to the exact starting commit, rebuilds, and relaunches. Any intervening file change disables rollback; the worker records failure and preserves the checkout.

## Alternatives considered

**Update during every launcher start** — rejected. It adds network and upstream movement to ordinary local startup, prevents the user from reviewing release notes, and conflicts with the launcher's recovery-only responsibility.

**Use GitHub's latest-release endpoint** — rejected. That endpoint omits prereleases, while DSH currently publishes prerelease channels and the page must show every version between the running and selected releases.

**Download a Release asset and replace the installation** — rejected. The current DSH Releases publish source tags without platform assets, and package-manager installations remain owned by their package manager.

**Stash or force-reset a dirty checkout** — rejected. Both operations can hide or destroy user work. The updater downloads without touching files and refuses installation until the checkout is clean.

**Trust a same-named local tag** — rejected. A package-owned isolated ref is force-updated from the configured official remote before installation.

## Consequences

Users can inspect version changes and release notes inside DSH, prepare an exact release without disturbing current work, and apply it only when the checkout admits a deterministic fast-forward. Update state survives restart in `.dsh-build/update-state.json`. The full install is intentionally unavailable in dirty, detached, divergent, unofficial, or package-managed installations.

The update feature depends on GitHub API availability for discovery and on Git/Corepack for source installation. A short validated response cache limits routine API traffic. The settings navigation scrolls independently so the added section remains reachable at short viewport heights.

## Verification

Focused Host tests cover Release selection and bilingual projection, official-origin forms, package detection, dirty-tree action gates, real temporary-repository target validation, exact fast-forward, successful supervised restart, clean-tree rollback, preservation of edits created after fast-forward, and durable request path rejection. Client tests cover lazy registration, Remote result handling, version and note rendering, refresh, download, confirmation, restart handoff, failure recovery, and package/up-to-date states. Web composition exercises the section through the built browser bundle, and the settings chrome test verifies keyboard-reachable scrolling at a short viewport.
