<script>
  import { page } from "$app/stores";
  import { coreClient } from "$lib/coreClient";
  import { formatTimestamp } from "$lib/formatDate";
  import { projectPath } from "$lib/projectPaths";
  import { lookupActorDisplayName, actorRegistry } from "$lib/actorSession";

  const CANONICAL_COLUMNS = [
    { key: "backlog", title: "Backlog" },
    { key: "ready", title: "Ready" },
    { key: "in_progress", title: "In Progress" },
    { key: "blocked", title: "Blocked" },
    { key: "review", title: "Review" },
    { key: "done", title: "Done" },
  ];

  const BOARD_STATUS_LABELS = { active: "Active", archived: "Archived" };

  let workspace = $state(null);
  let loading = $state(false);
  let error = $state("");
  let projectSlug = $derived($page.params.project);
  let boardId = $derived($page.params.boardId);
  let actorName = $derived((id) => lookupActorDisplayName(id, $actorRegistry));

  function projectHref(pathname = "/") {
    return projectPath(projectSlug, pathname);
  }

  $effect(() => {
    if (projectSlug && boardId) {
      void loadWorkspace();
    }
  });

  async function loadWorkspace() {
    loading = true;
    error = "";
    try {
      workspace = await coreClient.getBoardWorkspace(boardId);
    } catch (e) {
      error = `Failed to load board: ${e instanceof Error ? e.message : String(e)}`;
      workspace = null;
    } finally {
      loading = false;
    }
  }

  function statusColor(status) {
    if (status === "active") return "text-emerald-400 bg-emerald-500/10";
    if (status === "archived")
      return "text-[var(--ui-text-muted)] bg-[var(--ui-border)]";
    return "text-[var(--ui-text-muted)] bg-[var(--ui-border)]";
  }

  function getThreadStatus(thread) {
    if (!thread) return "unknown";
    if (thread.status === "done") return "done";
    if (thread.status === "canceled") return "canceled";
    if (thread.status === "paused") return "paused";
    if (thread.staleness === "stale") return "stale";
    if (thread.staleness === "very-stale") return "very-stale";
    return "active";
  }

  function threadStatusColor(status) {
    switch (status) {
      case "done":
        return "text-emerald-400";
      case "canceled":
        return "text-[var(--ui-text-muted)]";
      case "paused":
        return "text-amber-400";
      case "stale":
        return "text-orange-400";
      case "very-stale":
        return "text-red-400";
      default:
        return "text-[var(--ui-text)]";
    }
  }
</script>

<div class="mb-4">
  <div class="flex items-center gap-2">
    <a
      class="text-[12px] text-[var(--ui-text-muted)] transition-colors hover:text-[var(--ui-text)]"
      href={projectHref("/boards")}
    >
      Boards
    </a>
    <span class="text-[12px] text-[var(--ui-text-subtle)]">/</span>
    <span class="text-[12px] text-[var(--ui-text-muted)]">
      {workspace?.board?.title || boardId}
    </span>
  </div>
</div>

