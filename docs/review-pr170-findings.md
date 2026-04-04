# PR #170 clean-slate review — execution notes

Standalone summary of review execution (April 2026). The detailed checklist lives in the review plan; this file records outcomes and fixes applied in-repo.

## Fixes applied during review

1. **`web-ui/src/lib/config.js`** — `EXPECTED_SCHEMA_VERSION` updated from `0.2.3` to **`0.3.0`** to match `contracts/oar-schema.yaml` and `contracts/oar-openapi.yaml`.

2. **`web-ui/src/lib/oarCoreClient.js`** — Regenerated workspace `OarClient` only exposes a subset of HTTP commands (no auth/*/agents.* in the registry). Client methods that called **non-existent** `generated.*` helpers were switched to **`invokeDirectJSON` / `invokeDirectRaw`** against the same paths `oar-core` implements.
   - Auth, thread lifecycle, artifacts (create/archive/…), documents (patch/history paths), event fetch/archive/…, snapshots GET, and artifact content download.
   - **`getThread`** now uses **`threads.inspect`** / `generated.threadsInspect`.
   - **`getDocumentHistory`** uses **`docs.revisions.list`** / `generated.docsRevisionsList`.
   - **`getDocumentRevision`** uses **`docs.revisions.get`** / `generated.docsRevisionsGet` with correct path params.
   - **`ackInboxItem`** now posts directly to **`POST /inbox/ack`** with the core-shaped body (`actor_id`, `thread_id`, `inbox_item_id`) that `oar-core` currently serves.
   - **`listEvents`** added using **`events.list`** / `generated.eventsList`.
   - Removed unused **`invokeRaw`** / **`renderPath`** after migration.

3. **`web-ui/tests/unit/oarCoreClient.test.js`** — Mock handshake/version payloads updated to **`schema_version: "0.3.0"`**.

4. **`web-ui/AGENTS.md`** — Terminology aligned with topic/card model (removed snapshot/commitment-centric UI description).

## Verification run

- `make contract-check`
- `make -C core check`
- `make cli-check`
- `make -C web-ui check`
- `make check`
- `./scripts/e2e-smoke`

## Review findings (no code change)

- **`core/internal/server/commitments_integration_test.go`** and related tests hit **`POST /threads`**, **`POST /commitments`**, etc. only via **`maybeHandleLegacyWorkspaceRequest`** in **`primitives_integration_test.go`** — a **test-only HTTP shim**, not production routes. Production wiring matches OpenAPI (no `/commitments` in workspace contract).

- **Persistence vs. zip “clean-slate” narrative:** `core/internal/storage/migrations.go` v1 still creates **`commitments`**, **`board_cards`**, and uses **`topics.primary_thread_id`** — implementation naming/storage differs from the written CAR spec. Behavior is consistent with current handlers; renaming/removing tables would be a follow-on migration.

- **`card_resolution`** in **`contracts/oar-schema.yaml`**: **`unresolved | completed | canceled | superseded`** (not `done`).

- **Adapter bridge tests:** `make -C adapters/agent-bridge test` requires local **`.venv`** / **pytest**; run `make bridge-setup` first on a fresh machine.

## Contract / OpenAPI spot-check

- `oar-schema.yaml`: no `snapshot` / `commitment` resource strings in grep pass for those tokens.
- `oar-openapi.yaml`: **`0.3.0`**, **`/topics`**, **`/cards`** (incl. restore/purge), threads **read-only** at list/get/timeline/workspace (no POST `/threads` in contract).

---

## Subagent deep review (evidence-based, anti–reward-hacking)

Parallel investigation agents were run with a **mandate for file:line evidence** and **no “verified” without commands or reads**. Consolidated results below; several items led to **code fixes** in this pass.

### Fixes added after subagent sweep

5. **`POST /docs/{document_id}/revisions` (`docs.revisions.create`)** — Access control already allowed **GET+POST**, but the handler branch treated `/revisions` as **GET-only** and returned **405** for POST (Codex P1 on [PR #170](https://github.com/Git-on-my-level/organization-autorunner/pull/170)). **Implemented** `handleCreateDocumentRevision` in `core/internal/server/docs_handlers.go`: supports the **CLI envelope** (`if_base_revision` + `content` + `content_type`, same as `PATCH /docs/{id}`) and the **OpenAPI envelope** (`revision.body_markdown` + `refs` + `provenance`, optional `revision.summary` → document title patch, optional `if_document_updated_at` vs `document.updated_at`). **`handleUpdateDocument`** now takes **`successStatus`** so POST returns **201** per OpenAPI. Extended **`TestDocumentsLifecycleRoundTrip`** in `core/internal/server/primitives_integration_test.go` for both POST shapes and updated expected history length.

6. **`web-ui/src/lib/oarCoreClient.js` — `purgeCard`** — Subagent noted **inconsistency**: archive/restore used `withActorId`, purge did not. **Aligned** purge with `withActorId(payload)` so dev/unauthenticated human purge paths receive **`actor_id`** like other card lifecycle calls.

### P0 / P1 issues documented (remaining or informational)

| Severity | Topic | Evidence / note |
|----------|--------|------------------|
| P1 | **CLI vs contract for `oar docs update`** | CLI validates `content` / `if_base_revision` (see `cli/internal/app/resource_commands.go` `validateDocsUpdateBody`) and POSTs to **`docs.revisions.create`**. OpenAPI **`CreateDocumentRevisionRequest`** uses nested **`revision`**. Core now accepts **both** shapes on POST `/revisions`. |
| P1 | **Threads subcommands vs `threadsSubcommandSpec.valid`** | `cli/internal/app/resource_commands.go` `runThreadsCommand` implements **create/patch/lifecycle**; `cli/internal/app/subcommand_guidance.go` **`threadsSubcommandSpec.valid`** lists only **list/get/timeline/inspect/workspace**. **Help/registry** under-lists thread commands — bad for discovery and automation. |
| P1 | **`commitments` CLI** | **Not routed** in top-level dispatch; **dead or divergent** vs `runCommitmentsCommand` / normalization still present — reconcile (delete or restore routing). |
| P1 | **Inbox categories: contract vs core vs UI vs CLI** | **Resolved (convergence round):** Core now emits **`risk_review`** (was `work_item_risk`), **`stale_topic`** for `exception_raised` + **`subtype: stale_topic`**, and **`intervention_needed`** for other `exception_raised`. Sort/order maps and integration tests updated. Web UI **`inboxUtils`** uses contract **`INBOX_CATEGORY_ORDER`** and aliases legacy `exception` / `work_item_risk` / `commitment_risk` for display and URL filters. CLI concepts + **`runtime-help.md`** (via **`oar-docs-gen`**) list the five contract categories. |
| P1 | **`card_resolution` validator vs schema** | **Resolved:** `validateCardResolution` now accepts **`unresolved`**, **`completed`**, **`canceled`**, **`superseded`** (`boards_store.go`). Terminal column **`done`** still requires **`completed`** / **`canceled`** with refs via move logic. |
| P2 | **Doc / test version drift** | Runtime schema **`0.3.0`** in contracts and `web-ui/src/lib/config.js`; **`web-ui/docs/*`**, **`web-ui/README.md`** still mention **`0.2.3`** in places; **`core/internal/server/*_test.go`** and **`core/docs/*`** still use **`0.2.2`** in examples/`NewHandler` — confusing for operators. |
| P2 | **Web UI legacy surfaces** | **`getSnapshot`** routes through **`threads.inspect`** (no GET `/snapshots`); snapshot routes remain for URL compat. **`ThreadCommitmentsPanel`** is read-only; **`commitmentUtils`** still used for legacy labels where needed. |
| P2 | **`ref_edge` layout** | In `oar-schema.yaml`, **`ref_edge`** lives under **`primitives:`**, not **`resources:`** — checklist wording “resource” may not match YAML structure. |

### Confirmed aligned (with evidence class)

- **Generated TS client**: no `commitment*`, `snapshot*`, or `threadsCreate` symbols in `contracts/gen/ts/dist/client.d.ts` / `client.js` (agent `rg`).


- **`GET /cards` `tombstoned_only` / `archived_only`**: OpenAPI alias documented; `core/internal/server/cards_handlers.go` maps **`tombstoned_only`** to **`ArchivedOnly`**.

- **`2026-04-04` validation**: `make contract-check`, `make -C core check`, `make -C web-ui check` re-run after POST `/revisions` implementation — **pass**.

### Agent-bridge

- **`subject_ref`** on wake packets: `adapters/agent-bridge/oar_agent_bridge/models.py` + tests; **no** `commitment`/`snapshot` strings in Python tree per agent grep. **`preferred` fetch** still **`threads.workspace`** — intentional tooling hook, not renamed to “topic workspace.”

### How to repeat this review style

1. Spawn **scoped agents** (contracts-only, core-only, web-ui-only, CLI+adapter, cross-module enums).
2. Require **verbatim evidence** (paths, `rg` patterns, or test names) for each finding.
3. Treat **“all todos green”** as insufficient — cross-check **OpenAPI path × handler** and **CLI body × OpenAPI schema** manually for write routes.
