# Agent Note: Managed OmniRoute model onboarding

Status: implemented

English | [中文](2026-09-01-omniroute-managed-model-onboarding.zh.md)

## Problem

The Web Models page could configure pi-ai providers but could not turn a locally installed OmniRoute into a usable provider in one action. Users had to start the gateway separately, avoid its dashboard and tray side effects, inspect its model catalog, and hand-maintain a provider profile. Folding that behavior into a generic provider form would also leave process ownership ambiguous: the Harness must not stop a service another operator started or replace an unrelated process occupying the configured port.

## Decision

`@deepseek-ai/dsh-llm-omniroute` is a dual Host/client Cordis plugin in the `llm` group and the shipped Web application bundle. Its Models-page card makes startup explicit. The Host accepts only a loopback HTTP origin and identifies OmniRoute through the unauthenticated `/api/health/ping` response, including the public route-class header, before adopting an existing endpoint.

When no service answers, the plugin resolves the configured credential before starting the executable through `ctx.subprocess` as `serve --port <port> --no-open --no-tray`. A Windows npm command shim resolves to Node and OmniRoute's adjacent ESM entry without a command shell. The explicit child environment restores the resolved value as `OMNIROUTE_API_KEY` because subprocess providers remove sensitive ambient variables, and supplies `BASE_URL` as an environment tombstone because Harness and Vite processes may use that name for another endpoint. Startup is single-flight, diagnostic capture is bounded, and any health, discovery, or settings failure rolls back the child created by that action.

The plugin resolves the configurable `apiKeyEnv` reference through `ctx.credentials` after the endpoint probe and before managed startup. It uses the resolved value for the managed service and `ctx.llm.discoverModels('llm-pi-ai', ...)`, but writes only the reference into `llm-pi-ai.providers.omniroute`, so `dsh-llm-pi-ai` re-resolves the credential for each request. The profile keeps only model IDs under `antigravity/`, `oc/`, or `opencode-go/`, labels their display names with the three-letter `[AGY]` or `[OPC]` suffix, and rejects a catalog with no selected model. Request IDs remain unchanged. This excludes duplicate `agy/` aliases, combos, and unrelated providers without changing OmniRoute routing. `dsh-llm-pi-ai` remains the sole model adapter and serves subsequent requests.

Process ownership remains local to the plugin instance. A managed service exposes Stop and is terminated during plugin disposal. An adopted service is marked external, exposes no stop action, and survives disposal. An unrecognized health document turns the state into a failure without starting or terminating anything on that origin.

## Alternatives considered

**Only document a manual `llm-pi-ai` profile.** This would connect an already running server, but it would not deliver the requested click-to-start path, ownership-safe stop behavior, or catalog import.

**Implement a second LLM provider adapter.** Rejected because OmniRoute already exposes an OpenAI-compatible API that `dsh-llm-pi-ai` serves. Another adapter would duplicate request conversion, retry, replay, and configuration behavior.

**Automatically open the dashboard or start during page load.** Rejected because viewing settings must remain read-only and should not take over the desktop. Startup and dashboard opening are separate explicit actions.

**Terminate any process on the configured port.** Rejected because endpoint occupancy does not imply ownership. Only a subprocess handle created by this plugin authorizes termination.

## Consequences

The shipped Web composition now offers one-click local OmniRoute startup, selected Antigravity and OpenCode model discovery, and route registration. The Host/client package owns lifecycle and presentation while existing LLM and settings seams own requests and persistence, so no agent-loop change or new model protocol exists.

The supported origin is intentionally local, while catalog discovery and model requests require the credential named by `apiKeyEnv`. Remote or HTTPS OmniRoute deployments remain direct `llm-pi-ai` configuration. The selected catalog is a point-in-time settings snapshot and must be refreshed by running the connect action again. OmniRoute entries outside the three accepted ID prefixes remain available through direct `llm-pi-ai` configuration but do not appear in the managed DSH profile.

Focused Host tests cover credential failure before process launch, explicit managed-child credential forwarding, authenticated discovery, source filtering, suffixes, adoption, managed startup, rollback, wrong-service refusal, single-flight calls, ownership-safe stop, and disposal. Client tests cover localized states and actions. A real Loader composition persists only the credential reference and an `[OPC]` model, then streams its authenticated reply through the registered `omniroute` provider against a deterministic local endpoint. The opt-in Windows product test starts the installed OmniRoute CLI silently, authenticates its live catalog with the forwarded credential, registers the route, stops it, and verifies process-tree reaping; it does not spend a real provider request.
