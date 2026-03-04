<script>
  import { page } from "$app/stores";

  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";

  $: snapshotId = $page.params.snapshotId;
  $: snapshot = {
    id: snapshotId,
    type: "unknown_snapshot_type",
    note: "Snapshot detail placeholder for non-thread snapshots.",
    unknown_field: {
      preserved: true,
    },
  };
</script>

<h1 class="text-2xl font-semibold">Snapshot Placeholder: {snapshotId}</h1>
<p class="mt-2 max-w-2xl text-slate-700">
  This placeholder exists so `snapshot:` refs always resolve deterministically.
</p>

<div class="mt-6">
  <UnknownObjectPanel
    objectData={snapshot}
    title="Raw Snapshot JSON"
    open={true}
  />
</div>
