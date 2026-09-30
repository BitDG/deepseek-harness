---
description: "Optional DSH information dashboard shell and card extension slot."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard

English | [中文](README.zh.md)

## Summary

Add a Dashboard page to the Web sidebar and fill it with information cards from separate plugins. The page stays available when no cards are enabled and shows an empty state. Each card can be enabled or disabled without removing the page or the other cards.

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

Apply [the dashboard patch](../../bundle/dashboard/cordis.patch.yml) to a Web profile to mount this page with eight cards from four contributing plugins. The page also works by itself with the `ui-dashboard` row. A card package contributes one `dashboard.card` registration and declares this package in `dsh.client.inject`; it owns its data source and locale strings.

To add a source, give its package a separate Loader row, declare `@deepseek-ai/dsh-client-ui-dashboard` in `dsh.client.inject`, and call `ctx.slots.inject('dashboard.card', () => ctx.slots.register({ name: 'dashboard.card', id: 'my-source', order: 30 }, Card))` from its Client entry. Own subscriptions and requests with `ctx.effect()` so disabling that row removes the card and stops its work. The [Sessions](../ui-dashboard-sessions/src/client/index.ts) and [Hacker News](../ui-dashboard-hacker-news/src/client/index.ts) entries show both patterns.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [browser entry](src/client/index.ts) registers the sidebar panel row, a footer action, and the main panel through `ctx.slots.inject()`. The footer action opens the page in sidebar implementations that do not render panel rows. The panel declares a root-scoped list slot for cards. The [page](src/client/DashboardPage.tsx) renders that slot in a responsive grid; registration disposal removes a card and its effects without changing the other entries.

The calendar occupies the main desktop area; recent sessions, countdown, and time progress sit beside it, with external feeds below. Each card root declares a stable `data-dashboard-card` id. The page attaches move and resize controls without reparenting the plugin-owned React elements. Drag a top handle onto another card to reorder it, or use arrow keys with the handle focused; drag the bottom corner or use its arrow keys to resize. Order and sizes are saved in browser storage and can be reset from the page. The grid adapts to the panel width, including custom sidebar widths, and accepts later card contributions.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Dashboard bundle](../../bundle/dashboard/README.md) — an optional profile patch with independently contributed cards.
- [Slots](../../../docs/subsystems/slots.md) — registration, ordering, and lifecycle rules.
- [Client packages](../README.md) — neighboring browser plugins.

-----

<a id="model-experience"></a>

## Model Experience

None, as the page renders browser information without adding model-visible context.

#### KV Cache effect

None; the page does not assemble a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The calendar has a minimum size of 420 × 640 pixels; other cards have a minimum size of 280 × 160 pixels. Cards also grow to fit their full content at the current width; saved sizes cannot truncate content. Feed lists and session titles expand without internal scrollbars or ellipses. Width and height snap to grid tracks; a panel narrower than the calendar minimum scrolls horizontally instead of squeezing the date cells. Saved layouts are local to this browser and origin.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published; the page owns no independent cross-plugin observation.
