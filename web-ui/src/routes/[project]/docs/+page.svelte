<script>
  import { page } from "$app/stores";
  import { coreClient } from "$lib/coreClient";
  import { formatTimestamp } from "$lib/formatDate";
  import { projectPath } from "$lib/projectPaths";

  let documents = $state([]);
  let loading = $state(false);
  let error = $state("");
  let projectSlug = $derived($page.params.project);

  function projectHref(pathname = "/") {
    return projectPath(projectSlug, pathname);
  }

  $effect(() => {
    if (projectSlug) {
      void loadDocuments();
    }
  });

  async function loadDocuments() {
    loading = true;
    error = "";
    try {
      const data = await coreClient.listDocuments({});
      documents = data.documents ?? [];
    } catch (e) {
      error = `Failed to load documents: ${e instanceof Error ? e.message : String(e)}`;
      documents = [];
    } finally {
      loading = false;
    }
  }

  function statusColor(status) {
    if (status === "active") return "text-emerald-400 bg-emerald-500/10";
    if (status === "draft") return "text-amber-400 bg-amber-500/10";
    return "text-[var(--ui-text-muted)] bg-[var(--ui-border)]";
  }
</script>

<div class="flex items-center justify-between mb-4">
  <h1 class="text-lg font-semibold text-[var(--ui-text)]">Documents</h1>
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
    Loading documents...
  </div>
{:else if error}
  <div class="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
    {error}
  </div>
{:else if documents.length === 0}
  <div class="mt-8 text-center">
    <p class="text-[13px] font-medium text-[var(--ui-text-muted)]">
      No documents yet
    </p>
    <p class="mt-1 text-[13px] text-[var(--ui-text-muted)]">
      Documents will appear here once created.
    </p>
  </div>
{/if}

{#if !loading && documents.length > 0}
  <div
    class="space-y-px rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] overflow-hidden"
  >
    {#each documents as doc, i}
      <a
        class="block px-4 py-3 transition-colors hover:bg-[var(--ui-border-subtle)] {i >
        0
          ? 'border-t border-[var(--ui-border)]'
          : ''}"
        href={projectHref(`/docs/${doc.id}`)}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              {#if doc.status}
                <span
                  class="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold {statusColor(
                    doc.status,
                  )}">{doc.status}</span
                >
              {/if}
              {#each (doc.labels ?? []).slice(0, 3) as label}
                <span
                  class="rounded bg-[var(--ui-border)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-muted)]"
                  >{label}</span
                >
              {/each}
            </div>
            <p
              class="mt-1 truncate text-[13px] font-medium text-[var(--ui-text)]"
            >
              {doc.title || doc.id}
            </p>
            <p class="text-[11px] text-[var(--ui-text-muted)]">
              Updated {formatTimestamp(doc.updated_at) || "—"} by {doc.updated_by ||
                "unknown"} · v{doc.head_revision_number}
            </p>
          </div>
          <span class="shrink-0 text-[11px] text-[var(--ui-text-subtle)]">
            {doc.head_revision_number} revision{doc.head_revision_number === 1
              ? ""
              : "s"}
          </span>
        </div>
      </a>
    {/each}
  </div>
{/if}
