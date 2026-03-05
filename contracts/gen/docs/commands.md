# OAR Command Registry

Generated from `contracts/oar-openapi.yaml`.

- OpenAPI version: `3.1.0`
- Contract version: `0.2.2`
- Commands: `26`

## `actors.list`

- CLI path: `actors list`
- HTTP: `GET /actors`
- Stability: `stable`
- Input mode: `none`
- Why: Resolve available actor identities for routing writes.
- Concepts: `identity`
- Error codes: `actor_registry_unavailable`
- Output: Returns `{ actors }` ordered by created time ascending.
- Agent notes: Safe and idempotent.
- Examples:
  - List actors: `oar actors list --json`

## `actors.register`

- CLI path: `actors register`
- HTTP: `POST /actors`
- Stability: `stable`
- Input mode: `json-body`
- Why: Bootstrap an authenticated caller identity before mutating thread state.
- Concepts: `identity`
- Error codes: `invalid_json`, `invalid_request`, `actor_exists`
- Output: Returns `{ actor }` with canonicalized stored values.
- Agent notes: Not idempotent by default; repeated creates with same id return conflict.
- Examples:
  - Register actor: `oar actors register --id bot-1 --display-name "Bot 1" --created-at 2026-03-04T10:00:00Z --json`

## `artifacts.content.get`

- CLI path: `artifacts content get`
- HTTP: `GET /artifacts/{artifact_id}/content`
- Stability: `stable`
- Input mode: `none`
- Why: Fetch opaque artifact bytes for downstream processors.
- Concepts: `artifacts`, `content`
- Error codes: `not_found`
- Output: Raw bytes; content type mirrors stored artifact media.
- Agent notes: Stream to file for large payloads.
- Examples:
  - Download content: `oar artifacts content get --artifact-id artifact_123 > artifact.bin`

## `artifacts.create`

- CLI path: `artifacts create`
- HTTP: `POST /artifacts`
- Stability: `stable`
- Input mode: `file-and-body`
- Why: Persist immutable evidence blobs and metadata for references and review.
- Concepts: `artifacts`, `evidence`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ artifact }` metadata after content write.
- Agent notes: Treat as non-idempotent unless caller controls artifact id collisions.
- Examples:
  - Create structured artifact: `oar artifacts create --from-file artifact-create.json --json`

## `artifacts.get`

- CLI path: `artifacts get`
- HTTP: `GET /artifacts/{artifact_id}`
- Stability: `stable`
- Input mode: `none`
- Why: Resolve artifact refs before downloading or rendering content.
- Concepts: `artifacts`
- Error codes: `not_found`
- Output: Returns `{ artifact }` metadata.
- Agent notes: Safe and idempotent.
- Examples:
  - Get artifact: `oar artifacts get --artifact-id artifact_123 --json`

## `artifacts.list`

- CLI path: `artifacts list`
- HTTP: `GET /artifacts`
- Stability: `stable`
- Input mode: `none`
- Why: Discover evidence and packets attached to threads.
- Concepts: `artifacts`, `filtering`
- Error codes: `invalid_request`
- Output: Returns `{ artifacts }` metadata only.
- Agent notes: Safe and idempotent.
- Examples:
  - List work orders for a thread: `oar artifacts list --kind work_order --thread-id thread_123 --json`

## `commitments.create`

- CLI path: `commitments create`
- HTTP: `POST /commitments`
- Stability: `stable`
- Input mode: `json-body`
- Why: Track accountable work items tied to a thread.
- Concepts: `commitments`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ commitment }` with generated id.
- Agent notes: Non-idempotent unless caller controls external dedupe.
- Examples:
  - Create commitment: `oar commitments create --from-file commitment.json --json`

## `commitments.get`

- CLI path: `commitments get`
- HTTP: `GET /commitments/{commitment_id}`
- Stability: `stable`
- Input mode: `none`
- Why: Read commitment status/details before status transitions.
- Concepts: `commitments`
- Error codes: `not_found`
- Output: Returns `{ commitment }`.
- Agent notes: Safe and idempotent.
- Examples:
  - Get commitment: `oar commitments get --commitment-id commitment_123 --json`

## `commitments.list`

