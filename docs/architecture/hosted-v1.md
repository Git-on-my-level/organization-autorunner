# Hosted v1 Architecture

This document describes the architecture for the initial managed offering of Organization Autorunner (OAR). It builds on the foundation decisions in [foundation.md](foundation.md) and provides concrete guidance for implementing a hosted service.

## Executive Summary

Hosted v1 prioritizes **per-workspace isolation** and **operational simplicity** over shared-infrastructure optimization. Each workspace is an independent unit with its own storage, making provisioning, backup, and migration straightforward while avoiding the complexity of row-level multitenancy.

## Per-Workspace Isolation

### Isolation Model

In hosted v1, each workspace is fully isolated:

- **Independent SQLite database**: Each workspace has its own `state.sqlite` file containing all structured data (events, snapshots, artifact metadata, documents, actors, derived views).
- **Independent blob storage**: Each workspace has its own content-addressable blob store for artifacts and documents.
- **No cross-workspace queries**: There is no shared state at the storage layer. All operations are scoped to a single workspace.
- **Independent lifecycle**: Workspaces can be provisioned, backed up, restored, and deprovisioned independently.

### Rationale

Per-workspace isolation is chosen for hosted v1 because:

1. **Operational simplicity**: Each workspace is self-contained. Backup is a filesystem snapshot. Migration is a directory copy.
2. **Clear security boundaries**: No risk of cross-tenant data leakage through queries or joins.
3. **Predictable performance**: One workspace's activity cannot directly impact another's query latency.
4. **Simple reasoning**: Developers and operators can think about one workspace at a time.
5. **Easy per-customer deployment**: Isolated workspaces can be placed on different storage tiers or regions if needed.

### Why Shared Row-Level Multitenancy Is Deferred

Shared row-level multitenancy (a single database with `workspace_id` columns on every table) is intentionally deferred because:

1. **Complexity cost**: Every query must include workspace filtering. Every index must consider workspace partitioning. Every migration must preserve workspace isolation.
2. **Security risk**: A single missing filter clause could expose cross-tenant data. This requires extensive testing and auditing.
3. **Limited benefit at v1 scale**: At initial scale, the overhead of separate databases is modest compared to the engineering investment in safe multitenancy.
4. **Future optionality**: Starting with per-workspace isolation does not preclude migrating to shared multitenancy later. The reverse migration would be much harder.

Row-level multitenancy may become relevant at scale where:
- Workspace count grows into thousands or tens of thousands
- Storage efficiency becomes a dominant cost driver
- Cross-workspace analytics features are required

## Control Plane Responsibilities

The control plane is a separate component responsible for workspace lifecycle and cross-cutting concerns. In hosted v1, the control plane handles:

### Workspace Provisioning

- Create workspace directory structure
- Initialize SQLite database with schema
- Configure blob storage backend
- Register workspace in the control plane's directory
- Return workspace connection details to the requester

### Workspace Deprovisioning

- Mark workspace as archived (prevent new writes)
- Initiate backup/archive workflow
- Delete workspace storage after retention period
- Remove from control plane directory

### Access Control

- Map human users (via passkey identity) to workspace membership
- Map agent keys to workspace access grants
- Issue short-lived workspace access tokens
- Revoke access on membership changes

### Routing

- Route incoming requests to the correct workspace
- Validate workspace is active before routing
- Handle workspace-level rate limiting

### Health Monitoring

- Track workspace-level health metrics
- Alert on storage quota approaching limits
- Monitor projection worker lag per workspace

## Authentication Model

### Humans: Passkey Authentication

Human users authenticate via WebAuthn passkeys:

1. User registers passkey during onboarding
2. Login ceremony presents a challenge signed by the passkey
3. Server verifies signature against registered credential
4. Server issues session token scoped to authorized workspaces

Benefits:
- Phishing-resistant (bound to origin)
- No password management
- Hardware-backed security option (YubiKey, etc.)

### Agents: Key-Pair Authentication

Agents authenticate via public/private key pairs:

1. Agent generates or receives key pair during provisioning
2. Agent registers public key with control plane
3. Agent signs a challenge with private key on each request
4. Server verifies signature and checks workspace access

Benefits:
- No shared secrets in transit
- Key rotation without password changes
- Clear audit trail linking actions to specific agent keys

### Legacy Actor Mode (Development Only)

`OAR_ENABLE_DEV_ACTOR_MODE=1` allows unauthenticated actor creation for local development. This must **never** be enabled in hosted environments.

## Blob Storage Seam

Hosted v1 abstracts blob storage behind a seam to enable future migration to cloud object storage without core logic changes.

### Interface

