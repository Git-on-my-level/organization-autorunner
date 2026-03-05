# organization-autorunner

Monorepo for Organization Autorunner.

## Layout

- `contracts/`: canonical OpenAPI + schema contracts and generated artifacts
- `core/`: Go backend (`oar-core`)
- `web-ui/`: SvelteKit frontend (`oar-ui`)

## Quickstart

```bash
pnpm install
make check
make serve
```

Regenerate contract artifacts from the canonical OpenAPI contract:

```bash
make contract-gen
```

`make serve` starts both services with the UI pointed at core:

- core: `http://127.0.0.1:8000`
- web-ui: `http://127.0.0.1:5173`
- before UI startup, `web-ui/scripts/seed-core-from-mock.mjs` populates core using the mock dataset

## Useful Targets

- `make check`: run checks for both projects
- `make contract-check`: verify generated contract artifacts are up to date
- `make core-<target>`: pass through to `core/Makefile`
- `make web-ui-<target>`: pass through to `web-ui/Makefile`

Useful `make serve` toggles:

- `SEED_CORE=0`: skip seeding
- `FORCE_SEED=1`: seed even when marker data is already present
