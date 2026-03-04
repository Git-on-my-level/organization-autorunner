<script>
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  const threads = [
    {
      id: "thread-onboarding",
      title: "Customer Onboarding Workflow",
      status: "active",
      priority: "p1",
      current_summary:
        "Cross-functional onboarding handoff is delayed by policy review.",
      refs: [
        "artifact:artifact-policy-draft",
        "url:https://example.com/onboarding",
      ],
      provenance: {
        sources: ["actor_statement:event-1001", "receipt:artifact-334"],
      },
      unknown_policy_field: "requires-legal-signoff",
    },
    {
      id: "thread-incident-42",
      title: "Incident Follow-up",
      status: "paused",
      priority: "p0",
      current_summary: "Postmortem incomplete due to missing external logs.",
      refs: ["event:evt-42", "snapshot:snapshot-incident-42"],
      provenance: {
        sources: ["inferred"],
        notes: "Thread status inferred from unresolved commitments.",
      },
      unrecognized_flag: true,
    },
  ];
</script>

<h1 class="text-2xl font-semibold">Threads</h1>
<p class="mt-2 max-w-2xl text-slate-700">
  Placeholder thread list using shared reference + provenance components.
</p>

<ul class="mt-6 space-y-4">
  {#each threads as thread}
    <li class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <div>
          <a
            class="text-lg font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
            href={`/threads/${thread.id}`}
          >
            {thread.title}
          </a>
          <p class="mt-1 text-xs uppercase tracking-wide text-slate-500">
            {thread.status} • {thread.priority}
          </p>
        </div>
      </div>

      <p class="mt-3 text-sm text-slate-700">{thread.current_summary}</p>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        {#each thread.refs as refValue}
          <span class="rounded bg-slate-100 px-2 py-1">
            <RefLink {refValue} snapshotIsThread={true} threadId={thread.id} />
          </span>
        {/each}
      </div>

      <div class="mt-3">
        <ProvenanceBadge provenance={thread.provenance} />
      </div>

      <div class="mt-3">
        <UnknownObjectPanel objectData={thread} title="Raw Thread Snapshot" />
      </div>
    </li>
  {/each}
</ul>
