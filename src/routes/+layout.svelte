<script>
  import { onMount } from "svelte";

  import "../app.css";
  import {
    actorRegistry,
    actorSessionReady,
    buildActorCreatePayload,
    chooseActor,
    initializeActorSession,
    lookupActorDisplayName,
    selectedActorId,
    shouldShowActorGate,
  } from "$lib/actorSession";
  import { coreClient } from "$lib/coreClient";
  import { navigationItems } from "$lib/navigation";

  let actorError = "";
  let loadingActors = false;
  let creatingActor = false;
  let newActorName = "";

  $: gateVisible = shouldShowActorGate($actorSessionReady, $selectedActorId);
  $: selectedActorName = lookupActorDisplayName(
    $selectedActorId,
    $actorRegistry,
  );

  onMount(async () => {
    initializeActorSession();
    await refreshActors();
  });

  async function refreshActors() {
    loadingActors = true;
    actorError = "";

    try {
      const response = await coreClient.listActors();
      actorRegistry.set(response.actors ?? []);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      actorError = `Failed to load actors: ${reason}`;
      actorRegistry.set([]);
    } finally {
      loadingActors = false;
    }
  }

  function selectActor(actorId) {
    chooseActor(actorId);
  }

  function buildActorId(displayName) {
    const base = displayName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `actor-${base || "user"}-${suffix}`;
  }

  async function createActor() {
    if (!newActorName.trim()) {
      actorError = "Display name is required.";
      return;
    }

    creatingActor = true;
    actorError = "";

    try {
      const payload = buildActorCreatePayload({
        id: buildActorId(newActorName),
        displayName: newActorName.trim(),
        tags: ["human"],
      });

      const response = await coreClient.createActor(payload);
      const createdActor = response.actor;
      actorRegistry.set([...$actorRegistry, createdActor]);
      chooseActor(createdActor.id);
      newActorName = "";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      actorError = `Failed to create actor: ${reason}`;
    } finally {
      creatingActor = false;
    }
  }
</script>

<div class="min-h-screen bg-slate-50 text-slate-900">
  {#if !$actorSessionReady}
    <main class="mx-auto max-w-3xl p-8">
      <p class="rounded-lg bg-white p-4 text-sm text-slate-700 shadow-sm">
        Loading actor session...
      </p>
    </main>
  {:else if gateVisible}
    <main class="mx-auto max-w-3xl p-8">
      <section
        class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 class="text-2xl font-semibold">Select Actor Identity</h1>
        <p class="mt-2 text-sm text-slate-700">
          Choose an existing actor or register a new one before continuing.
        </p>

        {#if actorError}
          <p
            class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {actorError}
          </p>
        {/if}

        <div class="mt-6">
          <div class="mb-3 flex items-center justify-between">
            <h2
              class="text-sm font-semibold uppercase tracking-wide text-slate-500"
            >
              Existing actors
            </h2>
            <button
              class="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              on:click={refreshActors}
              type="button"
            >
              Refresh
            </button>
          </div>

          {#if loadingActors}
            <p class="text-sm text-slate-600">Loading actor registry...</p>
          {:else if $actorRegistry.length === 0}
            <p class="text-sm text-slate-600">No actors found yet.</p>
          {:else}
            <ul class="space-y-2">
              {#each $actorRegistry as actor}
                <li
                  class="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p class="text-sm font-medium text-slate-900">
                      {actor.display_name}
                    </p>
                    <p class="text-xs text-slate-500">{actor.id}</p>
                  </div>
                  <button
                    class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                    on:click={() => selectActor(actor.id)}
                    type="button"
                  >
                    Use actor
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <form
          class="mt-6 border-t border-slate-200 pt-6"
          on:submit|preventDefault={createActor}
        >
          <h2
            class="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            Register new actor
          </h2>
          <label
            class="mt-3 block text-sm text-slate-700"
            for="actor-display-name"
          >
            Display name
          </label>
          <input
            bind:value={newActorName}
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            id="actor-display-name"
            name="actor-display-name"
            placeholder="Jane Doe"
            type="text"
          />
          <button
            class="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={creatingActor}
            type="submit"
          >
            {creatingActor ? "Creating..." : "Create and continue"}
          </button>
        </form>
      </section>
    </main>
  {:else}
    <div class="mx-auto flex min-h-screen max-w-6xl">
      <aside class="w-64 border-r border-slate-200 bg-white p-6">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Navigation
        </p>
        <p class="mt-2 text-xs text-slate-600">
          Signed in as {selectedActorName}
        </p>
        <nav class="mt-4" aria-label="Primary">
          <ul class="space-y-2">
            {#each navigationItems as item}
              <li>
                <a
                  class="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      </aside>

      <main class="flex-1 p-8">
        <slot />
      </main>
    </div>
  {/if}
</div>
