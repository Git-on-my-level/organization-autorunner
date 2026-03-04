<script>
  import { actorRegistry, lookupActorDisplayName } from "$lib/actorSession";
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";
  import { coreClient } from "$lib/coreClient";

  let posting = false;
  let postError = "";
  let timelineEvents = [];

  function actorName(actorId) {
    return lookupActorDisplayName(actorId, $actorRegistry);
  }

  async function postSampleMessage() {
    posting = true;
    postError = "";

    try {
      const response = await coreClient.createEvent({
        event: {
          type: "message_posted",
          refs: ["thread:thread-onboarding"],
          summary: "Sample message posted from oar-ui shell",
          payload: {
            text: "Bootstrap timeline message",
          },
          provenance: {
            sources: ["actor_statement:ui"],
          },
        },
      });

      timelineEvents = [response.event, ...timelineEvents];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      postError = `Failed to post event: ${reason}`;
    } finally {
      posting = false;
    }
  }
</script>

<h1 class="text-3xl font-semibold">Organization Autorunner UI</h1>
<p class="mt-3 max-w-xl text-slate-700">
  Actor authentication is enabled. Use this page to post a sample event and
  verify actor display names in the timeline preview.
</p>

<section class="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-slate-900">Timeline Preview</h2>
    <button
      class="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={posting}
      on:click={postSampleMessage}
      type="button"
    >
      {posting ? "Posting..." : "Post Sample Message"}
    </button>
  </div>

  {#if postError}
    <p
      class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
    >
      {postError}
    </p>
  {/if}

  {#if timelineEvents.length === 0}
    <p class="mt-4 text-sm text-slate-600">
      No events yet. Post a sample message to populate the timeline.
    </p>
  {:else}
    <ul class="mt-4 space-y-3">
      {#each timelineEvents as event}
        <li class="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <p class="text-sm font-medium text-slate-900">{event.summary}</p>
          <p class="mt-1 text-xs text-slate-600">Event type: {event.type}</p>
          <p class="mt-1 text-xs text-slate-600">
            created_by: {actorName(event.actor_id)}
          </p>
          <p class="mt-1 text-xs text-slate-600">
            updated_by: {actorName(event.actor_id)}
          </p>

          {#if event.refs?.length}
            <div class="mt-2 flex flex-wrap gap-2 text-xs">
              {#each event.refs as refValue}
                <span class="rounded bg-white px-2 py-1">
                  <RefLink {refValue} threadId="thread-onboarding" />
                </span>
              {/each}
            </div>
          {/if}

          <div class="mt-2">
            <ProvenanceBadge provenance={event.provenance ?? { sources: [] }} />
          </div>

          <div class="mt-2">
            <UnknownObjectPanel objectData={event} title="Raw Event JSON" />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