The blob storage interface (`internal/blob.Backend`) provides:

```
type Backend interface {
    // Write stores content and returns its content-addressable hash.
    Write(ctx context.Context, content []byte) (hash string, error)
    
    // Read retrieves content by hash. Returns ErrNotFound if missing.
    Read(ctx context.Context, hash string) ([]byte, error)
    
    // Exists checks if content exists for the given hash.
    Exists(ctx context.Context, hash string) (bool, error)
    
    // Delete removes content by hash. May be no-op for append-only backends.
    Delete(ctx context.Context, hash string) error
}
```

### Current Implementation: Filesystem

The default backend (`blob.NewFilesystemBackend(rootDir)`) stores content as files:

- Path: `<root>/<hash[:2]>/<hash>`
- Content-addressable: same content always has same path
- Automatic deduplication: writing existing content is idempotent

### Configuration

Blob backend is configured via environment:

```
OAR_BLOB_BACKEND=filesystem   # Only option in v1
OAR_BLOB_ROOT=/path/to/blobs  # Workspace artifact content directory
```

### Future: Object Storage

The seam enables future backends:
- S3-compatible storage
- Google Cloud Storage
- Azure Blob Storage

No code changes in `primitives` or `docs_store` are required to add new backends—only a new `Backend` implementation.

## Projection Worker / Materialization

Derived views (inbox, board summaries, thread projections) are computed in the background to ensure responsive reads.

### Projection Worker

Each workspace has an associated projection worker that:

1. Watches for new events/changes
2. Updates derived tables (inbox, stale threads, board summaries)
3. Maintains materialization timestamps for cache invalidation

### Why Background Materialization

- **Read latency**: Pre-computed views avoid expensive queries on every read
- **Consistency**: Single worker serializes view updates per workspace
- **Observability**: Materialization lag is a clear health metric

### Deployment Options

In hosted v1, projection workers can be:
- Embedded in the core server process (single binary)
- Separate worker processes per workspace (for scaling)
- Pool of workers consuming from a work queue (future)

## Backups / Export / Restore

### Backup Strategy

Per-workspace isolation enables simple backup:

1. **Quiesce writes**: Signal workspace to stop accepting writes
2. **Filesystem snapshot**: Copy SQLite file and blob directory
3. **Resume writes**: Unblock workspace operations

For cloud deployments, this can use:
- Volume snapshots (EBS, etc.)
- Object storage versioning
- Periodic `sqlite3 .dump` + blob sync

### Export Format

Export produces a portable directory structure:

```
export/
  manifest.json           # Metadata about export (version, timestamp)
  state.dump.sql          # SQLite dump
  blobs/                  # Content-addressable blob files
    ab/
      abc123...
    cd/
      cdef456...
```

### Restore Process

1. Create new workspace directory
2. Restore SQLite from dump
3. Copy blob files
4. Run consistency checks
5. Register workspace with control plane

### Cross-Environment Migration

The export format is environment-agnostic. Workspaces can be:
- Migrated from on-prem to hosted
- Cloned for development/testing
- Archived to cold storage

## Security Considerations

### Data Isolation

- Each workspace's SQLite and blobs are in separate directories
- Control plane enforces workspace access before routing
- No cross-workspace queries in core logic

### Key Management

- Agent private keys stored securely (env vars, secret manager)
- Key rotation: register new key, update control plane, remove old key
- Compromised keys: immediate revocation via control plane

### Audit Trail

- All writes are attributed to an actor (human or agent)
- Actor identity is verified before mutation
- Event log provides tamper-evident history

## Deployment Topology

### Minimal Hosted v1

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │   Control Plane │
                    │  (routing, auth)│
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────┴────────┐ ┌────────┴────────┐ ┌────────┴────────┐
│   Workspace A   │ │   Workspace B   │ │   Workspace C   │
│  (core + blobs) │ │  (core + blobs) │ │  (core + blobs) │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Scaling Considerations

- Add more workspace instances horizontally
- Separate projection workers for high-activity workspaces
- Blob storage can move to shared object store without core changes

## Future Evolution

Hosted v1 architecture is designed to evolve:

1. **Shared object storage**: Multiple workspaces can share S3/GCS backend
2. **Workspace sharding**: Route workspaces to different regions
3. **Cross-workspace views**: Optional aggregated views (requires explicit opt-in)
4. **Row-level multitenancy**: Migrate to shared database if scale demands it

The blob storage seam and per-workspace isolation ensure these evolutions are possible without rewriting core logic.

## References

- [Foundation Architecture](foundation.md)
- [Core Runbook](../../core/docs/runbook.md)
- [Contracts](../../contracts/)
