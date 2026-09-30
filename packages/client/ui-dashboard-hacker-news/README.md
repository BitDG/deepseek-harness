---
description: "Hacker News top-stories card for the optional information dashboard."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-hacker-news

English | [中文](README.zh.md)

## Summary

Read current Hacker News top stories on the DSH dashboard and refresh them on demand. Story links open the source article or its discussion. The Host reads the public API through an authenticated DSH route, and a source failure stays within this card.

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

Enable the `ui-dashboard-hacker-news` row from the [`dsh-dashboard`](../../bundle/dashboard/README.md) bundle. Each opening fetches again; Refresh replaces the current request. A source failure stays within this card and does not affect the dashboard or other cards. Disabling this row removes the card and stops its request. Configure `storyCount` (default 8, range 1–20) and `requestTimeoutMs` (default 12000, range 1000–60000) on that row when needed.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [Host feed](src/feed.ts) reads a configured number of ids and their records from the [official Hacker News API](https://github.com/HackerNews/API). The [browser source](src/client/source.ts) reads only the authenticated same-origin `/api/dashboard.hacker-news` route, retains previous stories during refresh, and aborts work on unload. The [card](src/client/HackerNewsCard.tsx) renders API text through React and accepts only HTTP(S) article links.

Individual article failures retain successful stories in ranked order and report the failed count. A total failure reports timeout, connection, authentication, rate-limit, or invalid-data status. A failed refresh retains the last successful stories and their update time; reopening retries. Results are browser-memory state and do not survive a full reload.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Dashboard page](../ui-dashboard/README.md) — owns the card slot and grid.
- [Dashboard bundle](../../bundle/dashboard/README.md) — composes this card with the page.
- [Client packages](../README.md) — neighboring browser plugins.

-----

<a id="model-experience"></a>

## Model Experience

None, as external headlines render only in the browser and do not enter agent context.

#### KV Cache effect

None; the card does not assemble a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The Host must be able to reach the public API.

- It has no background polling and shows at most the configured number of top-story ids; deleted items are skipped.
- If the Host cannot reach the API, the card reports an error and retains its previous stories.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published; this source owns only its own request and snapshot.
