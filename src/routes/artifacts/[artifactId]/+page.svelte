<script>
  import { page } from "$app/stores";

  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  $: artifactId = $page.params.artifactId;

  $: artifact = {
    id: artifactId,
    kind: artifactId.includes("weird") ? "unknown_vendor_kind" : "doc",
    summary: `Artifact detail for ${artifactId}`,
    refs: [
      "thread:thread-onboarding",
      "snapshot:snapshot-99",
      "event:evt-1001",
      "url:https://example.com/artifact-view",
      "mystery:raw-reference",
    ],
    provenance: {
      sources: ["receipt:artifact-proof", "inferred"],
      notes: "Mixed evidence and inference on artifact classification.",
    },
    unknown_vendor_payload: {
      checksum_hint: "abc123",
      model_version: "future-2",
    },
  };
</script>

<h1 class="text-2xl font-semibold">Artifact Detail: {artifactId}</h1>
<p class="mt-2 max-w-2xl text-slate-700">{artifact.summary}</p>

<section class="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
  <p class="text-xs uppercase tracking-wide text-slate-500">
    kind: {artifact.kind}
  </p>

  <div class="mt-3 flex flex-wrap gap-2 text-xs">
    {#each artifact.refs as refValue}
      <span class="rounded bg-slate-100 px-2 py-1">
        <RefLink {refValue} threadId="thread-onboarding" />
      </span>
    {/each}
  </div>

  <div class="mt-3">
    <ProvenanceBadge provenance={artifact.provenance} />
  </div>

  <div class="mt-3">
    <UnknownObjectPanel
      objectData={artifact}
      title="Raw Artifact JSON"
      open={true}
    />
  </div>
</section>
