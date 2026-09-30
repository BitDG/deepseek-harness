---
description: "Recent DSH Sessions card for the optional information dashboard."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-sessions

English | [中文](README.zh.md)

## Summary

See recent DSH sessions beside other dashboard information and open one directly. The card shows the six most recently updated non-blank, unarchived top-level sessions. It follows the existing session catalog without a second Host request.

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

Enable the `ui-dashboard-sessions` row from the [`dsh-dashboard`](../../bundle/dashboard/README.md) bundle. Disabling it removes only this card. Session titles and running state follow the existing Client catalog.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [browser entry](src/client/index.ts) registers this card into `dashboard.card`. The [component](src/client/SessionsCard.tsx) reads existing Session and Workspace hooks, filters archived or child sessions, and uses `ctx.uiWorkspace` to open a selected session. The card has no separate data store.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Dashboard page](../ui-dashboard/README.md) — owns the card slot and grid.
- [Session UI](../ui-session/README.md) — provides the existing session hooks.
- [Dashboard bundle](../../bundle/dashboard/README.md) — composes this card with the page.

-----

<a id="model-experience"></a>

## Model Experience

None, as this card reads Session metadata only for the human-facing page.

#### KV Cache effect

None; it does not assemble a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The card is a compact view of the session catalog.

- It shows at most six sessions and does not search or page through older sessions.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published; the card reads existing client stores without a second mutable observation.
