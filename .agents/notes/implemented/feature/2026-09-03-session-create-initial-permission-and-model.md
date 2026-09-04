# Agent Note: Session creation accepts initial permission and model selections

Status: implemented

English | [中文](2026-09-03-session-create-initial-permission-and-model.zh.md)

## Problem

Remote consumers that create Sessions for an external conversation need to choose that Session's permission preset and model before its first prompt. Calling the existing mutation endpoints after creation introduces an ordering gap, and `session.selectModel` also saves the selection as the Host-wide default. Reusing an explicit Session id creates a second risk: a create-or-adopt request could silently modify a Session that already exists.

## Decision

`SessionCreateRequest` accepts optional `permissionPreset` and `modelSelection` only when the Host generates the Session id. The controller validates both selections before creating the Agent, then records the permission preset and installs the Session-local model selection before returning. The first prompt therefore observes both values, while the Host's saved default model remains unchanged.

Requests that combine either initial selection with `sessionId` fail with `gateway/bad-request`. An unavailable permission preset fails with `session/permission-preset-unavailable`, and an unavailable model keeps the existing `session/model-unavailable` result. Validation completes before `ensureSession`, so a rejected selection does not create a Session.

## Verification

The Session Controller Host test covers successful generated-id creation, the recorded permission and model selections, rejection of unavailable presets, and rejection of initial selections during explicit-id adoption. The package typecheck and generated Cordis API output cover the public Remote declaration.

## Alternatives considered

**Call the existing mutation endpoints immediately after create.** This leaves a race in which a prompt can begin with the Host defaults, and `session.selectModel` deliberately persists a new Host-wide default.

**Allow initial selections during explicit-id adoption.** The caller cannot prove that the named Session is new. Rejecting the combination preserves adoption as a non-mutating identity check.

**Add IM-specific Host hooks.** Session initialization belongs to the Session Controller Remote API; transport-specific hooks would duplicate lifecycle ordering and prevent other Remote consumers from using the same guarantee.

## Consequences

Remote integrations can create a Session with deterministic permission and model choices without changing global defaults. Existing Sessions remain unchanged, including when a consumer retries creation with an explicit id. The API adds two optional request fields and one permission-specific failure code; no durable format or Session event type changes because the existing permission and model events record the selections.
