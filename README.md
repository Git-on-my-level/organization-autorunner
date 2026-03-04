# oar-ui — CAR ticket pack

This folder contains:
- `docs/`: the finalized spec and the concrete HTTP API contract for clients
- `contracts/oar-schema.yaml`: shared schema contract (v0.2.2)

Intended use: unzip into an empty `oar-ui` git repo, then run CAR.

## Runtime configuration

- `PUBLIC_OAR_CORE_BASE_URL`: base URL for the oar-core HTTP API.
  - Example: `PUBLIC_OAR_CORE_BASE_URL=http://127.0.0.1:8000`
  - If omitted, the UI uses same-origin requests.

On startup, the UI calls `GET /version` and requires
`schema_version === "0.2.2"`. If it does not match, boot fails with a clear
error so incompatible core/UI versions are surfaced immediately.
