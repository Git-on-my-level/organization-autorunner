<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  import { actorRegistry, lookupActorDisplayName } from "$lib/actorSession";
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";
  import { coreClient } from "$lib/coreClient";

  $: threadId = $page.params.threadId;
  $: actorName = (actorId) => lookupActorDisplayName(actorId, $actorRegistry);
  let timeline = [];
  let timelineLoading = false;
  let timelineError = "";

  $: snapshot = {
    id: threadId,
    type: "thread",
    title: `Thread ${threadId}`,
    status: "active",
    priority: "p1",
    current_summary:
      "Placeholder thread detail view with timeline and raw object visibility.",
    updated_by: "actor-policy-owner",
    refs: [
      `thread:${threadId}`,
      "artifact:artifact-policy-draft",
      "snapshot:snapshot-99",
    ],
    provenance: {
      sources: ["actor_statement:event-1001"],
      by_field: {
        status: ["receipt:artifact-999"],
      },
    },
    unknown_field_from_future_client: {
      nested_flag: true,
    },
  };

  onMount(async () => {
    await loadTimeline(threadId);
  });

  async function loadTimeline(targetThreadId) {
    timelineLoading = true;
    timelineError = "";

    try {
      const response = await coreClient.listThreadTimeline(targetThreadId);
      timeline = response.events ?? [];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      timelineError = `Failed to load timeline: ${reason}`;
      timeline = [];
    } finally {
      timelineLoading = false;
    }
  }
</script>

<h1 class="text-2xl font-semibold">Thread Detail: {threadId}</h1>
<p class="mt-2 max-w-2xl text-slate-700">{snapshot.current_summary}</p>

<section class="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
    Snapshot
  </h2>
  <p class="mt-2 text-sm text-slate-700">
    updated_by: <span class="font-medium">{actorName(snapshot.updated_by)}</span
    >
  </p>

  <div class="mt-3 flex flex-wrap gap-2 text-xs">
    {#each snapshot.refs as refValue}
      <span class="rounded bg-slate-100 px-2 py-1">
        <RefLink {refValue} snapshotIsThread={true} {threadId} />
      </span>
    {/each}
  </div>

  <div class="mt-3">
    <ProvenanceBadge provenance={snapshot.provenance} />
  </div>

  <div class="mt-3">
    <UnknownObjectPanel
      objectData={snapshot}
      title="Raw Thread Snapshot JSON"
    />
  </div>
</section>

<section class="mt-6 space-y-3">
  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
    Timeline
  </h2>

  {#if timelineLoading}
    <p class="rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
      Loading timeline...
    </p>
  {:else if timelineError}
    <p
      class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
    >
      {timelineError}
    </p>
  {:else if timeline.length === 0}
    <p class="rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
      No timeline events for this thread yet.
    </p>
  {:else}
    {#each timeline as event}
      <article
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        id={`event-${event.id}`}
      >
        <p class="text-sm font-semibold text-slate-900">{event.summary}</p>
        <p class="mt-1 text-xs text-slate-600">type: {event.type}</p>
        <p class="mt-1 text-xs text-slate-600">
          actor: {actorName(event.actor_id)}
        </p>

        <div class="mt-3 flex flex-wrap gap-2 text-xs">
          {#each event.refs ?? [] as refValue}
            <span class="rounded bg-slate-100 px-2 py-1">
              <RefLink {refValue} {threadId} />
            </span>
          {/each}
        </div>

        <div class="mt-3">
          <ProvenanceBadge provenance={event.provenance ?? { sources: [] }} />
        </div>

        <div class="mt-3">
          <UnknownObjectPanel objectData={event} title="Raw Event JSON" />
        </div>
      </article>
    {/each}
  {/if}
</section>
