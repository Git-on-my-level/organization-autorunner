# oar-cli Runbook (bootstrap)

## Build

```bash
cd cli
go build ./cmd/oar
```

## Test

```bash
cd cli
go test ./...
```

## Global flag precedence

Resolution order is:

1. command-line flags
2. environment variables
3. profile file (`~/.config/oar/profiles/<agent>.json` by default)
4. built-in defaults

Supported env vars:

- `OAR_BASE_URL`
- `OAR_AGENT`
- `OAR_JSON`
- `OAR_NO_COLOR`
- `OAR_TIMEOUT`
- `OAR_PROFILE_PATH`
- `OAR_ACCESS_TOKEN`

## Baseline commands

- `oar version`
- `oar doctor`
- `oar api call`
- `oar auth register`
- `oar auth whoami`
- `oar auth update-username`
- `oar auth rotate`
- `oar auth revoke`
- `oar auth token-status`

### `oar api call` examples

```bash
oar api call --path /version
printf '{"thread":{"title":"t"}}' | oar api call --method POST --path /threads --json
oar api call --raw --path /health
```

## Auth lifecycle examples

```bash
oar --json --base-url http://127.0.0.1:8000 --agent agent-a auth register --username agent.a
oar --json --base-url http://127.0.0.1:8000 --agent agent-a auth whoami
oar --json --base-url http://127.0.0.1:8000 --agent agent-a auth update-username --username agent.a.renamed
oar --json --base-url http://127.0.0.1:8000 --agent agent-a auth rotate
oar --json --base-url http://127.0.0.1:8000 --agent agent-a auth token-status
oar --json --base-url http://127.0.0.1:8000 --agent agent-a auth revoke
```

Notes:
- `auth register` and `auth update-username` also accept `OAR_USERNAME`.
- Profile and key material are written with strict local permissions (`0700` directories, `0600` files).
- Access tokens refresh automatically for authenticated commands when near expiry.
