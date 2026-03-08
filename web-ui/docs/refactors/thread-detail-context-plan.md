# Thread Detail Dataflow Refactor Plan

## Scope
This plan scopes a frontend-only refactor for `web-ui/src/routes/threads/[threadId]/+page.svelte` to:

- remove N+1 commitment fetches,
- remove stale state drift after mutations,
- make thread detail maintainable by splitting dataflow from presentation.

This plan intentionally does **not** ship broad runtime/API changes.

## Audit Summary
Primary hot spots in `web-ui/src/routes/threads/[threadId]/+page.svelte`:

- `loadOpenCommitments(...)` fetches each open commitment with `GET /commitments/{id}` (N+1 fan-out).
- `loadThreadDetail(...)` orchestrates 4 separate reads plus N commitment reads in one component.
- Mutation handlers refresh different subsets of state, so snapshot/header, timeline, and form data drift.
- The page is monolithic (~1500 lines in current tree) with data orchestration, form state, mutation logic, and rendering tightly coupled.

## Current-State Request Diagram

### Initial page load (today)

```mermaid
flowchart TD
  A[onMount -> loadThreadDetail(threadId)] --> B[GET /threads/{thread_id}]
  B --> C[open_commitments[] IDs]
  C --> D{{for each id}}
  D --> E[GET /commitments/{commitment_id}]
  A --> F[GET /threads/{thread_id}/timeline]
  A --> G[GET /artifacts?kind=work_order&thread_id={thread_id}]
  A --> H[GET /actors (if actorRegistry empty)]
```

Request count for open commitments = `N + 4` (plus optional actors).

### Mutation refresh behavior (today)

- `saveEdit` (`PATCH /threads/{id}`): updates `snapshot` only; timeline/work-order data not refreshed.
- `createCommitment` (`POST /commitments`): refreshes snapshot + commitments; timeline not refreshed.
- `saveCommitmentEdit` (`PATCH /commitments/{id}`): refreshes snapshot + commitments; timeline not refreshed.
- `postMessage` (`POST /events`): refreshes timeline only.
- `submitWorkOrder` (`POST /work_orders`): refreshes timeline + work orders; snapshot/header not refreshed.
- `submitReceipt` (`POST /receipts`): refreshes timeline + work orders; snapshot/header not refreshed.

## API Surface Decision

### Findings from current contracts/runtime

- `GET /threads/{thread_id}/context` is **not present** in current `contracts/oar-openapi.yaml`, generated TS client, or `core/internal/server` routes.
- Available primitives already cover thread detail needs:
  - `GET /threads/{thread_id}`
  - `GET /threads/{thread_id}/timeline`
  - `GET /commitments?thread_id={id}&status=open`
  - `GET /artifacts?kind=work_order&thread_id={id}`

## Chosen path

Use existing endpoints; do not add backend surface in this refactor.

- Replace per-id commitment fan-out with `listCommitments({ thread_id, status: "open" })`.
- Keep timeline on `GET /threads/{thread_id}/timeline`.
- Keep work orders on `GET /artifacts` filter.
- Keep stale-state computation client-side from thread snapshot data (below).

Rationale: this removes the highest-cost redundancy now without cross-component contract churn.

## Source Of Truth For Thread Stale State

Use thread snapshot `next_check_in_at` as canonical stale input and reuse shared `computeStaleness(thread)` from `src/lib/threadFilters.js`.

- Thread list and thread detail must use the same utility.
- Thread detail must not call `listThreads({})` to infer stale state for one thread.
- If core later adds an explicit `thread.stale` field, update `computeStaleness(...)` to prefer server value and fall back to date-based derivation.

## Mutation Refresh Policy (Target)

Centralize refresh in one dataflow module with explicit refresh scopes.

| Mutation | Write call | Required post-write refresh |
|---|---|---|
| Edit thread | `PATCH /threads/{id}` | `snapshot + timeline` |
| Create commitment | `POST /commitments` | `snapshot + openCommitments + timeline` |
| Edit commitment | `PATCH /commitments/{id}` | `snapshot + openCommitments + timeline` |
| Post message | `POST /events` | `snapshot + timeline` |
| Create work order | `POST /work_orders` | `snapshot + timeline + workOrders` |
| Submit receipt | `POST /receipts` | `snapshot + timeline + workOrders` |

Concurrency/consistency rules:

