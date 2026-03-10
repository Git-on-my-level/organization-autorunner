<script>
  import { page } from "$app/stores";
  import MarkdownRenderer from "$lib/components/MarkdownRenderer.svelte";
  import { coreClient } from "$lib/coreClient";
  import { formatTimestamp } from "$lib/formatDate";
  import { projectPath } from "$lib/projectPaths";
  import { lookupActorDisplayName, actorRegistry } from "$lib/actorSession";

  let documentId = $derived($page.params.documentId);
  let projectSlug = $derived($page.params.project);
  let actorName = $derived((id) => lookupActorDisplayName(id, $actorRegistry));

  let document = $state(null);
  let headRevision = $state(null);
  let revisions = $state([]);
  let selectedRevision = $state(null);
  let loading = $state(false);
  let historyLoading = $state(false);
  let loadError = $state("");
  let loadedDocumentId = $state("");
  let historyOpen = $state(false);

  let displayedContent = $derived(
    selectedRevision?.content ?? headRevision?.content ?? "",
  );
  let displayedRevision = $derived(selectedRevision ?? headRevision);
  let isViewingOldRevision = $derived(
    selectedRevision &&
      selectedRevision.revision_id !== headRevision?.revision_id,
  );

  function projectHref(pathname = "/") {
    return projectPath(projectSlug, pathname);
  }

  $effect(() => {
    const id = documentId;
    if (id && id !== loadedDocumentId) loadDocument(id);
  });

  async function loadDocument(targetId) {
    if (!targetId) return;
    loading = true;
    loadError = "";
    loadedDocumentId = targetId;
    revisions = [];
    selectedRevision = null;
    historyLoading = false;
    historyOpen = false;
    try {
      const result = await coreClient.getDocument(targetId);
      document = result.document ?? null;
      headRevision = result.revision ?? null;
      if (!document) {
        loadError = "Document not found.";
      }
    } catch (e) {
      loadError = `Failed to load document: ${e instanceof Error ? e.message : String(e)}`;
      document = null;
      headRevision = null;
    } finally {
      loading = false;
    }
  }

  async function loadHistory() {
    if (!documentId || revisions.length > 0) {
      historyOpen = !historyOpen;
      return;
    }
    historyOpen = true;
    historyLoading = true;
    try {
      const result = await coreClient.getDocumentHistory(documentId);
      revisions = (result.revisions ?? []).slice().reverse();
    } catch {
      revisions = [];
    } finally {
      historyLoading = false;
    }
  }

  async function selectRevision(rev) {
    if (rev.revision_id === headRevision?.revision_id) {
      selectedRevision = null;
      return;
    }
    if (rev.content) {
      selectedRevision = rev;
      return;
    }
    try {
      const result = await coreClient.getDocumentRevision(
        documentId,
        rev.revision_id,
      );
      const loaded = result.revision ?? rev;
      selectedRevision = loaded;
      const idx = revisions.findIndex((r) => r.revision_id === rev.revision_id);
      if (idx >= 0) revisions[idx] = { ...revisions[idx], ...loaded };
    } catch {
      selectedRevision = rev;
    }
  }

  function returnToHead() {
    selectedRevision = null;
  }
</script>

<nav
  class="mb-3 flex items-center gap-1.5 text-[12px] text-[var(--ui-text-muted)]"
  aria-label="Breadcrumb"
>
  <a
    class="transition-colors hover:text-[var(--ui-text)]"
    href={projectHref("/docs")}>Docs</a
  >
  <span class="text-[var(--ui-text-subtle)]">/</span>
  <span class="truncate text-[var(--ui-text-muted)]"
    >{document?.title || documentId}</span
  >
</nav>

