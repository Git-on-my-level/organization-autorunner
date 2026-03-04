<script>
  import { resolveRefLink } from "$lib/refLinkModel";

  export let refValue = "";
  export let threadId = "";
  export let snapshotIsThread = false;

  $: resolved = resolveRefLink(refValue, { threadId, snapshotIsThread });
</script>

{#if resolved.isLink}
  <a
    class="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-600"
    href={resolved.href}
    rel={resolved.isExternal ? "noreferrer noopener" : undefined}
    target={resolved.isExternal ? "_blank" : undefined}
  >
    {resolved.label}
  </a>
{:else}
  <span class="font-mono text-xs text-slate-700">{resolved.label}</span>
{/if}
