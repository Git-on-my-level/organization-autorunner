# SaaS packed-host v1

This is the recommended PMF deployment shape for Organization Autorunner given the current codebase.

## Goal

Launch SaaS without forking the product into a separate multitenant core, without paying for a large idle fleet, and without forcing early shared-row multitenancy into `oar-core`.

## Shape

- one shared `oar-control-plane`
- one shared `oar-web-ui`
- many isolated `oar-core` processes
- one SQLite database per workspace
- one blob namespace per workspace
- one Linux host first, additional hosts later only if needed

## Why this shape

The current repo already optimizes for isolated workspace instances:

- `oar-core` starts against one `--workspace-root`
- canonical state is one local SQLite DB per workspace
- the control plane already models isolated workspaces, service identities, routing manifests, and hosted scripts
- self-host already maps cleanly to “one core, one workspace”

That means the simplest maintainable SaaS is not shared row-level multitenancy. It is **packed isolated instances**.

## PMF recommendation

Start with:

- Ubuntu or Debian VM
- Caddy
- `oar-control-plane` on loopback
- `oar-web-ui` on loopback
- `oar-core@<workspace>` systemd template on loopback
- filesystem blobs first
- nightly backups
- regular restore drills

Only move blobs to S3-compatible storage if you specifically want off-host blob durability or easier storage expansion before adding a second host.

## Public routing

Expose only the shared web UI publicly.

Recommended public shape:

- `https://app.example.com/dashboard`
- `https://app.example.com/auth`
- `https://app.example.com/<workspace-slug>/...`

The web UI remains the public entrypoint. It proxies control-plane requests and workspace requests internally.

That keeps:

- control plane on loopback
- workspace cores on loopback
- one TLS edge
- one browser origin for passkeys

## Non-goals for v1

Do not add these before PMF forces the issue:

- Kubernetes
- one deployed cloud service object per workspace
- shared row-level multitenancy inside `oar-core`
- remote SQL for every workspace
- multiple availability zones
- zero-downtime fleet orchestration
- automatic second-host scheduling

## Required supporting changes

To make this shape real and maintainable, the product needs:

- blob usage accounting that does not walk backends on hot paths
- a real S3-compatible blob backend
- projection mode control
- workspace heartbeats from `oar-core`
- control-plane packed-host placement metadata
- dynamic workspace routing in `oar-web-ui`

Those are the first CAR tickets in this pack.

## Growth path

When one host fills up:

1. Add a second packed host.
2. Extend the control-plane placement table, not the `oar-core` product model.
3. Keep one workspace = one core process = one workspace root.
4. Add more automation only after operator repetition makes it worthwhile.
