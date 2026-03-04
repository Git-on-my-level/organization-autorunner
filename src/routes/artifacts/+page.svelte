<script>
  import { onMount } from "svelte";

  import { coreClient } from "$lib/coreClient";
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  let artifacts = [];
  let loading = false;
  let error = "";
  let filters = {
    kind: "",
    thread_id: "",
    created_after: "",
    created_before: "",
  };

  onMount(async () => {
    await loadArtifacts();
  });

  function toIsoOrEmpty(value) {
    if (!value) {
      return "";
    }

    const parsed = Date.parse(String(value));
    if (Number.isNaN(parsed)) {
      return "";
    }

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
      const response = await coreClient.listArtifacts(buildArtifactQuery());
      artifacts = response.artifacts ?? [];
    } catch (loadIssue) {
      const reason =
        loadIssue instanceof Error ? loadIssue.message : String(loadIssue);
      error = `Failed to load artifacts: ${reason}`;
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
</script>

<h1 class="text-2xl font-semibold">Artifacts</h1>
<p class="mt-2 max-w-2xl text-slate-700">
  Browse artifact metadata and open details for packet and text content.
</p>

<form
  class="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
  on:submit|preventDefault={applyFilters}
>
  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-600">
    Filters
  </h2>
  <div class="mt-3 grid gap-3 md:grid-cols-2">
    <label class="text-xs font-semibold uppercase tracking-wide text-slate-600">
      Kind
      <input
        bind:value={filters.kind}
        class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="work_order, receipt, review, doc, log..."
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-slate-600">
      Thread ID
      <input
        bind:value={filters.thread_id}
        class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="thread-onboarding"
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-slate-600">
      Created After
      <input
        bind:value={filters.created_after}
        class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        type="datetime-local"
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-slate-600">
      Created Before
      <input
        bind:value={filters.created_before}
        class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        type="datetime-local"
      />
    </label>
  </div>

  <div class="mt-3 flex flex-wrap gap-2">
    <button
      class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading}
      type="submit"
    >
      {loading ? "Loading..." : "Apply filters"}
    </button>
    <button
      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      disabled={loading}
      on:click|preventDefault={clearFilters}
      type="button"
    >
      Clear
    </button>
  </div>
</form>

{#if error}
  <p
    class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
  >
    {error}
  </p>
{:else if !loading && artifacts.length === 0}
  <p
    class="mt-4 rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
  >
    No artifacts match the current filters.
  </p>
{/if}

<ul class="mt-6 space-y-4">
  {#each artifacts as artifact}
    <li class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <a
        class="text-base font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
        href={`/artifacts/${artifact.id}`}
      >
        {artifact.id}
      </a>

      <p class="mt-1 text-sm text-slate-700">
        {artifact.summary || "No summary"}
      </p>

      <div
        class="mt-2 grid gap-1 text-xs uppercase tracking-wide text-slate-500 md:grid-cols-2"
      >
        <p>kind: {artifact.kind || "unknown"}</p>
        <p>created_at: {artifact.created_at || "unknown"}</p>
        <p>created_by: {artifact.created_by || "unknown"}</p>
        <p>thread_id: {artifact.thread_id || "none"}</p>
      </div>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        {#if (artifact.refs ?? []).length === 0}
          <span class="rounded bg-slate-100 px-2 py-1 text-slate-600"
            >No refs</span
          >
        {:else}
          {#each artifact.refs ?? [] as refValue}
            <span class="rounded bg-slate-100 px-2 py-1">
              <RefLink {refValue} threadId={artifact.thread_id} />
            </span>
          {/each}
        {/if}
      </div>

      <div class="mt-3">
        <ProvenanceBadge provenance={artifact.provenance ?? { sources: [] }} />
      </div>

      <div class="mt-3">
        <UnknownObjectPanel
          objectData={artifact}
          title="Raw Artifact Metadata"
        />
      </div>
    </li>
  {/each}
</ul>
