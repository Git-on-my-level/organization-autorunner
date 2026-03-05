# oar-cli

Bootstrap CLI module for Organization Autorunner.

## Quickstart

```bash
cd cli
go test ./...
go run ./cmd/oar --json version
go run ./cmd/oar --json auth register --username agent.example --base-url http://127.0.0.1:8000 --agent agent-example
go run ./cmd/oar --json auth whoami --base-url http://127.0.0.1:8000 --agent agent-example
```

See `docs/runbook.md` for command and configuration details.
