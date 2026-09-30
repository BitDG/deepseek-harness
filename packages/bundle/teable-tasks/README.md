---
description: "Optional Teable project and task integration for DSH Web."
kind: "package-bundle"
---

# @deepseek-ai/dsh-teable-tasks

English | [中文](README.zh.md)

## Summary

This bundle patch adds the Host Teable Remote and the DSH Web Projects and Tasks page. It keeps the integration out of shipped default profiles.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Create the two tables and fields described in the [Host package](../../api/teable-tasks/README.md). Set `DSH_TEABLE_BASE_URL`, `DSH_TEABLE_ACCESS_TOKEN`, `DSH_TEABLE_PROJECT_TABLE_ID`, and `DSH_TEABLE_TASK_TABLE_ID` in the process that starts DSH. Then run `pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch packages/bundle/teable-tasks/cordis.patch.yml --no-open` from a built source checkout. The package declares `dsh.bundle.patch` for profile installation when published.

-----

<a id="model-experience"></a>
## Model Experience

None; the bundle adds a Host Remote and browser page, without adding model input.

#### KV Cache effect

None.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- A reachable Teable instance and prepared tables are required. This package does not provision or migrate Teable.
- The published install path depends on publishing this package; the source checkout uses the patch path above.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The [patch](cordis.patch.yml) inserts separate Host and Client Loader rows so the integration can be removed without changing the Web profile.

</details>

**Runtime invariant:** No companion is published; the bundle only composes two plugin rows.
