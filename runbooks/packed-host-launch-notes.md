# Packed-host launch notes

This note records the final packed-host launch review, the cutover evidence,
and the local smoke-specific overrides used for validation.

## 2026-03-24 launch review

Sub-agent review summary:

- Fixed blocker: `scripts/packed-host-smoke` now runs end to end, covers the
  shared web UI launch path, and records restore-drill evidence.
- Fixed blocker: shared web UI control-plane passkey auth now forwards the
  browser `Origin` through the UI server so WebAuthn control-plane flows work
  behind the shared UI.
- Fixed blocker: packed-host `core_origin` now resolves to the internal
  loopback listener derived from packed-host placement, so shared-UI dynamic
  routing can proxy to real workspace cores.
- Fixed blocker: packed-host provisioning docs and
  `provision-packed-workspace.sh` now use the same instance-root layout as the
  hosted backup and restore helpers.

Non-blocking follow-up:

- `scripts/packed-host-smoke` still uses `vite dev` for the local shared-UI
  process instead of the production `build/index.js` serve path. This is
  tracked in `TICKET-910-packed-host-production-ui-smoke.md`.

## Launch evidence

Validated on 2026-03-24:

- `./scripts/packed-host-smoke`
- `go test ./internal/controlplane/...`
- `pnpm -C web-ui exec vitest run tests/unit/controlSession.test.js tests/unit/authRoute.test.js`
- `bash -n scripts/packed-host-smoke`
- `bash -n scripts/hosted/provision-packed-workspace.sh`

Latest smoke artifact bundle:

- `.tmp/packed-host-smoke/run.TBOXc2`

Key smoke outcomes from that run:

- shared web UI login succeeded
- `POST /dashboard/launch` succeeded through the shared UI
- shared-UI proxied thread read succeeded after launch
- backup job succeeded
- restore drill succeeded with `restore_drill_job_id=job_4f8421aa-81fc-4d67-9696-f351493f4cd1`
- restored workspace launch and read succeeded
- dynamic routing reached a newly created restored workspace without static
  `OAR_WORKSPACES`

## Final launch state

- Shared UI routing for control-plane-managed workspaces no longer depends on a
  static `OAR_WORKSPACES` entry when a valid control-plane session is present.
- Packed-host workspace instance roots are now documented and provisioned as
  `/var/lib/oar/workspaces/<workspace-id>/` with `workspace/`, `config/`,
  `metadata/`, and `backups/`.
- Repo-side launch blockers are cleared. Opening the deployment to all requests
  is now an operator rollout decision at the shared hostname rather than a
  remaining code or doc blocker in this repo.

## Local smoke overrides

- Loopback ports are chosen dynamically during `scripts/packed-host-smoke`.
- `OAR_CONTROL_PLANE_WEBAUTHN_ORIGIN` is set to
  `http://localhost:<ui-port>` for the local smoke browser origin.
- `OAR_CONTROL_PLANE_WORKSPACE_URL_TEMPLATE` is set to
  `http://localhost:<ui-port>/%s` for the local shared-UI route shape.
- The local smoke uses `pnpm -C web-ui exec vite dev` for the shared UI.
