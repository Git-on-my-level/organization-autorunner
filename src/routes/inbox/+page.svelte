<script>
  import { onMount } from "svelte";

  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";
  import { coreClient } from "$lib/coreClient";
  import { groupInboxItems } from "$lib/inboxUtils";

  let loading = false;
  let error = "";
  let items = [];
  let ackInFlightById = {};
  let decisionInFlightById = {};
  let decisionFormsById = {};
  let postedDecisionByThread = {};

  $: groupedItems = groupInboxItems(items);

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
      error = `Failed to acknowledge inbox item ${item.id}: ${reason}`;
      items = previousItems;
    } finally {
      ackInFlightById = { ...ackInFlightById, [item.id]: false };
    }
  }

  async function recordDecision(item) {
    const draft = getDecisionForm(item.id);
    error = "";

    if (!item.thread_id) {
      error = "Cannot record decision: inbox item has no thread_id.";
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

      postedDecisionByThread = {
        ...postedDecisionByThread,
        [item.thread_id]: response.event,
      };

      toggleDecisionForm(item.id, false);
      updateDecisionField(item.id, "summary", "");
      updateDecisionField(item.id, "notes", "");
    } catch (decisionError) {
      const reason =
        decisionError instanceof Error
          ? decisionError.message
          : String(decisionError);
      error = `Failed to record decision for ${item.id}: ${reason}`;
    } finally {
      decisionInFlightById = { ...decisionInFlightById, [item.id]: false };
    }
  }
</script>

<h1 class="text-2xl font-semibold">Inbox</h1>
<p class="mt-2 max-w-3xl text-sm text-slate-700">
  Inbox items are grouped by category and sorted deterministically. Each item
  supports acknowledgment and lightweight decision recording.
</p>

{#if error}
  <p
    class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
  >
    {error}
  </p>
{/if}

{#if loading}
  <p
    class="mt-4 rounded-md bg-white px-3 py-3 text-sm text-slate-700 shadow-sm"
  >
    Loading inbox items...
  </p>
{:else}
  <div class="mt-6 space-y-6">
    {#each groupedItems as group}
      <section
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2
          class="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {group.category}
        </h2>

        {#if group.items.length === 0}
          <p class="mt-3 text-sm text-slate-600">No items in this category.</p>
        {:else}
          <ul class="mt-3 space-y-4">
            {#each group.items as item}
              <li class="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p class="text-sm font-semibold text-slate-900">{item.title}</p>
                <p class="mt-1 text-sm text-slate-700">
                  Recommended action: {item.recommended_action}
                </p>

                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {#if item.thread_id}
                    <a
                      class="rounded bg-white px-2 py-1 text-sky-700 underline decoration-sky-300 underline-offset-2"
                      href={`/threads/${item.thread_id}`}
                    >
                      thread:{item.thread_id}
                    </a>
                  {/if}
                  {#if item.commitment_id}
                    <a
                      class="rounded bg-white px-2 py-1 text-sky-700 underline decoration-sky-300 underline-offset-2"
                      href={item.thread_id
                        ? `/threads/${item.thread_id}#commitment-${item.commitment_id}`
                        : `/threads#commitment-${item.commitment_id}`}
                    >
                      commitment:{item.commitment_id}
                    </a>
                  {/if}

                  {#each item.refs ?? [] as refValue}
                    <span class="rounded bg-white px-2 py-1">
                      <RefLink {refValue} threadId={item.thread_id} />
                    </span>
                  {/each}
                </div>

                <div class="mt-3">
                  <ProvenanceBadge
                    provenance={item.provenance ?? { sources: ["inferred"] }}
                  />
                </div>

                {#if postedDecisionByThread[item.thread_id]}
                  <p class="mt-3 text-xs text-emerald-700">
                    Decision recorded. View timeline:
                    <a
                      class="underline"
                      href={`/threads/${item.thread_id}#event-${postedDecisionByThread[item.thread_id].id}`}
                    >
                      event:{postedDecisionByThread[item.thread_id].id}
                    </a>
                  </p>
                {/if}

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(ackInFlightById[item.id])}
                    on:click={() => acknowledgeItem(item)}
                    type="button"
                  >
                    {ackInFlightById[item.id]
                      ? "Acknowledging..."
                      : "Acknowledge"}
                  </button>

                  <button
                    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    on:click={() =>
                      toggleDecisionForm(
                        item.id,
                        !getDecisionForm(item.id).open,
                      )}
                    type="button"
                  >
                    {getDecisionForm(item.id).open
                      ? "Hide decision form"
                      : "Record decision"}
                  </button>
                </div>

                {#if getDecisionForm(item.id).open}
                  <form
                    class="mt-3 rounded-md border border-slate-200 bg-white p-3"
                    on:submit|preventDefault={() => recordDecision(item)}
                  >
                    <label
                      class="block text-xs font-semibold text-slate-600"
                      for={`decision-summary-${item.id}`}
                    >
                      Decision summary
                    </label>
                    <input
                      class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      id={`decision-summary-${item.id}`}
                      on:input={(event) =>
                        updateDecisionField(
                          item.id,
                          "summary",
                          event.currentTarget.value,
                        )}
                      value={getDecisionForm(item.id).summary}
                    />

                    <label
                      class="mt-3 block text-xs font-semibold text-slate-600"
                      for={`decision-notes-${item.id}`}
                    >
                      Notes
                    </label>
                    <textarea
                      class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      id={`decision-notes-${item.id}`}
                      on:input={(event) =>
                        updateDecisionField(
                          item.id,
                          "notes",
                          event.currentTarget.value,
                        )}
                      rows="3">{getDecisionForm(item.id).notes}</textarea
                    >

                    <button
                      class="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Boolean(decisionInFlightById[item.id])}
                      type="submit"
                    >
                      {decisionInFlightById[item.id]
                        ? "Recording..."
                        : "Submit decision"}
                    </button>
                  </form>
                {/if}

                <div class="mt-3">
                  <UnknownObjectPanel
                    objectData={item}
                    title="Raw Inbox Item JSON"
                  />
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
{/if}
