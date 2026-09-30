---
description: "Optional DSH Web page for Teable projects and tasks."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-teable-tasks

English | [中文](README.zh.md)

## Summary

This optional Web plugin adds a Projects and Tasks page to the DSH sidebar. A user can link a DSH Workspace to a Teable project row, create tasks, change their status, and open a linked DSH Session. The page uses the Host Teable Remote; it does not store task copies in the browser.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Apply the [Teable bundle patch](../../bundle/teable-tasks/cordis.patch.yml) after configuring its two tables and Host environment. The page registers a main panel, a sidebar panel row, and a footer action, with Chinese and English labels. Selecting a project filters tasks to that project's `ProjectId`. The optional Session selector lists Sessions from the linked Workspace; opening a task's Session returns to DSH's existing Workspace navigation. The Open Teable link opens the Teable site in a new tab for full grid, view, and field management; the user signs in there separately.

-----

<a id="model-experience"></a>
## Model Experience

None; page actions do not write model input or Session events.

#### KV Cache effect

None; task data is not added to model requests.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The page lists all Teable records and filters tasks in the browser; it has no search, sorting, or pagination controls.
- A linked Session is selected by ID, without a title preview.
- Creation and status changes are available in DSH; editing other fields remains in Teable.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The [Client entry](src/client/index.ts) registers the page and navigation through DSH slots. The [Host owner](../../api/teable-tasks/README.md) owns the token and record validation.

</details>

**Runtime invariant:** No companion is published. The page derives its view from the Remote response and has no second durable task state.
