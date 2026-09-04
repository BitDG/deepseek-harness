# OmniRoute plugin instructions

The managed child must not inherit the Harness or Vite `BASE_URL`: OmniRoute treats that unrelated value as its own configuration and fails before its health endpoint becomes ready. Keep the environment tombstone and verify it with the live health probe plus process-tree reap.

Subprocess providers remove sensitive ambient variables. Resolve `apiKeyEnv` before managed startup and explicitly pass its value to the child as `OMNIROUTE_API_KEY`; keep the value out of argv and persisted settings, and verify authenticated live discovery.
