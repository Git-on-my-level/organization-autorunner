# Contracts

`/contracts` is the canonical contract source of truth for the monorepo.

## Files

- `oar-openapi.yaml`: canonical HTTP API contract (`OpenAPI 3.x`) with `x-oar-*` metadata used by CLI/help/doc generators.
- `oar-schema.yaml`: canonical domain/schema contract currently consumed by core validation.
- `gen/`: generated artifacts committed to source control.

## Generation

Generate all contract-derived artifacts from repo root:

```bash
./scripts/contract-gen
```

This writes deterministic outputs under:

- `contracts/gen/go/`
- `contracts/gen/ts/`
- `contracts/gen/meta/`
- `contracts/gen/docs/`

## Drift Check

Validate generated outputs are committed and not stale:

```bash
./scripts/contract-check
```

CI runs the same check and fails when artifacts drift.