{#if loading}
  <div
    class="mt-12 flex items-center justify-center gap-2 text-[13px] text-[var(--ui-text-muted)]"
  >
    <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      ></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    Loading board...
  </div>
{:else if error}
  <div class="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
    {error}
  </div>
{:else if workspace}
  {@const board = workspace.board}
  {@const primaryThread = workspace.primary_thread}
  {@const cardsByColumn = workspace.cards}

  <div class="mb-6">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          {#if board.status}
            <span
              class="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold {statusColor(
                board.status,
              )}">{BOARD_STATUS_LABELS[board.status] ?? board.status}</span
            >
          {/if}
          {#if board.labels?.length > 0}
            {#each board.labels as label}
              <span
                class="rounded bg-[var(--ui-border)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-muted)]"
                >{label}</span
              >
            {/each}
          {/if}
        </div>
        <h1 class="text-xl font-semibold text-[var(--ui-text)]">
          {board.title || board.id}
        </h1>
        <p class="mt-1 text-[12px] text-[var(--ui-text-muted)]">
          Updated {formatTimestamp(board.updated_at) || "—"} by {actorName(
            board.updated_by,
          )}
        </p>
      </div>

      {#if board.owners?.length > 0}
        <div class="shrink-0 text-[12px] text-[var(--ui-text-muted)]">
          <span class="block">Owned by</span>
          <span class="text-[var(--ui-text)]">
            {board.owners.map((o) => actorName(o)).join(", ")}
          </span>
        </div>
      {/if}
    </div>

    {#if primaryThread || board.primary_document_id}
      <div class="mt-4 flex flex-wrap gap-4 text-[12px]">
        {#if primaryThread}
          <div
            class="rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2"
          >
            <span class="text-[var(--ui-text-muted)]">Primary thread:</span>
            <a
              class="ml-1 text-indigo-300 transition-colors hover:text-indigo-200"
              href={projectHref(
                `/threads/${encodeURIComponent(primaryThread.id)}`,
              )}
            >
              {primaryThread.id}
            </a>
            {#if primaryThread.title}
              <span class="ml-1 text-[var(--ui-text-subtle)]"
                >- {primaryThread.title}</span
              >
            {/if}
          </div>
        {/if}
        {#if board.primary_document_id}
          <div
            class="rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2"
          >
            <span class="text-[var(--ui-text-muted)]">Primary doc:</span>
            <a
              class="ml-1 text-indigo-300 transition-colors hover:text-indigo-200"
              href={projectHref(
                `/docs/${encodeURIComponent(board.primary_document_id)}`,
              )}
            >
              {board.primary_document_id}
            </a>
          </div>
        {/if}
      </div>
    {/if}

    {#if board.pinned_refs?.length > 0}
      <div class="mt-4">
        <h3
          class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]"
        >
          Pinned refs
        </h3>
        <div class="flex flex-wrap gap-2">
          {#each board.pinned_refs as ref}
            {@const refType = ref.split(":")[0]}
            {@const refId = ref.split(":")[1]}
            <a
              class="rounded bg-[var(--ui-border)] px-2 py-1 text-[12px] text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-border-subtle)]"
              href={projectHref(`/${refType}s/${encodeURIComponent(refId)}`)}
            >
              {ref}
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="space-y-6">
    {#each CANONICAL_COLUMNS as column}
      {@const cards = cardsByColumn?.[column.key] ?? []}
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold text-[var(--ui-text)]">
            {column.title}
          </h2>
          <span
            class="rounded bg-[var(--ui-border)] px-2 py-0.5 text-[11px] text-[var(--ui-text-muted)]"
          >
            {cards.length}
          </span>
        </div>

        {#if cards.length === 0}
          <div
            class="rounded-md border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-6 text-center text-[12px] text-[var(--ui-text-muted)]"
          >
            No cards in {column.title.toLowerCase()}
          </div>
        {:else}
          <div
            class="space-y-px rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] overflow-hidden"
          >
            {#each cards as card, i}
              {@const thread = card.thread}
              {@const threadStatus = getThreadStatus(thread)}
              <a
                class="block px-4 py-3 transition-colors hover:bg-[var(--ui-border-subtle)] {i >
                0
                  ? 'border-t border-[var(--ui-border)]'
                  : ''}"
                href={projectHref(
                  `/threads/${encodeURIComponent(card.thread_id)}`,
                )}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p
                      class="truncate text-[13px] font-medium {threadStatusColor(
                        threadStatus,
                      )}"
                    >
                      {thread?.title || card.thread_id}
                    </p>
                    <p class="mt-0.5 text-[11px] text-[var(--ui-text-muted)]">
                      {thread?.status ?? "unknown"} · {thread?.priority ?? "—"} ·
                      Added {formatTimestamp(card.created_at)}
                    </p>
                  </div>
                  {#if card.pinned_document_id}
                    <span
                      class="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300"
                    >
                      doc
                    </span>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
