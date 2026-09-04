---
description: "GitHub Release discovery and guarded source-checkout updates: the update Remote, isolated tag download, post-shutdown fast-forward, build, restart, and clean-tree rollback policy."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-update

English | [中文](README.zh.md)

## Summary

This Host package owns the `update` Remote used by Web Settings. `update/check` compares the running DSH SemVer with the repository's GitHub Releases, includes prereleases by default, and returns every intermediate release note in English and Chinese. `update/download` fetches the selected official tag into an isolated `refs/dsh-update/` ref without changing the branch or working tree. `update/apply` is available only to a clean source checkout on a named branch whose configured remote is the official repository and whose downloaded target is a valid fast-forward.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a supported `dsh` Web profile and consume it through [`api-remotes`](../../api/remotes/README.md). Checking is read-only. Downloading writes only the isolated Git ref and remains available when the working tree is dirty. Installation re-reads every checkout fact; it never stashes, resets, rebases, or merges user work.

The GitHub endpoint, repository identity, remote name, prerelease policy, cache, response limits, and worker timeouts are plugin configuration. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-host-update) is the exhaustive field reference. Production defaults target `deepseek-ai/deepseek-harness`; a custom endpoint does not weaken the official-origin check used before download or install.

Package-manager installations can check and display releases, but this package does not replace a global npm or pnpm package. Their update action stays disabled and the client directs the user to the package manager that owns the installation.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`ReleaseCatalog` reads the Releases list rather than GitHub's latest-release endpoint, so prereleases and all notes between the running and target versions remain visible. It validates bounded JSON responses, accepts only `dsh-v<SemVer>` tags, and separates DSH's bilingual release headings while preserving single-language notes as a fallback.

`inspectCheckout` anchors the package inside a Git root whose root manifest is `@deepseek-ai/dsh-root`. HTTPS and GitHub SSH forms are the only official remotes. Download force-updates a package-owned ref from the exact remote tag, then reads the target's root `package.json` and verifies that the running commit is its ancestor.

Installation writes an owner-only request under `.dsh-build`, starts the bundled detached worker, and waits for its IPC readiness signal before asking the Host to exit. The worker revalidates the exact root, branch, HEAD, target commit, and clean status after shutdown; then it fast-forwards, runs frozen dependency installation and the repository build, and relaunches the same DSH invocation. A failed build resets only when HEAD, branch, and cleanliness still match the tree produced by the updater. If any process or user creates a change, the worker records failure and preserves it. The Windows source launcher remains the readiness supervisor when that launcher started the process; a direct invocation is recorded as `restarting` because a detached spawn alone is not readiness proof.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `update` Remote methods and action orchestration |
| [`src/release-catalog.ts`](src/release-catalog.ts) | Bounded GitHub Release retrieval and SemVer selection |
| [`src/source-checkout.ts`](src/source-checkout.ts) | Source identity, official-origin, isolated ref, and fast-forward checks |
| [`src/update-worker.ts`](src/update-worker.ts) | Post-shutdown update, guarded rollback, and restart |
| [`src/worker-protocol.ts`](src/worker-protocol.ts) | Durable request validation before Git execution |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion; actions revalidate their owned mutation facts |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Update Settings section](../../client/ui-settings-update/README.md) — the browser projection and confirmation flow.
- [Web application bundle](../../bundle/web-app/README.md) — the supported surface that composes both halves.
- [Windows source launcher decision](../../../.agents/notes/implemented/process/2026-09-01-windows-source-launcher-build-and-restart.md) — readiness and restart behavior reused by the worker.

-----

<a id="model-experience"></a>
## Model Experience

None, as release discovery and installation expose no tools, prompts, messages, or provider input.

#### KV Cache effect

None; the package does not assemble model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only source checkouts can self-install; package installations remain owned by their package manager.
- Installation requires a named branch, a clean working tree, an official remote, and a downloaded fast-forward target.
- The detached direct-invocation restart has no generic application-readiness signal and therefore remains recorded as `restarting`; the Windows source launcher can record `succeeded` after its existing readiness checks pass.
- GitHub API availability and its unauthenticated rate limit affect checks; a short in-process cache reduces repeated requests.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
