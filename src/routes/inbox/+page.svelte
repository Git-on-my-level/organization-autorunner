<script>
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  const inboxItems = [
    {
      id: "item-001",
      category: "decision_needed",
      summary: "Choose next owner for thread onboarding",
      refs: [
        "thread:thread-onboarding",
        "event:evt-abc123",
        "url:https://example.com/context",
      ],
      provenance: {
        sources: ["receipt:artifact-1", "inferred"],
        notes: "Derived by inbox classifier from recent timeline activity.",
      },
      unknown_extension_field: {
        triage_score: 0.82,
      },
    },
    {
      id: "item-002",
      category: "exception",
      summary: "Unknown reference prefix should remain visible.",
      refs: ["mystery:opaque-ref-99"],
      provenance: {
        sources: ["actor_statement:event-22"],
      },
      custom_status: "pending-human-review",
    },
  ];
</script>

<h1 class="text-2xl font-semibold">Inbox</h1>
<p class="mt-2 max-w-2xl text-slate-700">
  Placeholder inbox feed. Ref rendering, provenance badges, and raw JSON
  sections are enabled for schema-compatible unknowns.
</p>

<ul class="mt-6 space-y-4">
  {#each inboxItems as item}
    <li
      class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      id={`inbox-${item.id}`}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {item.category}
      </p>
      <p class="mt-1 text-base font-semibold text-slate-900">{item.summary}</p>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        {#each item.refs as refValue}
          <span class="rounded bg-slate-100 px-2 py-1">
            <RefLink {refValue} threadId="thread-onboarding" />
          </span>
        {/each}
      </div>

      <div class="mt-3">
        <ProvenanceBadge provenance={item.provenance} />
      </div>

      <div class="mt-3">
        <UnknownObjectPanel objectData={item} title="Raw Inbox Item" />
      </div>
    </li>
  {/each}
</ul>
