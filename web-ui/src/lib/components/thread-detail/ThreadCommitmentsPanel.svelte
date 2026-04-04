<script>
  import { threadDetailStore } from "$lib/threadDetailStore";
  import {
    actorRegistry,
    lookupActorDisplayName,
    principalRegistry,
  } from "$lib/actorSession";
  import { formatTimestamp } from "$lib/formatDate";
  import MarkdownRenderer from "$lib/components/MarkdownRenderer.svelte";
  import RefLink from "$lib/components/RefLink.svelte";

  const COMMITMENT_STATUS_LABELS = {
    open: "Open",
    blocked: "Blocked",
    done: "Completed",
    canceled: "Canceled",
  };

  let { threadId } = $props();

  let commitments = $derived($threadDetailStore.commitments);
  let commitmentsLoading = $derived($threadDetailStore.commitmentsLoading);

  let actorName = $derived((id) =>
    lookupActorDisplayName(id, $actorRegistry, $principalRegistry),
  );

  function statusBadgeClass(status) {
    if (status === "done") return "bg-emerald-500/10 text-emerald-400";
    if (status === "blocked") return "bg-amber-500/10 text-amber-400";
    if (status === "canceled")
      return "bg-[var(--ui-border)] text-[var(--ui-text-muted)]";
    return "bg-blue-500/10 text-blue-400";
  }

  function commitmentRiskState(commitment) {
    const dueAt = Date.parse(String(commitment?.due_at ?? ""));
    if (!Number.isFinite(dueAt)) {
      return {
        label: commitment?.status === "blocked" ? "Blocked" : "No due date",
        tone:
          commitment?.status === "blocked"
            ? "bg-amber-500/10 text-amber-400"
            : "bg-[var(--ui-border)] text-[var(--ui-text-muted)]",
      };
    }

    const deltaMs = dueAt - Date.now();
    if (deltaMs < 0) {
      return {
        label:
          commitment?.status === "blocked" ? "Blocked and overdue" : "Overdue",
        tone: "bg-red-500/10 text-red-400",
      };
    }

    if (commitment?.status === "blocked") {
      return {
        label: "Blocked",
        tone: "bg-amber-500/10 text-amber-400",
      };
    }

    if (deltaMs <= 48 * 60 * 60 * 1000) {
      return {
        label: "Due soon",
        tone: "bg-amber-500/10 text-amber-400",
      };
    }

    return {
      label: "On track",
      tone: "bg-emerald-500/10 text-emerald-400",
    };
  }
</script>

<div
  class="mt-4 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel)]"
>
  <div
    class="border-b border-[var(--ui-border-subtle)] px-4 py-2.5 text-[12px] text-[var(--ui-text-muted)]"
  >
    <h2
      class="text-[12px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]"
    >
      Commitments
    </h2>
    <p class="mt-2 text-[13px] leading-snug text-[var(--ui-text-muted)]">
      HTTP <span class="font-mono text-[12px]">/commitments</span> was removed
      in schema 0.3.0. The list below is read-only data from the thread
      workspace projection. Plan and mutate work on boards as
      <span class="font-mono text-[12px]">cards</span>.
    </p>
  </div>

  {#if commitmentsLoading}
    <p class="px-4 py-3 text-[12px] text-[var(--ui-text-muted)]">Loading...</p>
  {:else if commitments.length === 0}
    <p class="px-4 py-3 text-[13px] text-[var(--ui-text-muted)]">
      No open commitments. All clear.
    </p>
  {:else}
    {#each commitments as commitment, i}
      <div
        class="border-b border-[var(--ui-border-subtle)] px-4 py-3 {i ===
        commitments.length - 1
          ? 'border-b-0'
          : ''}"
        id={`commitment-card-${commitment.id}`}
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium text-[var(--ui-text)]">
              {commitment.title || ""}{#if !commitment.title}<span
                  class="font-mono text-[var(--ui-text-subtle)]"
                  >{commitment.id}</span
                >{/if}
            </p>
            <p class="mt-0.5 text-[12px] text-[var(--ui-text-muted)]">
              {actorName(commitment.owner)} · Due {commitment.due_at
                ? formatTimestamp(commitment.due_at)
                : "—"}
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                class={`rounded px-2 py-0.5 text-[11px] font-medium ${commitmentRiskState(commitment).tone}`}
                >{commitmentRiskState(commitment).label}</span
              >
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              class={`rounded px-2 py-0.5 text-[12px] font-medium ${statusBadgeClass(commitment.status)}`}
              >{COMMITMENT_STATUS_LABELS[commitment.status] ??
                commitment.status}</span
            >
          </div>
        </div>

        {#if (commitment.definition_of_done ?? []).length > 0}
          <ul
            class="mt-1.5 list-inside list-disc text-[12px] text-[var(--ui-text-muted)]"
          >
            {#each commitment.definition_of_done ?? [] as item}<li>
                <MarkdownRenderer
                  source={item}
                  inline
                  class="text-[12px] text-[var(--ui-text-muted)]"
                />
              </li>{/each}
          </ul>
        {/if}

        {#if (commitment.links ?? []).length > 0}
          <div class="mt-1.5 flex flex-wrap gap-1.5 text-[12px]">
            {#each commitment.links ?? [] as refValue}<RefLink
                {refValue}
                {threadId}
              />{/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>
