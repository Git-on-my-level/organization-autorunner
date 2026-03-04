<script>
  import { page } from "$app/stores";

  $: snapshotId = $page.params.snapshotId;
</script>

<h1 class="text-lg font-semibold text-gray-900">Snapshot</h1>
<p class="mt-1 text-sm text-gray-500">{snapshotId}</p>
<p class="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
  Placeholder for non-thread snapshot detail.
</p>
