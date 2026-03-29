# organization-autorunner-core

Go-first bootstrap for the Organization Autorunner core backend.

This repo currently includes:
- `docs/`: spec + HTTP contract
- `../contracts/oar-schema.yaml`: shared schema
- `cmd/oar-core`: HTTP server (`/health`, `/livez`, `/readyz`, `/ops/health`, `/version`) with SQLite+filesystem workspace init
- `cmd/oar-router`: workspace-scoped wake-routing service that converts `message_posted` `@handle` mentions into durable wake requests
- `cmd/oar-control-plane`: SaaS control-plane HTTP server for accounts, organizations, workspace registry, jobs, invites, and audit state
- `scripts/dev`, `scripts/dev-router`, `scripts/lint`, `scripts/test`: local workflows

## Quickstart

```bash
./scripts/test
./scripts/dev
./scripts/dev-router
./scripts/dev-control-plane
```

## Workspace Layout

By default, the server initializes storage under `.oar-workspace/`:
- `state.sqlite`: SQLite database (events, snapshots, artifacts metadata, actors, derived views)
- `artifacts/content/`: immutable artifact content files
- `logs/` and `tmp/`: reserved operational directories
- `router/`: router-local state and optional auth state when `oar-router` runs beside `oar-core`

Config can be passed via flags or env vars:
- `--workspace-root` / `OAR_WORKSPACE_ROOT`
- `--host` + `--port` / `OAR_HOST` + `OAR_PORT`
- `--listen-addr` / `OAR_LISTEN_ADDR` (overrides host+port)

## Workspace Router

`oar-router` is the workspace-owned wake-routing runtime. It tails workspace
`message_posted` events from `oar-core`, resolves `@handle` mentions, verifies
bridge readiness from durable registration/check-in state, and emits
`agent_wakeup_requested` plus the wake artifact consumed by per-agent bridges.

For local development:

```bash
./scripts/dev
./scripts/dev-router
```

For production-like local runs:

```bash
./scripts/build-prod
./scripts/run-prod
./scripts/run-prod-router
```
