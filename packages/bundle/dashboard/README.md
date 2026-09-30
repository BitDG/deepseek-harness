---
description: "Optional DSH dashboard bundle with independently switchable information cards."
kind: "package-bundle"
---

# @deepseek-ai/dsh-dashboard

English | [中文](README.zh.md)

## Summary

Add a Dashboard page with Recent Sessions, Hacker News, five community-inspired cards, and Beszel device status to a Web profile. Each contributor occupies a separate plugin row and can be switched off without removing the page or the other contributors. Other information plugins can contribute cards through the same page slot.

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

In a source checkout with built Web artifacts, run `pnpm dsh web --patch packages/bundle/dashboard/cordis.patch.yml --no-open` to preview the five rows. The package declares `dsh.bundle.patch` for profile installation once published. Other card packages may register `dashboard.card` without editing this patch.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) inserts five Loader rows. The [dashboard page](../../client/ui-dashboard/README.md) declares the card slot; [Sessions](../../client/ui-dashboard-sessions/README.md), [Hacker News](../../client/ui-dashboard-hacker-news/README.md), and [community-inspired cards](../../client/ui-dashboard-community/README.md) populate it independently; [Devices](../../client/ui-dashboard-devices/README.md) adds a separately configured Beszel feed. A profile's later patch can disable one row by id.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle group](../README.md) — the other profile layers.
- [Profile composition](../../../docs/architecture.md) — patch order and row overrides.
- [Slots](../../../docs/subsystems/slots.md) — card registration lifecycle.

-----

<a id="model-experience"></a>

## Model Experience

None, as these rows change only the browser information page.

#### KV Cache effect

None; the bundle adds no model input.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

This bundle provides seven cards through three contributors.

- Additional sources require separate card plugins; this patch does not discover them automatically.
- The published install path depends on publishing this new package and is not part of this source-checkout preview.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published; the patch only composes rows.
