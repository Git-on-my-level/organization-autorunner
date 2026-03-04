<script>
  export let provenance = { sources: [] };

  $: sources = provenance?.sources ?? [];
  $: hasInferred = sources.some((source) =>
    String(source).includes("inferred"),
  );
</script>

<div
  class={`rounded-md border px-3 py-2 text-xs ${
    hasInferred
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-300 bg-emerald-50 text-emerald-900"
  }`}
>
  <p class="font-semibold">
    {hasInferred ? "Inferred provenance" : "Evidence-backed provenance"}
  </p>
  <p class="mt-1">sources: {sources.join(", ") || "none"}</p>

  {#if provenance?.notes}
    <p class="mt-1">notes: {provenance.notes}</p>
  {/if}

  {#if provenance?.by_field}
    <details class="mt-1">
      <summary class="cursor-pointer">by_field</summary>
      <pre
        class="mt-1 overflow-auto rounded bg-white/70 p-2 text-[11px]">{JSON.stringify(
          provenance.by_field,
          null,
          2,
        )}</pre>
    </details>
  {/if}
</div>
