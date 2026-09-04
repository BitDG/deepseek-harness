---
description: "One-click local OmniRoute startup, model discovery, and llm-pi-ai route onboarding for the DeepSeek Harness Web model settings page."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-omniroute

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-llm-omniroute` adds an OmniRoute card to the Web Models settings page. One explicit click adopts a healthy local OmniRoute service or starts the installed CLI without opening its tray or dashboard, discovers `/v1/models`, and writes an `omniroute` profile containing only Antigravity and OpenCode models for `dsh-llm-pi-ai`. The plugin owns and may stop only the process tree it started; a service that was already running stays externally managed. Settings store a credential reference, never the OmniRoute API key value.

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

Mount the plugin beside `dsh-llm-pi-ai`, a writable settings provider, the LLM service, Typert, credential, and subprocess providers; the shipped Web application bundle already supplies those dependencies.

### When to choose it

Choose this plugin when OmniRoute is installed on the same machine as the Harness Web host and the user should start and connect it from Models settings. Configure an `llm-pi-ai` provider directly instead when OmniRoute is remote, authenticated, already managed by deployment infrastructure, or must use a non-loopback HTTPS endpoint.

### Minimal configuration

The shipped Web application mounts this row through its bundle patch:

```yaml
- name: '@deepseek-ai/dsh-llm-omniroute'
```

| Field | Default | Meaning |
|---|---|---|
| `executable` | `omniroute` | Bare PATH command or absolute OmniRoute executable |
| `dashboardURL` | `http://127.0.0.1:20128` | Unauthenticated loopback HTTP origin used for health, models, API routing, and the explicit dashboard action |
| `apiKeyEnv` | `OMNIROUTE_API_KEY` | Credential reference resolved for managed-service authentication, model discovery, and every routed request |
| `startTimeoutMs` | `90000` | Maximum wait for a newly started service to become healthy |
| `healthTimeoutMs` | `2000` | Timeout for each health request |
| `healthPollMs` | `250` | Delay between startup health requests |
| `disposeGraceMs` | `5000` | Grace period before forcefully ending the owned process tree |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-llm-omniroute) is the exhaustive source for every accepted field.

### Use the Models page

Configure the credential named by `apiKeyEnv`, open Settings, select Models, and press **Start and connect** on the OmniRoute card. A healthy service is accepted only when `/api/health/ping` returns OmniRoute's public route marker and a healthy status. The action uses the resolved credential to discover `/v1/models`, then writes `llm-pi-ai.providers.omniroute` with the credential reference and OpenAI-compatible `/v1` endpoint. It keeps `antigravity/`, `oc/`, and `opencode-go/` model IDs, appends `[AGY]` or `[OPC]` to their display names, and omits every other catalog entry. **Open OmniRoute dashboard** is separate and never fires during startup.

When the card says the service is managed by DeepSeek Harness, **Stop service** terminates that owned process tree and leaves the provider profile available for the next start. When the card says an existing service is in use, no stop action is offered. An occupied port with an unrecognized health document fails without replacing or terminating that process.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host service exposes `status`, `startAndConnect`, and `stop` through its generated Typert Remote. Startup is single-flight, resolves the configured credential before launching a managed service, and invokes OmniRoute as `serve --port <port> --no-open --no-tray`. The explicit child environment restores that value as `OMNIROUTE_API_KEY` after the subprocess provider removes ambient secrets, removes the unrelated ambient `BASE_URL`, bounds captured diagnostics, and rolls back a newly created child when health, discovery, or settings mutation fails. On Windows, an npm `.cmd` shim resolves to Node plus OmniRoute's adjacent ESM entry instead of entering a command shell.

The client mounts the generated Remote descriptor and contributes a localized card to `settings.models.footer`. The Host resolves `apiKeyEnv` through `ctx.credentials`, filters and labels the authenticated discovery result, and fails before settings mutation when the credential is missing or no Antigravity or OpenCode model remains. Every later model request remains owned by `dsh-llm-pi-ai`; this package does not implement a second LLM adapter.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Host lifecycle, health verification, discovery, settings mutation, and ownership-safe teardown |
| [`src/types.ts`](src/types.ts) | Client-safe lifecycle result types |
| [`src/client/index.ts`](src/client/index.ts) | Remote mount, locale registration, and Models-page slot contribution |
| [`src/client/OmniRouteCard.tsx`](src/client/OmniRouteCard.tsx) | Explicit start, dashboard, and owned-stop actions |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [llm-pi-ai](../llm-pi-ai/README.md) — the adapter that serves the imported provider profile.
- [LLM service](../llm/README.md) — provider discovery and registered model routes.
- [Subprocess service](../../subprocess/subprocess/README.md) — owned process-tree lifecycle used for local startup.
- [Settings service](../../settings/settings/README.md) — the writable namespace receiving the provider profile.
- [OmniRoute managed onboarding Agent Note](../../../.agents/notes/implemented/feature/2026-09-01-omniroute-managed-model-onboarding.md) — ownership, health, and composition decisions.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `dsh-llm-pi-ai` provider profile created from OmniRoute's discovered catalog.

#### KV Cache effect

This lifecycle and settings package adds no request tokens and does not invalidate an already reusable prefix; the selected OmniRoute model and `dsh-llm-pi-ai` request path own provider cache behavior.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only loopback HTTP OmniRoute origins are accepted; remote or HTTPS deployments must be configured directly through `dsh-llm-pi-ai`.
- The plugin requires an installed `omniroute` executable and does not install or update OmniRoute.
- A missing `apiKeyEnv` credential fails the connect action before a managed process starts; the plugin does not create or store OmniRoute API keys.
- Model discovery runs when the user clicks connect; the stored catalog does not refresh continuously.
- The imported catalog intentionally excludes OmniRoute combos, aliases such as `agy/`, and providers other than Antigravity and OpenCode.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The opt-in real-product test uses `DSH_EXPECT_OMNIROUTE=1` and `OMNIROUTE_API_KEY`, starts the installed CLI on port 20130, selects Antigravity and OpenCode entries from its authenticated live catalog, registers the route, stops it, and verifies the endpoint is no longer healthy. It does not send a paid model request; the Loader composition test covers credential use, suffix persistence, and the streaming request path against a deterministic local OpenAI-compatible fixture.

</details>
