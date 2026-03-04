<script>
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  const artifacts = [
    {
      id: "artifact-policy-draft",
      kind: "doc",
      summary: "Draft onboarding policy",
      created_by: "actor-policy-owner",
      refs: ["thread:thread-onboarding"],
      provenance: {
        sources: ["actor_statement:event-900"],
      },
      custom_metadata: {
        legal_review_required: true,
      },
    },
    {
      id: "artifact-weird-1",
      kind: "third_party_blob",
      summary: "Unknown artifact kind preserved for display.",
      created_by: "actor-integrations",
      refs: ["url:https://example.com/blob", "mystery:artifact-edge-case"],
      provenance: {
        sources: ["inferred"],
      },
      opaque_vendor_field: "x-42",
    },
  ];
</script>

<h1 class="text-2xl font-semibold">Artifacts</h1>
<p class="mt-2 max-w-2xl text-slate-700">
  Placeholder artifact index with unknown-kind rendering and raw JSON
  visibility.
</p>

<ul class="mt-6 space-y-4">
  {#each artifacts as artifact}
    <li class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <a
        class="text-base font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
        href={`/artifacts/${artifact.id}`}
      >
        {artifact.summary}
      </a>
      <p class="mt-1 text-xs uppercase tracking-wide text-slate-500">
        kind: {artifact.kind}
      </p>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        {#each artifact.refs as refValue}
          <span class="rounded bg-slate-100 px-2 py-1">
            <RefLink {refValue} />
          </span>
        {/each}
      </div>

      <div class="mt-3">
        <ProvenanceBadge provenance={artifact.provenance} />
      </div>

      <div class="mt-3">
        <UnknownObjectPanel objectData={artifact} title="Raw Artifact Object" />
      </div>
    </li>
  {/each}
</ul>
