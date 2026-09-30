---
description: "Five optional dashboard cards adapted from Glance community widget ideas."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-community

English | [中文](README.zh.md)

## Summary

Adds Tibo reset watch, recent GitHub repositories, a calendar, an editable countdown, and local-time progress to the DSH Dashboard. These are native DSH cards adapted from [Glance community widgets](https://github.com/glanceapp/community-widgets/blob/main/GALLERY.md) and Glance's built-in calendar. Glance YAML and Go templates do not execute inside DSH; a supplied YAML widget needs a source, data decoder, and card adapter here.

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

Enable `ui-dashboard-community` from the [Dashboard bundle](../../bundle/dashboard/README.md). Set `githubDays` (1–30, default 7), `githubCount` (1–20, default 8), and `requestTimeoutMs` (1000–60000, default 12000) on that Loader row if needed. The countdown date can be changed in its card and is saved in the current browser.

To adapt another Gallery widget, supply its YAML and required API details. A `custom-api` source maps to a fixed Host feed and a typed browser card; a date-only template maps to local date functions. An `extension` widget may also require its own service and cannot be copied as a standalone YAML file. The card is then registered in `dashboard.card` without changing the dashboard page.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The [Host feed](src/feed.ts) accesses fixed Tibo and GitHub origins through authenticated Connection routes. [Tibo's public API](https://tibo.cc/guide/api) supplies a nullable third-party forecast; stale or expired watches never display a probability. The GitHub card queries [GitHub Search](https://docs.github.com/en/rest/search/search#search-repositories) for recently created repositories, ranked by total stars. This replaces the Gallery [Trending GitHub Repositories](https://github.com/glanceapp/community-widgets/blob/main/widgets/trending-github-repositories/README.md) feed because its OSS Insights endpoint currently reports the event-derived ranking unavailable. It is a defined Search ranking, not GitHub's own Trending list. The calendar uses Monday-first weeks; countdown and progress adapt the Gallery [Countdown](https://github.com/glanceapp/community-widgets/blob/main/widgets/countdown/README.md) and [Time Bar](https://github.com/glanceapp/community-widgets/blob/main/widgets/time-bar/README.md) ideas. Progress uses actual local period endpoints, including leap years.

Opening the panel refreshes Tibo and GitHub through separate authenticated same-origin routes. Their browser sources retain the last successful result and update time on refresh failure, report specific errors, and retry on reopening. A null Tibo probability means the source supplied no number; a successfully loaded explanation remains visible. Calendar, countdown, and progress need no external request.

The [local calendar](src/client/calendar.ts) uses [lunar-typescript](https://github.com/6tail/lunar-typescript) for lunar dates, leap months, festivals, solar terms, and traditional almanac entries. Select a date to inspect stems, zodiac, deity fortune, suitable activities, and activities to avoid. Mainland China holidays and makeup workdays override normal weekdays using the library year data; the 2026 schedule matches the [official notice](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm). Years without a recorded official schedule are explicitly labeled and use weekday classification only. Navigation covers 1901–2099 in the browser local timezone. Almanac fortune is traditional folklore, not a factual prediction.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Dashboard page](../ui-dashboard/README.md) — owns the card slot.
- [Dashboard bundle](../../bundle/dashboard/README.md) — enables this package.
- [Glance Gallery](https://github.com/glanceapp/community-widgets/blob/main/GALLERY.md) — source examples for future adaptations.

-----

<a id="model-experience"></a>
## Model Experience

None, as all five cards render in the browser and do not add model input.

#### KV Cache effect

None; this package does not assemble model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Tibo is a third-party community source. Its `reset_chance_percent` can be null; no number is inferred from an observation level or historical interval.
- GitHub Search has its own public API rate limits. The card retains its last usable result and reports refresh errors.
- Community YAML requires an adapter per data source and presentation. This package does not interpret arbitrary Glance Go templates or run Gallery extension services.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer context</summary>

No separate runtime invariant is published: each card's feed and local date state are observed directly by its owner.

</details>
