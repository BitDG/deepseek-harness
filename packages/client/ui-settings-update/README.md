---
description: "Web Settings section for DSH GitHub Release comparison, bilingual release notes, isolated download, and guarded install-and-restart confirmation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-update

English | [中文](README.zh.md)

## Summary

This browser plugin contributes the **DSH update** section to Web Settings. It lazily reads the Host `update` Remote, presents the running and offered versions on a version rail, renders every intermediate GitHub Release note in the active locale, and exposes separate download and install actions. Checkout facts and the first install blocker remain visible, so a dirty source tree can download an update but cannot apply it.

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

Open Settings and choose **DSH update**. The page checks once when mounted; **Check again** bypasses the Host's short cache. **Download version** fetches the exact target without changing the current files. **Install and restart** appears enabled only after every Host precondition passes and always requires an explicit confirmation that describes shutdown, locked install, build, restart, and guarded rollback.

The last durable worker state appears when available. A package installation shows release information but directs updates back to its package manager. Release markdown uses the shared safe renderer with raw HTML disabled.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers one locale-owned `settings.section` entry at order 40. Its injected functions unwrap only the generated `update` Remote results; no GitHub request runs during client-plugin activation. Component state owns loading, retry, download, confirmation, action failure, and restart handoff. The Host remains the authority for every action availability field.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale and Settings-slot registration plus Remote adapters |
| [`src/client/UpdateSection.tsx`](src/client/UpdateSection.tsx) | Version rail, actions, confirmation, operation state, and release notes |
| [`src/client/locales.ts`](src/client/locales.ts) | Typed Chinese and English product copy |
| [`src/client/UpdateSection.module.css`](src/client/UpdateSection.module.css) | Responsive section styling using shared design tokens |
| [`src/invariant.ts`](src/invariant.ts) | Package-owned invariant companion |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Host update package](../../host/update/README.md) — GitHub, Git, worker, and rollback policy.
- [Settings shell](../ui-settings/README.md) — section ownership and navigation.
- [API Remote assembly](../../api/remotes/README.md) — generated Host capability mounting.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser settings section registers no model-facing content.

#### KV Cache effect

None; the component never enters a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The page requires the Host update contribution; it does not call GitHub directly.
- Package installations cannot self-install from this page.
- The page reports worker state after reconnection; it cannot remain connected while the Host is stopped for an update.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