{#if loading}
  <div
    class="mt-8 flex items-center justify-center gap-2 text-[13px] text-[var(--ui-text-muted)]"
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
    Loading...
  </div>
{:else if loadError}
  <div class="rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
    {loadError}
  </div>
{:else if document}
  {#if document.tombstoned_at}
    <div class="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-4">
      <div class="flex items-center gap-2 text-sm font-semibold text-red-400">
        <span>⚠</span>
        <span>This document has been tombstoned</span>
      </div>
      {#if document.tombstone_reason}
        <p class="mt-2 text-[13px] text-red-300">
          Reason: {document.tombstone_reason}
        </p>
      {/if}
      <p class="mt-1 text-xs text-[var(--ui-text-muted)]">
        Tombstoned {#if document.tombstoned_by}by {actorName(
            document.tombstoned_by,
          )}{/if}
        {#if document.tombstoned_at}
          at {new Date(document.tombstoned_at).toLocaleString()}
        {/if}
      </p>
    </div>
  {/if}

  <div class="flex gap-4">
    <div class="min-w-0 flex-1">
      <section
        class="rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h1 class="text-lg font-semibold text-[var(--ui-text)]">
              {document.title || document.id}
            </h1>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              {#if document.status}
                <span
                  class="rounded px-1.5 py-0.5 font-medium text-emerald-400 bg-emerald-500/10"
                  >{document.status}</span
                >
              {/if}
              {#each document.labels ?? [] as label}
                <span
                  class="rounded bg-[var(--ui-border)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-muted)]"
                  >{label}</span
                >
              {/each}
              <span class="text-[var(--ui-text-muted)]"
                >v{displayedRevision?.revision_number ?? "?"}</span
              >
              <span class="text-[var(--ui-text-muted)]"
                >{formatTimestamp(displayedRevision?.created_at) || "—"}</span
              >
              <span class="text-[var(--ui-text-muted)]"
                >by {actorName(displayedRevision?.created_by)}</span
              >
            </div>
          </div>
          <button
            class="cursor-pointer shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-border-subtle)]"
            onclick={loadHistory}
            type="button"
          >
            <svg
              class="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Version history
          </button>
        </div>
      </section>

      {#if isViewingOldRevision}
        <div
          class="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-400"
        >
          <span
            >Viewing revision {selectedRevision.revision_number} from {formatTimestamp(
              selectedRevision.created_at,
            )}</span
          >
          <button
            class="cursor-pointer ml-auto font-medium underline"
            onclick={returnToHead}
            type="button">Return to current</button
          >
        </div>
      {/if}

      <div
        class="mt-3 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)]"
      >
        <div class="px-4 py-3">
          {#if displayedContent}
            <MarkdownRenderer
              source={displayedContent}
              class="text-[13px] leading-relaxed text-[var(--ui-text)]"
            />
          {:else}
            <p class="text-[13px] text-[var(--ui-text-muted)]">(No content)</p>
          {/if}
        </div>
      </div>

      {#if displayedRevision?.content_hash || displayedRevision?.revision_hash}
        <details
          class="mt-3 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)]"
        >
          <summary
            class="cursor-pointer px-4 py-2.5 text-[11px] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            >Integrity hashes</summary
          >
          <div class="px-4 pb-3 pt-1 space-y-2">
            {#if displayedRevision.content_hash}
              <div>
                <p
                  class="text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]"
                >
                  Content hash
                </p>
                <p
                  class="mt-1 break-all font-mono text-[12px] text-[var(--ui-text-muted)]"
                >
                  {displayedRevision.content_hash}
                </p>
              </div>
            {/if}
            {#if displayedRevision.revision_hash}
              <div>
                <p
                  class="text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]"
                >
                  Revision hash
                </p>
                <p
                  class="mt-1 break-all font-mono text-[12px] text-[var(--ui-text-muted)]"
                >
                  {displayedRevision.revision_hash}
                </p>
              </div>
            {/if}
          </div>
        </details>
      {/if}

      <details
        class="mt-3 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)]"
      >
        <summary
          class="cursor-pointer px-4 py-2.5 text-[11px] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
          >Raw metadata JSON</summary
        >
        <pre
          class="overflow-auto px-4 pb-3 text-[11px] text-[var(--ui-text-muted)]">{JSON.stringify(
            document,
            null,
            2,
          )}</pre>
      </details>
    </div>

    {#if historyOpen}
      <aside class="w-72 shrink-0">
        <div
          class="sticky top-4 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)]"
        >
          <div
            class="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-2.5"
          >
            <h2 class="text-[13px] font-medium text-[var(--ui-text)]">
              Version history
            </h2>
            <button
              class="cursor-pointer text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              onclick={() => (historyOpen = false)}
              type="button"
              aria-label="Close history"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {#if historyLoading}
            <div
              class="flex items-center gap-2 px-4 py-4 text-[12px] text-[var(--ui-text-muted)]"
            >
              <svg
                class="h-3.5 w-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
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
              Loading history...
            </div>
          {:else if revisions.length === 0}
            <p class="px-4 py-4 text-[12px] text-[var(--ui-text-muted)]">
              No revisions found.
            </p>
          {:else}
            <div class="max-h-[calc(100vh-12rem)] overflow-y-auto">
              {#each revisions as rev, i}
                {@const isHead = rev.revision_id === headRevision?.revision_id}
                {@const isSelected =
                  displayedRevision?.revision_id === rev.revision_id}
                <button
                  class="w-full text-left px-4 py-3 transition-colors hover:bg-[var(--ui-border-subtle)] {i >
                  0
                    ? 'border-t border-[var(--ui-border)]'
                    : ''} {isSelected ? 'bg-[var(--ui-border-subtle)]' : ''}"
                  onclick={() => selectRevision(rev)}
                  type="button"
                >
                  <div class="flex items-center gap-2">
                    <div class="relative flex flex-col items-center">
                      <div
                        class="h-2.5 w-2.5 rounded-full {isHead
                          ? 'bg-emerald-400'
                          : isSelected
                            ? 'bg-indigo-400'
                            : 'bg-[var(--ui-text-subtle)]'}"
                      ></div>
                      {#if i < revisions.length - 1}
                        <div
                          class="absolute top-3 h-full w-px bg-[var(--ui-border)]"
                        ></div>
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-[12px] font-medium text-[var(--ui-text)]">
                        {#if isHead}Current version{:else}Version {rev.revision_number}{/if}
                      </p>
                      <p class="text-[11px] text-[var(--ui-text-muted)]">
                        {formatTimestamp(rev.created_at)} · {actorName(
                          rev.created_by,
                        )}
                      </p>
                      {#if rev.revision_hash}
                        <p
                          class="mt-0.5 font-mono text-[10px] text-[var(--ui-text-subtle)]"
                        >
                          {rev.revision_hash.slice(0, 12)}...
                        </p>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    {/if}
  </div>
{:else}
  <div class="mt-8 text-center text-[13px] text-[var(--ui-text-muted)]">
    Document not found.
  </div>
{/if}
