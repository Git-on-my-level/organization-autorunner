# organization-autorunner

Monorepo for Organization Autorunner.

## Layout

- `core/`: Go backend (`oar-core`)
- `web-ui/`: SvelteKit frontend (`oar-ui`)

## Quickstart

```bash
pnpm install
make check
make serve
```

`make serve` starts both services with the UI pointed at core:

- core: `http://127.0.0.1:8000`
- web-ui: `http://127.0.0.1:5173`

## Useful Targets

- `make check`: run checks for both projects
- `make core-<target>`: pass through to `core/Makefile`
- `make web-ui-<target>`: pass through to `web-ui/Makefile`
