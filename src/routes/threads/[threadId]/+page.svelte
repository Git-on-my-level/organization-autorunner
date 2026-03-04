<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  import { actorRegistry, lookupActorDisplayName } from "$lib/actorSession";
  import ProvenanceBadge from "$lib/components/ProvenanceBadge.svelte";
  import RefLink from "$lib/components/RefLink.svelte";
  import UnknownObjectPanel from "$lib/components/UnknownObjectPanel.svelte";
  import { coreClient } from "$lib/coreClient";
  import {
    buildThreadPatch,
    parseListInput,
    serializeListInput,
  } from "$lib/threadPatch";
  import { toTimelineView } from "$lib/timelineUtils";

  $: threadId = $page.params.threadId;
  $: actorName = (actorId) => lookupActorDisplayName(actorId, $actorRegistry);

  let snapshot = null;
  let snapshotLoading = false;
  let snapshotError = "";

  let timeline = [];
  let timelineLoading = false;
  let timelineError = "";

  let messageText = "";
  let replyToEventId = "";
  let postingMessage = false;
  let postMessageError = "";

  let editOpen = false;
  let editDraft = null;
  let savingEdit = false;
  let editError = "";
  let editNotice = "";
  let conflictWarning = "";

  onMount(async () => {
    await ensureActorRegistry();
    await loadThreadDetail(threadId);
  });

  $: timelineView = toTimelineView(timeline, { threadId });
  $: canPost = Boolean(messageText.trim()) && !postingMessage;

  function toEditDraft(thread) {
    return {
      title: thread.title ?? "",
      type: thread.type ?? "case",
      status: thread.status ?? "active",
      priority: thread.priority ?? "p2",
      cadence: thread.cadence ?? "weekly",
      next_check_in_at: thread.next_check_in_at ?? "",
      current_summary: thread.current_summary ?? "",
      tagsInput: serializeListInput(thread.tags ?? []),
      nextActionsInput: serializeListInput(thread.next_actions ?? []),
      keyArtifactsInput: serializeListInput(thread.key_artifacts ?? []),
    };
  }

  function beginEdit() {
    if (!snapshot) {
      return;
    }

    editError = "";
    editNotice = "";
    conflictWarning = "";
    editDraft = toEditDraft(snapshot);
    editOpen = true;
  }

  function cancelEdit() {
    editOpen = false;
    editDraft = null;
    editError = "";
  }

  function buildDraftSnapshotFromEdit() {
    return {
      title: editDraft.title.trim(),
      type: editDraft.type,
      status: editDraft.status,
      priority: editDraft.priority,
      cadence: editDraft.cadence,
      next_check_in_at: editDraft.next_check_in_at || null,
      tags: parseListInput(editDraft.tagsInput),
      current_summary: editDraft.current_summary.trim(),
      next_actions: parseListInput(editDraft.nextActionsInput),
      key_artifacts: parseListInput(editDraft.keyArtifactsInput),
    };
  }

  async function saveEdit() {
    if (!snapshot || !editDraft) {
      return;
    }

    savingEdit = true;
    editError = "";
    editNotice = "";

    try {
      const draftSnapshot = buildDraftSnapshotFromEdit();
      const patch = buildThreadPatch(snapshot, draftSnapshot);

      if (Object.keys(patch).length === 0) {
        editNotice = "No changes to save.";
        savingEdit = false;
        return;
      }

      const response = await coreClient.updateThread(threadId, {
        patch,
        if_updated_at: snapshot.updated_at,
      });

      snapshot = response.thread ?? snapshot;
      editOpen = false;
      editDraft = null;
      editNotice = "Snapshot updated.";
      conflictWarning = "";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (error?.status === 409) {
        conflictWarning =
          "Thread was updated elsewhere. Snapshot has been reloaded; reapply your changes before saving.";
        editOpen = false;
        editDraft = null;
        await loadSnapshot(threadId);
      } else {
        editError = `Failed to save snapshot: ${reason}`;
      }
    } finally {
      savingEdit = false;
    }
  }

  async function ensureActorRegistry() {
    if ($actorRegistry.length > 0) {
      return;
    }

    try {
      const response = await coreClient.listActors();
      actorRegistry.set(response.actors ?? []);
    } catch {
      // Thread detail still renders with actor IDs if actor registry cannot be loaded.
    }
  }

  async function loadThreadDetail(targetThreadId) {
    await Promise.all([
      loadSnapshot(targetThreadId),
      loadTimeline(targetThreadId),
      ensureActorRegistry(),
    ]);
  }

  async function loadSnapshot(targetThreadId) {
    snapshotLoading = true;
    snapshotError = "";

    try {
      const response = await coreClient.getThread(targetThreadId);
      snapshot = response.thread ?? null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      snapshotError = `Failed to load thread snapshot: ${reason}`;
      snapshot = null;
    } finally {
      snapshotLoading = false;
    }
  }

  async function loadTimeline(targetThreadId) {
    timelineLoading = true;
    timelineError = "";

    try {
      const response = await coreClient.listThreadTimeline(targetThreadId);
      timeline = response.events ?? [];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      timelineError = `Failed to load timeline: ${reason}`;
      timeline = [];
    } finally {
      timelineLoading = false;
    }
  }

  function setReplyTarget(eventId) {
    replyToEventId = eventId;
  }

  function clearReplyTarget() {
    replyToEventId = "";
  }

  async function postMessage() {
    if (!messageText.trim()) {
      postMessageError = "Message text is required.";
      return;
    }

    postingMessage = true;
    postMessageError = "";

    try {
      const refs = [`thread:${threadId}`];
      if (replyToEventId) {
        refs.push(`event:${replyToEventId}`);
      }

      await coreClient.createEvent({
        event: {
          type: "message_posted",
          thread_id: threadId,
          refs,
          summary: `Message: ${messageText.trim().slice(0, 100)}`,
          payload: {
            text: messageText.trim(),
          },
          provenance: {
            sources: ["actor_statement:ui"],
          },
        },
      });

      messageText = "";
      replyToEventId = "";
      await loadTimeline(threadId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      postMessageError = `Failed to post message: ${reason}`;
    } finally {
      postingMessage = false;
    }
  }
</script>

<h1 class="text-2xl font-semibold">Thread Detail: {threadId}</h1>

{#if snapshotLoading}
  <p class="mt-4 rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
    Loading thread snapshot...
  </p>
{:else if snapshotError}
  <p
    class="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
  >
    {snapshotError}
  </p>
{:else if !snapshot}
  <p class="mt-4 rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
    Thread not found.
  </p>
{:else}
  <section
    class="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Snapshot
      </h2>
      <button
        class="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        on:click={editOpen ? cancelEdit : beginEdit}
        type="button"
      >
        {editOpen ? "Cancel editing" : "Edit snapshot"}
      </button>
    </div>

    {#if conflictWarning}
      <p
        class="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        {conflictWarning}
      </p>
    {/if}

    {#if editNotice}
      <p
        class="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
      >
        {editNotice}
      </p>
    {/if}

    <dl class="mt-3 grid gap-3 text-sm md:grid-cols-2">
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">title</dt>
        <dd class="font-medium text-slate-900">{snapshot.title}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">type</dt>
        <dd class="text-slate-800">{snapshot.type}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">status</dt>
        <dd class="text-slate-800">{snapshot.status}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">priority</dt>
        <dd class="text-slate-800">{snapshot.priority}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">cadence</dt>
        <dd class="text-slate-800">{snapshot.cadence}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">
          next check-in
        </dt>
        <dd class="text-slate-800">{snapshot.next_check_in_at || "none"}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">
          updated by
        </dt>
        <dd class="text-slate-800">{actorName(snapshot.updated_by)}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">
          updated at
        </dt>
        <dd class="text-slate-800">{snapshot.updated_at || "unknown"}</dd>
      </div>
    </dl>

    <div class="mt-3">
      <p class="text-xs uppercase tracking-wide text-slate-500">tags</p>
      <div class="mt-1 flex flex-wrap gap-2 text-xs">
        {#if (snapshot.tags ?? []).length === 0}
          <span class="text-slate-500">none</span>
        {:else}
          {#each snapshot.tags ?? [] as tag}
            <span class="rounded bg-slate-100 px-2 py-1">{tag}</span>
          {/each}
        {/if}
      </div>
    </div>

    <div class="mt-3">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        current summary
      </p>
      <p class="mt-1 text-sm text-slate-800">{snapshot.current_summary}</p>
    </div>

    <div class="mt-3">
      <p class="text-xs uppercase tracking-wide text-slate-500">next actions</p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
        {#each snapshot.next_actions ?? [] as action}
          <li>{action}</li>
        {/each}
      </ul>
    </div>

    <div class="mt-3">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        key artifacts
      </p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
        {#if (snapshot.key_artifacts ?? []).length === 0}
          <li>none</li>
        {:else}
          {#each snapshot.key_artifacts ?? [] as artifactId}
            <li>
              <RefLink refValue={`artifact:${artifactId}`} />
            </li>
          {/each}
        {/if}
      </ul>
    </div>

    <div class="mt-3">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        open commitments
      </p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
        {#if (snapshot.open_commitments ?? []).length === 0}
          <li>none</li>
        {:else}
          {#each snapshot.open_commitments ?? [] as commitmentId}
            <li id={`commitment-${commitmentId}`}>{commitmentId}</li>
          {/each}
        {/if}
      </ul>
    </div>

    <div class="mt-3">
      <ProvenanceBadge provenance={snapshot.provenance ?? { sources: [] }} />
    </div>

    <div class="mt-3">
      <UnknownObjectPanel
        objectData={snapshot}
        title="Raw Thread Snapshot JSON"
      />
    </div>

    {#if editOpen && editDraft}
      <form
        class="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3"
        on:submit|preventDefault={saveEdit}
      >
        {#if editError}
          <p
            class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800"
          >
            {editError}
          </p>
        {/if}

        <div class="grid gap-3 md:grid-cols-2">
          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Title
            <input
              bind:value={editDraft.title}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              required
              type="text"
            />
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Type
            <select
              bind:value={editDraft.type}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="case">case</option>
              <option value="process">process</option>
              <option value="relationship">relationship</option>
              <option value="initiative">initiative</option>
              <option value="incident">incident</option>
              <option value="other">other</option>
            </select>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Status
            <select
              bind:value={editDraft.status}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="closed">closed</option>
            </select>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Priority
            <select
              bind:value={editDraft.priority}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="p0">p0</option>
              <option value="p1">p1</option>
              <option value="p2">p2</option>
              <option value="p3">p3</option>
            </select>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Cadence
            <select
              bind:value={editDraft.cadence}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="reactive">reactive</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Next check-in (ISO timestamp)
            <input
              bind:value={editDraft.next_check_in_at}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="2026-03-10T00:00:00.000Z"
              type="text"
            />
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600 md:col-span-2"
          >
            Tags (comma/newline separated)
            <textarea
              bind:value={editDraft.tagsInput}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows="2"
            ></textarea>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600 md:col-span-2"
          >
            Current summary
            <textarea
              bind:value={editDraft.current_summary}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows="3"
            ></textarea>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600 md:col-span-2"
          >
            Next actions (comma/newline separated)
            <textarea
              bind:value={editDraft.nextActionsInput}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows="3"
            ></textarea>
          </label>

          <label
            class="text-xs font-semibold uppercase tracking-wide text-slate-600 md:col-span-2"
          >
            Key artifacts (comma/newline separated IDs)
            <textarea
              bind:value={editDraft.keyArtifactsInput}
              class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows="3"
            ></textarea>
          </label>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savingEdit}
            type="submit"
          >
            {savingEdit ? "Saving..." : "Save snapshot changes"}
          </button>
          <button
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            on:click={cancelEdit}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    {/if}
  </section>
{/if}

<section class="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
    Post Message
  </h2>

  {#if postMessageError}
    <p
      class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
    >
      {postMessageError}
    </p>
  {/if}

  <label
    class="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-600"
    for="message-text"
  >
    Message
  </label>
  <textarea
    bind:value={messageText}
    class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    id="message-text"
    rows="3"
  ></textarea>

  <label
    class="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-600"
    for="reply-target"
  >
    Reply to event (optional)
  </label>
  <select
    bind:value={replyToEventId}
    class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    id="reply-target"
  >
    <option value="">No reply target</option>
    {#each timelineView as event}
      <option value={event.id}>{event.id} — {event.summary}</option>
    {/each}
  </select>

  <div class="mt-3 flex flex-wrap items-center gap-2">
    <button
      class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={!canPost}
      on:click={postMessage}
      type="button"
    >
      {postingMessage ? "Posting..." : "Post message"}
    </button>
    {#if replyToEventId}
      <p class="text-xs text-slate-600">
        Reply target: <span class="font-mono">{replyToEventId}</span>
      </p>
      <button
        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
        on:click={clearReplyTarget}
        type="button"
      >
        Clear
      </button>
    {/if}
  </div>
</section>

<section class="mt-6 space-y-3">
  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
    Timeline
  </h2>

  {#if timelineLoading}
    <p class="rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
      Loading timeline...
    </p>
  {:else if timelineError}
    <p
      class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
    >
      {timelineError}
    </p>
  {:else if timelineView.length === 0}
    <p class="rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
      No timeline events for this thread yet.
    </p>
  {:else}
    {#each timelineView as event}
      <article
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        id={`event-${event.id}`}
      >
        <p class="text-sm font-semibold text-slate-900">{event.summary}</p>
        <p class="mt-1 text-xs text-slate-600">
          type: {event.typeLabel}
          {#if !event.isKnownType}
            <span class="ml-1 font-mono text-slate-500"
              >({event.rawType || "unknown"})</span
            >
          {/if}
        </p>
        <p class="mt-1 text-xs text-slate-600">
          timestamp: {event.ts || "unknown"}
        </p>
        <p class="mt-1 text-xs text-slate-600">
          actor: {actorName(event.actor_id)}
        </p>

        {#if event.changedFields.length > 0}
          <div class="mt-2">
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              changed fields
            </p>
            <div class="mt-1 flex flex-wrap gap-2 text-xs">
              {#each event.changedFields as field}
                <span class="rounded bg-slate-100 px-2 py-1">{field}</span>
              {/each}
            </div>
          </div>
        {/if}

        <div class="mt-3 flex flex-wrap gap-2 text-xs">
          {#each event.refs as refValue}
            <span class="rounded bg-slate-100 px-2 py-1">
              <RefLink {refValue} {threadId} />
            </span>
          {/each}
        </div>

        <div class="mt-3">
          <ProvenanceBadge provenance={event.provenance ?? { sources: [] }} />
        </div>

        {#if !event.isKnownType}
          <div class="mt-2">
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Unknown event details
            </p>
            <pre
              class="mt-1 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700">{JSON.stringify(
                event.payload ?? {},
                null,
                2,
              )}</pre>
            <pre
              class="mt-1 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700">{JSON.stringify(
                event.refs ?? [],
                null,
                2,
              )}</pre>
          </div>
        {/if}

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            on:click={() => setReplyTarget(event.id)}
            type="button"
          >
            Reply
          </button>
        </div>

        <div class="mt-3">
          <UnknownObjectPanel objectData={event} title="Raw Event JSON" />
        </div>
      </article>
    {/each}
  {/if}
</section>
