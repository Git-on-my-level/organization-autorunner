<script>
  import { onMount } from "svelte";

  import { coreClient } from "$lib/coreClient";
  import { formatTimestamp } from "$lib/formatDate";

  let artifacts = $state([]);
  let loading = $state(false);
  let error = $state("");
  let filtersOpen = $state(false);
  let filters = $state({
    kind: "",
    thread_id: "",
    created_after: "",
    created_before: "",
  });

  onMount(async () => {
    await loadArtifacts();
  });

  function toIsoOrEmpty(value) {
    if (!value) return "";
    const parsed = Date.parse(String(value));
    if (Number.isNaN(parsed)) return "";
    return new Date(parsed).toISOString();
  }

  function buildArtifactQuery() {
    return {
      kind: filters.kind.trim(),
      thread_id: filters.thread_id.trim(),
      created_after: toIsoOrEmpty(filters.created_after),
      created_before: toIsoOrEmpty(filters.created_before),
    };
  }

  async function loadArtifacts() {
    loading = true;
    error = "";
    try {
      artifacts =
        (await coreClient.listArtifacts(buildArtifactQuery())).artifacts ?? [];
    } catch (e) {
      error = `Failed to load artifacts: ${e instanceof Error ? e.message : String(e)}`;
      artifacts = [];
    } finally {
      loading = false;
    }
  }

  async function applyFilters() {
    await loadArtifacts();
  }
  async function clearFilters() {
    filters = {
      kind: "",
      thread_id: "",
      created_after: "",
      created_before: "",
    };
    await loadArtifacts();
  }

  function kindBadge(kind) {
    const styles = {
      work_order: "bg-blue-50 text-blue-700",
      receipt: "bg-emerald-50 text-emerald-700",
      review: "bg-purple-50 text-purple-700",
      doc: "bg-amber-50 text-amber-700",
    };
    return styles[kind] ?? "bg-gray-100 text-gray-600";
  }
</script>

<div class="flex items-center justify-between">
  <h1 class="text-lg font-semibold text-gray-900">Artifacts</h1>
  <button
    class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
    onclick={() => (filtersOpen = !filtersOpen)}
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
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
    {filtersOpen ? "Hide filters" : "Filter"}
  </button>
</div>

{#if filtersOpen}
  <form
    class="mt-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm"
    onsubmit={(event) => {
      event.preventDefault();
      applyFilters();
    }}
  >
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="text-xs font-medium text-gray-500"
        >Kind <input
          bind:value={filters.kind}
          class="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm transition-colors focus:bg-white"
          placeholder="work_order, receipt, review, doc..."
        /></label
      >
      <label class="text-xs font-medium text-gray-500"
        >Thread ID <input
          bind:value={filters.thread_id}
          class="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm transition-colors focus:bg-white"
          placeholder="thread-onboarding"
        /></label
      >
      <label class="text-xs font-medium text-gray-500"
        >Created after <input
          bind:value={filters.created_after}
          class="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm transition-colors focus:bg-white"
          type="datetime-local"
        /></label
      >
      <label class="text-xs font-medium text-gray-500"
        >Created before <input
          bind:value={filters.created_before}
          class="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm transition-colors focus:bg-white"
          type="datetime-local"
        /></label
      >
    </div>
    <div class="mt-3 flex gap-2">
      <button
        class="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-gray-800"
        type="submit">Apply</button
      >
      <button
        class="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
        onclick={clearFilters}
        type="button">Clear</button
      >
    </div>
  </form>
{/if}

{#if error}
  <div
    class="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
  >
    <svg
      class="mt-0.5 h-4 w-4 shrink-0 text-red-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
    {error}
  </div>
{:else if !loading && artifacts.length === 0}
  <div class="mt-8 text-center">
    <svg
      class="mx-auto h-8 w-8 text-gray-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
    <p class="mt-2 text-sm text-gray-400">
      No artifacts match the current filters.
    </p>
  </div>
{/if}

{#if artifacts.length > 0}
  <div class="mt-4 space-y-1">
    {#each artifacts as artifact}
      <a
        class="flex items-center gap-3 rounded-lg border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-gray-300/80 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
        href={`/artifacts/${artifact.id}`}
      >
        <span
          class={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${kindBadge(artifact.kind)}`}
          >{artifact.kind}</span
        >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-gray-900">
            {artifact.summary || artifact.id}
          </p>
          <div class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
            <span>{artifact.created_by || "unknown"}</span>
            <span class="text-gray-300">·</span>
            <span>{formatTimestamp(artifact.created_at) || "—"}</span>
            {#if artifact.thread_id}
              <span class="text-gray-300">·</span>
              <span class="truncate">{artifact.thread_id}</span>
            {/if}
          </div>
        </div>
        {#if (artifact.refs ?? []).length > 0}
          <span
            class="shrink-0 rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-400"
            >{artifact.refs.length} ref{artifact.refs.length === 1
              ? ""
              : "s"}</span
          >
        {/if}
      </a>
    {/each}
  </div>
{/if}
