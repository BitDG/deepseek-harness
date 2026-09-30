---
description: "Host Teable records and Remote methods for DSH project tasks."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-teable-tasks

English | [中文](README.zh.md)

## Summary

This optional Host plugin reads and writes project and task records in a self-hosted Teable base. It links a project record to a DSH Workspace and can link a task to a Session. Teable owns the records; DSH keeps its Workspace and Session data in their existing stores.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Apply the [optional bundle patch](../../bundle/teable-tasks/cordis.patch.yml) to a Web profile. Its configuration reads `DSH_TEABLE_BASE_URL`, `DSH_TEABLE_ACCESS_TOKEN`, `DSH_TEABLE_PROJECT_TABLE_ID`, and `DSH_TEABLE_TASK_TABLE_ID` from the Host environment at boot. The access token stays on the Host and needs the `record|read`, `record|create`, and `record|update` scopes for both tables. The base URL must be an HTTPS origin, except for loopback HTTP.

Create two tables in one Teable base before enabling the patch:

| Table | Required fields |
|---|---|
| Projects | `Name` (single line text), `DshWorkspaceId` (single line text), `DshWorkspacePath` (single line text) |
| Tasks | `Title` (single line text), `Status` (single select with `Todo`, `In Progress`, `Done`), `ProjectId` (single line text), `DshSessionId` (single line text) |

Store the two table IDs in the matching environment variables. The four field names in each table are exact. `DshSessionId` may be empty on a task. An existing project row can be linked by filling `DshWorkspaceId` with the Workspace ID; `ensureProject` creates a row only when none has that ID. Duplicate project rows for one Workspace are rejected. Concurrent calls in one Host process share one create operation. Projects are not automatically renamed when a Workspace title changes.

The generated `ctx.remote.teableTasks` namespace exposes `listProjects`, `listTasks`, `webUrl`, `ensureProject`, `createTask`, and `setTaskStatus`. `webUrl` returns the site origin for opening Teable's full table views in a separate browser tab; it carries no token, and the user signs in to Teable there. `createTask` accepts an optional Session ID only when that Session belongs to the linked Workspace. The token and Teable response body are not sent to the Client on an HTTP failure.

-----

<a id="model-experience"></a>
## Model Experience

None; this plugin adds no model tool, prompt, or Session event. Task records are visible only through the Web page and Teable.

#### KV Cache effect

None; Teable records are not assembled into model requests.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Project uniqueness is checked by the Host, not enforced by Teable across independent Host processes or direct Teable edits.
- Listing reads every record page. Large tables have no server-side filter or incremental sync.
- The integration uses text IDs instead of Teable link fields, so deleting a Workspace or Session leaves its Teable row intact.
- The Teable site link uses the Host's configured origin. A remote browser cannot open a Host-only loopback URL.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Teable's [list](https://help.teable.ai/en/api-reference/record/list-records), [create](https://help.teable.ai/en/api-reference/record/create-records), and [update](https://help.teable.ai/en/api-reference/record/update-record) record endpoints use a Bearer token and `fieldKeyType=name`; the transport follows `extra.nextCursor` for list pages.

</details>

**Runtime invariant:** No companion is published. Teable owns records; the Host holds no second durable copy to compare.
