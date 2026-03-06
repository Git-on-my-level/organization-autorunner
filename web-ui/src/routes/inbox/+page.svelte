<script>
  import { onMount } from "svelte";

  import RefLink from "$lib/components/RefLink.svelte";
  import { coreClient } from "$lib/coreClient";
  import { groupInboxItems, getInboxCategoryLabel } from "$lib/inboxUtils";

  let loading = $state(false);
  let error = $state("");
  let items = $state([]);
  let ackInFlightById = $state({});
  let decisionInFlightById = $state({});
  let decisionFormsById = $state({});
  let postedDecisionByInboxItem = $state({});

  let groupedItems = $derived(groupInboxItems(items));
  let totalItems = $derived(items.length);

  onMount(async () => {
    await loadInbox();
  });

  async function loadInbox() {
    loading = true;
    error = "";

    try {
      const response = await coreClient.listInboxItems({ view: "items" });
      items = response.items ?? [];
    } catch (loadError) {
      const reason =
        loadError instanceof Error ? loadError.message : String(loadError);
      error = `Failed to load inbox: ${reason}`;
      items = [];
    } finally {
      loading = false;
    }
  }

  function getDecisionForm(itemId) {
    return (
      decisionFormsById[itemId] ?? {
        summary: "",
        notes: "",
        open: false,
      }
    );
  }

  function toggleDecisionForm(itemId, open) {
    decisionFormsById = {
      ...decisionFormsById,
      [itemId]: {
        ...getDecisionForm(itemId),
        open,
      },
    };
  }

  function updateDecisionField(itemId, field, value) {
    decisionFormsById = {
      ...decisionFormsById,
      [itemId]: {
        ...getDecisionForm(itemId),
        [field]: value,
      },
    };
  }

  async function acknowledgeItem(item) {
    const previousItems = items;
    error = "";
    ackInFlightById = { ...ackInFlightById, [item.id]: true };

    items = items.filter((candidate) => candidate.id !== item.id);

    try {
      await coreClient.ackInboxItem({
        thread_id: item.thread_id,
        inbox_item_id: item.id,
      });
    } catch (ackError) {
      const reason =
        ackError instanceof Error ? ackError.message : String(ackError);
      error = `Failed to acknowledge item: ${reason}`;
      items = previousItems;
    } finally {
      ackInFlightById = { ...ackInFlightById, [item.id]: false };
    }
  }

  async function recordDecision(item) {
    const draft = getDecisionForm(item.id);
    error = "";

    if (!item.thread_id) {
      error = "Cannot record decision: no linked thread.";
      return;
    }

    if (!draft.summary.trim()) {
      error = "Decision summary is required.";
      return;
    }

    decisionInFlightById = { ...decisionInFlightById, [item.id]: true };

    try {
      const response = await coreClient.createEvent({
        event: {
          type: "decision_made",
          thread_id: item.thread_id,
          refs: item.refs ?? [],
          summary: draft.summary.trim(),
          payload: {
            notes: draft.notes.trim(),
            inbox_item_id: item.id,
            recommended_action: item.recommended_action ?? "",
          },
          provenance: {
            sources: ["actor_statement:ui"],
          },
        },
      });

      postedDecisionByInboxItem = {
        ...postedDecisionByInboxItem,
        [item.id]: response.event,
      };

      toggleDecisionForm(item.id, false);
      updateDecisionField(item.id, "summary", "");
      updateDecisionField(item.id, "notes", "");
    } catch (decisionError) {
      const reason =
        decisionError instanceof Error
          ? decisionError.message
          : String(decisionError);
      error = `Failed to record decision: ${reason}`;
    } finally {
      decisionInFlightById = { ...decisionInFlightById, [item.id]: false };
    }
  }

  function categoryIcon(category) {
    if (category === "decision_needed") return "decision";
    if (category === "exception") return "exception";
    if (category === "commitment_risk") return "risk";
    return "default";
  }
</script>

