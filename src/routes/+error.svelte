<script>
  import { page } from "$app/stores";
</script>

<div class="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900">
  <h1 class="text-2xl font-semibold">
    Unable to start Organization Autorunner UI
  </h1>
  <p class="mt-3 whitespace-pre-wrap text-sm leading-6">
    {$page.error?.message ?? "An unexpected startup error occurred."}
  </p>
</div>
