<script>
  import { page } from "$app/stores";

  import { actorRegistry, lookupActorDisplayName } from "$lib/actorSession";
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  $: threadId = $page.params.threadId;
  $: actorName = (actorId) => lookupActorDisplayName(actorId, $actorRegistry);

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

  $: timeline = [
    {
      id: "evt-1001",
      type: "message_posted",
      actor_id: "actor-policy-owner",
      summary: "Waiting on legal review confirmation.",
      refs: [`thread:${threadId}`, "artifact:artifact-policy-draft"],
      provenance: {
        sources: ["actor_statement:event-1001"],
      },
      unknown_detail: "kept-visible",
    },
    {
      id: "evt-1002",
      type: "unknown_future_type",
      actor_id: "actor-integrations",
      summary: "Future event type should still render.",
      refs: [`event:evt-1001`, "mystery:opaque-value"],
      provenance: {
        sources: ["inferred"],
      },
      vendor_payload: {
        score: 9,
      },
    },
  ];
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
        {#each event.refs as refValue}
          <span class="rounded bg-slate-100 px-2 py-1">
            <RefLink {refValue} {threadId} />
          </span>
        {/each}
      </div>

      <div class="mt-3">
        <ProvenanceBadge provenance={event.provenance} />
      </div>

      <div class="mt-3">
        <UnknownObjectPanel objectData={event} title="Raw Event JSON" />
      </div>
    </article>
  {/each}
</section>
