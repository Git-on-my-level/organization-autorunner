<script>
  import { resolveRefLink } from "$lib/refLinkModel";

  export let refValue = "";
  export let threadId = "";
  export let snapshotIsThread = false;

  $: resolved = resolveRefLink(refValue, { threadId, snapshotIsThread });
</script>

{#if resolved.isLink}
  <a
    class="text-indigo-600 hover:text-indigo-800"
    href={resolved.href}
    rel={resolved.isExternal ? "noreferrer noopener" : undefined}
    target={resolved.isExternal ? "_blank" : undefined}
  >
    {resolved.label}
  </a>
{:else}
  <span class="text-xs text-gray-500">{resolved.label}</span>
{/if}