- CLI path: `commitments list`
- HTTP: `GET /commitments`
- Stability: `stable`
- Input mode: `none`
- Why: Monitor open/blocked work and due windows.
- Concepts: `commitments`, `filtering`
- Error codes: `invalid_request`
- Output: Returns `{ commitments }`.
- Agent notes: Safe and idempotent.
- Examples:
  - List open commitments for a thread: `oar commitments list --thread-id thread_123 --status open --json`

## `commitments.patch`

- CLI path: `commitments patch`
- HTTP: `PATCH /commitments/{commitment_id}`
- Stability: `stable`
- Input mode: `json-body`
- Why: Update ownership, due date, or status with evidence-aware transition rules.
- Concepts: `commitments`, `patch`, `provenance`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`, `conflict`, `not_found`
- Output: Returns `{ commitment }` and emits a status-change event when applicable.
- Agent notes: Provide `refs` for restricted transitions and use `if_updated_at` to avoid lost updates.
- Examples:
  - Mark commitment done: `oar commitments patch --commitment-id commitment_123 --from-file commitment-patch.json --json`

## `derived.rebuild`

- CLI path: `derived rebuild`
- HTTP: `POST /derived/rebuild`
- Stability: `beta`
- Input mode: `json-body`
- Why: Force deterministic recomputation of derived views after maintenance or migration.
- Concepts: `derived-views`, `maintenance`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ ok: true }`.
- Agent notes: Mutating admin command; serialize with other writes.
- Examples:
  - Rebuild derived: `oar derived rebuild --actor-id system --json`

## `events.create`

- CLI path: `events create`
- HTTP: `POST /events`
- Stability: `stable`
- Input mode: `json-body`
- Why: Record append-only narrative or protocol state changes that complement snapshots.
- Concepts: `events`, `append-only`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ event }` with generated id and timestamp.
- Agent notes: Non-idempotent unless external dedupe keying is used.
- Examples:
  - Append event: `oar events create --from-file event.json --json`

## `events.get`

- CLI path: `events get`
- HTTP: `GET /events/{event_id}`
- Stability: `stable`
- Input mode: `none`
- Why: Resolve event references and evidence links.
- Concepts: `events`
- Error codes: `not_found`
- Output: Returns `{ event }`.
- Agent notes: Safe and idempotent.
- Examples:
  - Get event: `oar events get --event-id event_123 --json`

## `inbox.ack`

- CLI path: `inbox ack`
- HTTP: `POST /inbox/ack`
- Stability: `stable`
- Input mode: `json-body`
- Why: Suppress already-acted-on derived inbox signals.
- Concepts: `inbox`, `events`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ event }` representing acknowledgment.
- Agent notes: Idempotent at semantic level; repeated acks should not duplicate active inbox items.
- Examples:
  - Ack inbox item: `oar inbox ack --thread-id thread_123 --inbox-item-id inbox:item-1 --json`

## `inbox.list`

- CLI path: `inbox list`
- HTTP: `GET /inbox`
- Stability: `stable`
- Input mode: `none`
- Why: Surface derived actionable risk and decision signals.
- Concepts: `inbox`, `derived-views`
- Output: Returns `{ items, generated_at }`.
- Agent notes: Safe and idempotent.
- Examples:
  - List inbox: `oar inbox list --json`

## `meta.health`

- CLI path: `meta health`
- HTTP: `GET /health`
- Stability: `stable`
- Input mode: `none`
- Why: Probe whether core storage is available before issuing stateful commands.
- Concepts: `health`, `readiness`
- Error codes: `storage_unavailable`
- Output: Returns `{ ok: true }` when the service and storage are healthy.
- Agent notes: Safe and idempotent; retry with backoff on transport failures.
- Examples:
  - Health check: `oar meta health --json`

## `meta.version`

- CLI path: `meta version`
- HTTP: `GET /version`
- Stability: `stable`
- Input mode: `none`
- Why: Verify compatibility between core and generated clients before performing writes.
- Concepts: `compatibility`, `schema`
- Output: Returns `{ schema_version }` only.
- Agent notes: Safe and idempotent.
- Examples:
  - Read version: `oar meta version --json`

## `packets.receipts.create`