- Use one `refreshThreadDetail({ snapshot, timeline, commitments, workOrders })` entrypoint.
- On `409` from thread/commitment patch, force `snapshot + openCommitments + timeline` refresh before showing retry guidance.
- Ignore stale responses by sequence token (latest-request-wins) inside the dataflow module.

## Target Component/Store Breakdown

### 1) Dataflow/store module

Create `web-ui/src/lib/threadDetailStore.js` to own:

- read orchestration (`loadInitial`, `refreshThreadDetail`),
- mutation actions (`saveEdit`, `createCommitment`, `saveCommitmentEdit`, `postMessage`, `submitWorkOrder`, `submitReceipt`),
- derived state (`openCommitments`, `staleness`, loading/error flags),
- refresh policy matrix.

This store receives dependencies (`coreClient`, `threadId`, actor registry accessors) so behavior is unit-testable.

### 2) UI seams

Break presentation into child components under `web-ui/src/lib/components/thread-detail/`:

- `ThreadDetailHeader.svelte` (title/status/priority/stale/updated metadata)
- `ThreadOverviewTab.svelte` (snapshot view + snapshot edit form)
- `ThreadCommitmentsPanel.svelte` (open commitments list + create/edit forms)
- `ThreadWorkTab.svelte` (work-order + receipt forms and created artifact notices)
- `ThreadTimelineTab.svelte` (composer + timeline list)

`web-ui/src/routes/threads/[threadId]/+page.svelte` becomes a thin composition layer:

- instantiate store,
- bind tab state + route prefill wiring,
- pass callbacks/props to child components.

## Exact Files To Touch (Implementation Ticket)

Must touch:

- `web-ui/src/routes/threads/[threadId]/+page.svelte`
- `web-ui/src/lib/threadDetailStore.js` (new)
- `web-ui/src/lib/components/thread-detail/ThreadDetailHeader.svelte` (new)
- `web-ui/src/lib/components/thread-detail/ThreadOverviewTab.svelte` (new)
- `web-ui/src/lib/components/thread-detail/ThreadCommitmentsPanel.svelte` (new)
- `web-ui/src/lib/components/thread-detail/ThreadWorkTab.svelte` (new)
- `web-ui/src/lib/components/thread-detail/ThreadTimelineTab.svelte` (new)
- `web-ui/tests/unit/threadDetailStore.test.js` (new)
- `web-ui/tests/e2e/thread-detail.spec.js`
- `web-ui/tests/e2e/commitments.spec.js`
- `web-ui/tests/e2e/work-orders.spec.js`
- `web-ui/tests/e2e/receipts.spec.js`

Likely touch:

- `web-ui/src/lib/threadFilters.js` (only if stale derivation hook needs explicit export tweaks)

No contract/core changes in this ticket.

## Tests To Add/Update

Add:

- `web-ui/tests/unit/threadDetailStore.test.js`
  - asserts initial load uses `listCommitments({ thread_id, status: "open" })` once (no per-id `getCommitment` fan-out),
  - asserts each mutation triggers the expected refresh scope,
  - asserts 409 handlers force reconciliation refresh.

Update E2E:

- `web-ui/tests/e2e/thread-detail.spec.js`
  - adjust network stubs to cover `GET /commitments?thread_id=...&status=open`,
  - verify timeline + header state stay coherent after post/edit flows.
- `web-ui/tests/e2e/commitments.spec.js`
  - remove assumptions that load-time commitment reads hit `/commitments/{id}` for each open commitment,
  - verify done/canceled transitions refresh timeline and remove from open list.
- `web-ui/tests/e2e/work-orders.spec.js`
- `web-ui/tests/e2e/receipts.spec.js`
  - verify snapshot/header metadata refreshes after create flows (not only timeline/work-order list).

## Alternatives Considered And Rejected

1. Add new `GET /threads/{thread_id}/context` now (bundle thread + timeline + open commitments + work orders).
Rejected for this ticket: contract + generated client + mock/core handlers + multi-surface tests would expand scope beyond the targeted UI refactor.

2. Extend `GET /threads/{thread_id}` to return embedded open-commitment/work-order context.
Rejected: changes a stable snapshot envelope and introduces coupling between thread snapshot and derived collections.

3. Keep current page and patch each mutation ad hoc.
Rejected: stale-state regressions likely recur; maintainability issue remains due to monolithic ownership.

## Out Of Scope

- Introducing a new backend endpoint/contract in this ticket.
- Redesigning thread-detail UX beyond seam extraction and correctness fixes.
- Broad refactors outside thread-detail dataflow.
