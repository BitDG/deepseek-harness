---
description: "Beszel device resources and temperatures for the optional dashboard."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-devices

English | [中文](README.zh.md)

## Summary

Display the machine running the DSH Host with online status, uptime, CPU usage and temperature, memory, storage, GPU usage and VRAM. The card adapts the [Beszel Server Stats community widget](https://github.com/glanceapp/community-widgets/blob/main/widgets/beszel-server-stats/README.md) and adds per-GPU readings. Missing metrics remain unavailable; an offline device shows its last sample.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>

## Use this package

Enable the `ui-dashboard-devices` row in the [dashboard bundle](../../bundle/dashboard/README.md). Configure `baseUrl` and either `apiToken` or `email` plus `password` on that Host row. Without connection settings, the card reads local hardware directly through `systeminformation`; Beszel is optional for remote systems. Partial credentials or invalid URLs fail plugin activation. Credentials belong in private profile configuration, never browser settings or committed patches.

```yaml
- id: ui-dashboard-devices
  config:
    baseUrl: !!js process.env.BESZEL_URL || ''
    apiToken: !!js process.env.BESZEL_TOKEN || ''
```

`systemCount` limits systems to 1–50 (default 12). `requestTimeoutMs` bounds a remote fetch, including authentication, and the Windows CPU sensor query, to 1000–60000 ms (default 12000). `cpuTemperatureSensor` selects an exact sensor key; otherwise CPU/package/Tctl/Tdie sensor names are matched and the highest reading is displayed. Beszel's primary sensor temperature is displayed separately as device temperature because it may refer to a disk or GPU.

Opening the card or pressing Refresh reads again. Source errors retain the previous readings and their read time. Device details disclose sample time, CPU model, kernel, each filesystem and swap. Memory and storage are displayed in binary units; GPU memory is converted from Beszel's MiB into GiB. No background polling is performed.

<a id="understand-the-implementation"></a>

## Understand the implementation

The [local collector](src/local.ts) reads CPU load, active memory, mounted filesystems and GPU driver metrics from the Host machine. Windows CPU temperatures come only from CPU-labelled sensors published by an existing LibreHardwareMonitor or OpenHardwareMonitor WMI provider; ACPI thermal zones are not treated as CPU readings. Unsupported sensor values stay unavailable, and virtual display adapters are omitted. Local collectors settle before plugin disposal completes. The optional [Host feed](src/feed.ts) reads `systems`, the newest `1m` `system_stats` record per system, and `system_details` when hardware metadata is absent from legacy `info`. The [Client source](src/client/source.ts) reads only the authenticated same-origin `/api/dashboard.devices` route. Redirects are refused, errors are sanitized, responses are non-cacheable, and plugin disposal aborts and awaits outstanding requests. Disabling this row removes its card and route.

<a id="further-exploration"></a>

## Further Exploration

- [Dashboard](../ui-dashboard/README.md) owns the card slot and grid.
- [Beszel GPU monitoring](https://beszel.dev/guide/gpu) describes platform and collector requirements.

<a id="model-experience"></a>

## Model Experience

None, as device readings render only in the browser and do not enter agent context.

#### KV Cache effect

None; the card does not assemble model requests.

<a id="known-limitations-and-deferred-work"></a>

## Known Limitations and Deferred Work

- Local readings describe the DSH Host rather than the browser device. CPU temperature requires an available hardware sensor provider; this package does not install sensor drivers. Remote Beszel systems require a deployed Hub and agents reachable from the DSH Host. This package does not install monitoring services or drivers. Available temperature and GPU readings depend on agent collectors and permissions. Unknown CPU sensor names require explicit configuration. GPU temperature is read from the temperature map under its device name; absent or differently named readings remain unavailable. Only the configured number of systems is shown; historical charts and alerts remain in Beszel.

<a id="dev-note"></a>

### Dev Note

**Runtime invariant:** No companion is published; the card owns only its requests and snapshots, with no independently maintained relation to assert.