- CLI path: `packets receipts create`
- HTTP: `POST /receipts`
- Stability: `stable`
- Input mode: `json-body`
- Why: Record execution output and verification evidence for a work order.
- Concepts: `packets`, `receipts`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ artifact, event }`.
- Agent notes: Include evidence refs that satisfy packet conventions.
- Examples:
  - Create receipt: `oar packets receipts create --from-file receipt.json --json`

## `packets.reviews.create`

- CLI path: `packets reviews create`
- HTTP: `POST /reviews`
- Stability: `stable`
- Input mode: `json-body`
- Why: Record acceptance/revision decisions over a receipt.
- Concepts: `packets`, `reviews`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ artifact, event }`.
- Agent notes: Include refs to both receipt and work order artifacts.
- Examples:
  - Create review: `oar packets reviews create --from-file review.json --json`

## `packets.work-orders.create`

- CLI path: `packets work-orders create`
- HTTP: `POST /work_orders`
- Stability: `stable`
- Input mode: `json-body`
- Why: Create structured action packets with deterministic schema enforcement.
- Concepts: `packets`, `work-orders`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ artifact, event }`.
- Agent notes: Treat as non-idempotent unless artifact ids are controlled.
- Examples:
  - Create work order: `oar packets work-orders create --from-file work-order.json --json`

## `snapshots.get`

- CLI path: `snapshots get`
- HTTP: `GET /snapshots/{snapshot_id}`
- Stability: `stable`
- Input mode: `none`
- Why: Resolve arbitrary snapshot references encountered in event refs.
- Concepts: `snapshots`
- Error codes: `not_found`
- Output: Returns `{ snapshot }`.
- Agent notes: Safe and idempotent.
- Examples:
  - Get snapshot: `oar snapshots get --snapshot-id snapshot_123 --json`

## `threads.create`

- CLI path: `threads create`
- HTTP: `POST /threads`
- Stability: `stable`
- Input mode: `json-body`
- Why: Open a new thread for tracking ongoing organizational work.
- Concepts: `threads`, `snapshots`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`
- Output: Returns `{ thread }` including generated id and audit fields.
- Agent notes: Non-idempotent unless caller enforces a deterministic id strategy externally.
- Examples:
  - Create thread: `oar threads create --from-file thread.json --json`

## `threads.get`

- CLI path: `threads get`
- HTTP: `GET /threads/{thread_id}`
- Stability: `stable`
- Input mode: `none`
- Why: Resolve authoritative thread state before patching or composing packets.
- Concepts: `threads`
- Error codes: `not_found`
- Output: Returns `{ thread }`.
- Agent notes: Safe and idempotent.
- Examples:
  - Read thread: `oar threads get --thread-id thread_123 --json`

## `threads.list`

- CLI path: `threads list`
- HTTP: `GET /threads`
- Stability: `stable`
- Input mode: `none`
- Why: Retrieve current thread state for triage and scheduling decisions.
- Concepts: `threads`, `filtering`
- Error codes: `invalid_request`
- Output: Returns `{ threads }`; query filters are additive.
- Agent notes: Safe and idempotent.
- Examples:
  - List active p1 threads: `oar threads list --status active --priority p1 --json`

## `threads.patch`

- CLI path: `threads patch`
- HTTP: `PATCH /threads/{thread_id}`
- Stability: `stable`
- Input mode: `json-body`
- Why: Update mutable thread fields while preserving unknown data and auditability.
- Concepts: `threads`, `patch`
- Error codes: `invalid_json`, `invalid_request`, `unknown_actor_id`, `conflict`, `not_found`
- Output: Returns `{ thread }` after patch merge and emitted event side effect.
- Agent notes: Use `if_updated_at` for optimistic concurrency.
- Examples:
  - Patch thread: `oar threads patch --thread-id thread_123 --from-file patch.json --json`

## `threads.timeline`

- CLI path: `threads timeline`
- HTTP: `GET /threads/{thread_id}/timeline`
- Stability: `stable`
- Input mode: `none`
- Why: Retrieve narrative event history plus referenced snapshots/artifacts in one call.
- Concepts: `threads`, `events`, `provenance`
- Error codes: `not_found`
- Output: Returns `{ events, snapshots, artifacts }` where snapshot/artifact maps are sparse.
- Agent notes: Events stay time ordered; missing refs are omitted from expansion maps.
- Examples:
  - Timeline: `oar threads timeline --thread-id thread_123 --json`