<div class="flex items-center justify-between">
  <div class="flex items-center gap-3">
    <h1 class="text-lg font-semibold text-gray-900">Inbox</h1>
    {#if totalItems > 0}
      <span
        class="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-medium text-white"
        >{totalItems}</span
      >
    {/if}
  </div>
</div>

{#if error}
  <div
    class="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
  >
    <svg
      class="mt-0.5 h-4 w-4 shrink-0 text-red-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
    {error}
  </div>
{/if}

{#if loading}
  <div
    class="mt-12 flex items-center justify-center gap-2 text-sm text-gray-400"
  >
    <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      ></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    Loading inbox...
  </div>
{:else}
  <div class="mt-5 space-y-6">
    {#each groupedItems as group}
      <section>
        <div class="mb-2 flex items-center gap-2">
          {#if categoryIcon(group.category) === "decision"}
            <svg
              class="h-3.5 w-3.5 text-indigo-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          {:else if categoryIcon(group.category) === "exception"}
            <svg
              class="h-3.5 w-3.5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          {:else if categoryIcon(group.category) === "risk"}
            <svg
              class="h-3.5 w-3.5 text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          {:else}
            <svg
              class="h-3.5 w-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
          {/if}
          <h2 class="text-xs font-medium text-gray-500">
            {getInboxCategoryLabel(group.category)}
          </h2>
          {#if group.items.length > 0}
            <span class="text-[11px] text-gray-300">{group.items.length}</span>
          {/if}
        </div>

        {#if group.items.length === 0}
          <div
            class="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400"
          >
            Nothing here
          </div>
        {:else}
          <div class="space-y-1.5">
            {#each group.items as item}
              <div
                class="rounded-lg border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900">
                      {item.title}
                    </p>
                    {#if item.recommended_action}
                      <p class="mt-0.5 text-[13px] text-gray-500">
                        {item.recommended_action}
                      </p>
                    {/if}
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      class="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                      disabled={Boolean(ackInFlightById[item.id])}
                      onclick={() => acknowledgeItem(item)}
                      type="button"
                    >
                      {ackInFlightById[item.id] ? "..." : "Dismiss"}
                    </button>
                    <button
                      class="rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100"
                      onclick={() =>
                        toggleDecisionForm(
                          item.id,
                          !getDecisionForm(item.id).open,
                        )}
                      type="button"
                    >
                      {getDecisionForm(item.id).open ? "Cancel" : "Decide"}
                    </button>
                  </div>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {#if item.thread_id}
                    <a
                      class="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                      href={`/threads/${item.thread_id}`}
                    >
                      <svg
                        class="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                      Thread
                    </a>
                  {/if}
                  {#if item.commitment_id}
                    <a
                      class="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                      href={item.thread_id
                        ? `/threads/${item.thread_id}#commitment-${item.commitment_id}`
                        : `/threads#commitment-${item.commitment_id}`}
                      >Commitment</a
                    >
                  {/if}
                  {#each item.refs ?? [] as refValue}
                    <RefLink {refValue} threadId={item.thread_id} />
                  {/each}
                </div>

                {#if postedDecisionByInboxItem[item.id]}
                  <div
                    class="mt-2 flex items-center gap-1.5 text-xs text-emerald-600"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Decision recorded.
                    <a
                      class="font-medium underline decoration-emerald-300"
                      href={`/threads/${item.thread_id}#event-${postedDecisionByInboxItem[item.id].id}`}
                      >View in timeline</a
                    >
                  </div>
                {/if}

                {#if getDecisionForm(item.id).open}
                  <form
                    class="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    onsubmit={(event) => {
                      event.preventDefault();
                      recordDecision(item);
                    }}
                  >
                    <label
                      class="block text-xs font-medium text-gray-600"
                      for={`decision-summary-${item.id}`}
                    >
                      Decision summary
                    </label>
                    <input
                      class="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                      id={`decision-summary-${item.id}`}
                      oninput={(event) =>
                        updateDecisionField(
                          item.id,
                          "summary",
                          event.currentTarget.value,
                        )}
                      placeholder="What was decided?"
                      value={getDecisionForm(item.id).summary}
                    />
                    <label
                      class="mt-2.5 block text-xs font-medium text-gray-600"
                      for={`decision-notes-${item.id}`}
                    >
                      Notes
                      <span class="font-normal text-gray-400">optional</span>
                    </label>
                    <textarea
                      class="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                      id={`decision-notes-${item.id}`}
                      oninput={(event) =>
                        updateDecisionField(
                          item.id,
                          "notes",
                          event.currentTarget.value,
                        )}
                      placeholder="Additional context..."
                      rows="2">{getDecisionForm(item.id).notes}</textarea
                    >
                    <div class="mt-3 flex justify-end">
                      <button
                        class="rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        disabled={Boolean(decisionInFlightById[item.id])}
                        type="submit"
                      >
                        {decisionInFlightById[item.id]
                          ? "Recording..."
                          : "Record decision"}
                      </button>
                    </div>
                  </form>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}
