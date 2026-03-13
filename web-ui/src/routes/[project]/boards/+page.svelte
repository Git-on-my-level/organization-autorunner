<script>
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { coreClient } from "$lib/coreClient";
  import { formatTimestamp } from "$lib/formatDate";
  import { projectPath } from "$lib/projectPaths";
  import { lookupActorDisplayName, actorRegistry } from "$lib/actorSession";

  const BOARD_STATUS_LABELS = { active: "Active", archived: "Archived" };

  const CANONICAL_COLUMNS = [
    "backlog",
    "ready",
    "in_progress",
    "blocked",
    "review",
    "done",
  ];

  let boards = $state([]);
  let loading = $state(false);
  let error = $state("");
  let projectSlug = $derived($page.params.project);
  let actorName = $derived((id) => lookupActorDisplayName(id, $actorRegistry));

  function projectHref(pathname = "/") {
    return projectPath(projectSlug, pathname);
  }

  function navigateToBoard(boardId) {
    goto(projectHref(`/boards/${boardId}`));
  }

  $effect(() => {
    if (projectSlug) {
      void loadBoards();
    }
  });

  async function loadBoards() {
    loading = true;
    error = "";
    try {
      const data = await coreClient.listBoards({});
      boards = data.boards ?? [];
    } catch (e) {
      error = `Failed to load boards: ${e instanceof Error ? e.message : String(e)}`;
      boards = [];
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

  function getColumnCounts(board) {
    const counts = {};
    for (const col of CANONICAL_COLUMNS) {
      counts[col] = 0;
    }
    if (board.board_summary?.column_counts) {
      for (const [col, count] of Object.entries(
        board.board_summary.column_counts,
      )) {
        counts[col] = count;
      }
    }
    return counts;
  }

  function columnLabel(key) {
    const labels = {
      backlog: "Backlog",
      ready: "Ready",
      in_progress: "In Progress",
      blocked: "Blocked",
      review: "Review",
      done: "Done",
    };
    return labels[key] ?? key;
  }
</script>

<div class="mb-4">
  <h1 class="text-lg font-semibold text-[var(--ui-text)]">Boards</h1>
  <p class="mt-1 text-[12px] text-[var(--ui-text-muted)]">
    Kanban boards for this project
  </p>
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
    Loading boards...
  </div>
{:else if error}
  <div class="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
    {error}
  </div>
{:else if boards.length === 0}
  <div class="mt-8 text-center">
    <p class="text-[13px] font-medium text-[var(--ui-text-muted)]">
      No boards yet
    </p>
    <p class="mt-1 text-[13px] text-[var(--ui-text-muted)]">
      Boards will appear here once created.
    </p>
  </div>
{/if}

{#if !loading && boards.length > 0}
  <div
    class="space-y-px rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] overflow-hidden"
  >
    {#each boards as board, i}
      {@const counts = getColumnCounts(board)}
      <div
        class="block cursor-pointer px-4 py-3 transition-colors hover:bg-[var(--ui-border-subtle)] {i >
        0
          ? 'border-t border-[var(--ui-border)]'
          : ''}"
        onclick={() => navigateToBoard(board.id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === "Enter" && navigateToBoard(board.id)}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              {#if board.status}
                <span
                  class="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold {statusColor(
                    board.status,
                  )}">{BOARD_STATUS_LABELS[board.status] ?? board.status}</span
                >
              {/if}
              {#if board.primary_document_id}
                <span
                  class="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300"
                >
                  Has doc
                </span>
              {/if}
              {#each (board.labels ?? []).slice(0, 3) as label}
                <span
                  class="rounded bg-[var(--ui-border)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-muted)]"
                  >{label}</span
                >
              {/each}
            </div>
            <p
              class="mt-1 truncate text-[13px] font-medium text-[var(--ui-text)]"
            >
              {board.title || board.id}
            </p>
            <div
              class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ui-text-muted)]"
            >
              {#if board.owners?.length > 0}
                <span>
                  Owned by {board.owners.map((o) => actorName(o)).join(", ")}
                </span>
              {/if}
              {#if board.primary_thread_id}
                <span>
                  Primary: <a
                    class="text-indigo-300 transition-colors hover:text-indigo-200"
                    href={projectHref(
                      `/threads/${encodeURIComponent(board.primary_thread_id)}`,
                    )}
                  >
                    {board.primary_thread_id}
                  </a>
                </span>
              {/if}
              <span>
                Updated {formatTimestamp(board.updated_at) || "—"} by {actorName(
                  board.updated_by,
                )}
              </span>
            </div>
          </div>
          <div class="shrink-0 text-[11px] text-[var(--ui-text-subtle)]">
            <div class="flex gap-1">
              {#each CANONICAL_COLUMNS as col}
                <span
                  class="rounded bg-[var(--ui-border)] px-1.5 py-0.5"
                  title="{columnLabel(col)}: {counts[col]}"
                >
                  {counts[col]}
                </span>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
