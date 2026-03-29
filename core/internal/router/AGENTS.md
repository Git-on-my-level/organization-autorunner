# AGENTS

## Scope
Guide for work inside `core/internal/router/`.

Read this after [core/AGENTS.md](../../AGENTS.md). This package owns the workspace-scoped wake-routing runtime that runs beside `oar-core`.

## Package Purpose
`oar-router` converts durable `message_posted` events into durable wake requests for bridge-managed agents.

It should stay:
- lightweight to deploy beside `oar-core`
- bounded to documented OAR primitives and HTTP/SSE surfaces
- explicit about workspace scope rather than host scope
- easy for future agents to extend without re-reading the whole repo

## High-Value Invariants
- Routing is workspace-scoped. Do not add host-local assumptions to wake decisions.
- Router state is local operational state only; canonical truth still lives in OAR primitives.
- Wake eligibility must remain driven by registration plus fresh bridge check-ins, never registration alone.
- Event handling must be idempotent across reconnects and duplicate deliveries.
- Keep the router able to run as a separate process from both `oar-core` and the per-agent bridge.

## Edit Routing
- HTTP shape or auth semantics that affect other modules still start from contracts/core docs first.
- Keep mention parsing, readiness validation, and wake emission logic easy to find and test separately.
- If you add new operator-facing behavior, update `core/README.md` and `core/docs/runbook.md` in the same change.

## Validation
- `go test ./internal/router/... ./cmd/oar-router/...`
- `./scripts/build-prod`
- Relevant repo-level checks when the change crosses module boundaries.
