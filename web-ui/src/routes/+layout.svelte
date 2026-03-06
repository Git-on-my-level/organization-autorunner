<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";

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

  let { children } = $props();

  let actorError = $state("");
  let loadingActors = $state(false);
  let creatingActor = $state(false);
  let newActorName = $state("");

  let gateVisible = $derived(
    shouldShowActorGate($actorSessionReady, $selectedActorId),
  );
  let selectedActorName = $derived(
    lookupActorDisplayName($selectedActorId, $actorRegistry),
  );
  let initials = $derived(
    selectedActorName
      ? selectedActorName
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "?",
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

  function switchIdentity() {
    chooseActor("");
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

  function isActive(href) {
    return (
      $page.url.pathname === href || $page.url.pathname.startsWith(href + "/")
    );
  }
</script>

<div class="flex min-h-screen">
  {#if !$actorSessionReady}
    <main class="flex flex-1 items-center justify-center bg-gray-50">
      <div class="flex items-center gap-2 text-sm text-gray-400">
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
        Loading...
      </div>
    </main>
  {:else if gateVisible}
    <main class="flex flex-1 items-center justify-center bg-gray-50 p-8">
      <section class="w-full max-w-sm">
        <div class="mb-8 text-center">
          <div
            class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600"
          >
            <svg
              class="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 class="text-xl font-semibold text-gray-900">Welcome to OAR</h1>
          <p class="mt-1 text-sm text-gray-500">
            Select an identity to get started.
          </p>
        </div>

        {#if actorError}
          <div class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {actorError}
          </div>
        {/if}

        <div class="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div class="p-1.5">
            {#if loadingActors}
              <div class="px-3 py-6 text-center text-sm text-gray-400">
                Loading actors...
              </div>
            {:else if $actorRegistry.length === 0}
              <div class="px-3 py-6 text-center text-sm text-gray-400">
                No actors yet. Create one below.
              </div>
            {:else}
              {#each $actorRegistry as actor}
                <button
                  class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                  onclick={() => selectActor(actor.id)}
                  type="button"
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-xs font-semibold text-white"
                  >
                    {(actor.display_name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span class="text-sm font-medium text-gray-900"
                    >{actor.display_name}</span
                  >
                </button>
              {/each}
            {/if}
          </div>

          <form
            class="border-t border-gray-100 p-4"
            onsubmit={(event) => {
              event.preventDefault();
              createActor();
            }}
          >
            <label
              class="block text-xs font-medium text-gray-500"
              for="actor-display-name"
            >
              Create new actor
            </label>
            <div class="mt-2 flex gap-2">
              <input
                bind:value={newActorName}
                class="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition-colors focus:bg-white"
                id="actor-display-name"
                name="actor-display-name"
                placeholder="Enter a name..."
                type="text"
              />
              <button
                class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
                disabled={creatingActor}
                type="submit"
              >
                {creatingActor ? "..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  {:else}
    <aside
      class="flex w-[220px] shrink-0 flex-col border-r border-gray-200/80 bg-white"
    >
      <div class="flex items-center gap-2.5 px-5 py-4">
        <div
          class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600"
        >
          <svg
            class="h-3.5 w-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <span class="text-[15px] font-semibold text-gray-900">OAR</span>
      </div>

      <nav class="flex-1 px-3 py-1" aria-label="Primary">
        <ul class="space-y-0.5">
          {#each navigationItems as item}
            {@const active = isActive(item.href)}
            <li>
              <a
                class={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                href={item.href}
              >
                {#if item.icon === "inbox"}
                  <svg
                    class="h-4 w-4 {active
                      ? 'text-indigo-500'
                      : 'text-gray-400'}"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.75"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                {:else if item.icon === "threads"}
                  <svg
                    class="h-4 w-4 {active
                      ? 'text-indigo-500'
                      : 'text-gray-400'}"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.75"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                {:else if item.icon === "artifacts"}
                  <svg
                    class="h-4 w-4 {active
                      ? 'text-indigo-500'
                      : 'text-gray-400'}"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.75"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                {/if}
                {item.label}
              </a>
            </li>
          {/each}
        </ul>
      </nav>

      <div class="border-t border-gray-100 px-3 py-3">
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-gray-50"
          aria-label="Switch identity"
          onclick={switchIdentity}
          type="button"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-[11px] font-semibold text-white"
          >
            {initials}
          </span>
          <div class="min-w-0 flex-1 text-left">
            <p class="truncate text-[13px] font-medium text-gray-900">
              {selectedActorName}
            </p>
            <p class="text-[11px] text-gray-400">Switch identity</p>
          </div>
          <svg
            class="h-4 w-4 shrink-0 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
            />
          </svg>
        </button>
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto bg-gray-50/50 px-8 py-6">
      <div class="mx-auto max-w-3xl">
        {@render children?.()}
      </div>
    </main>
  {/if}
</div>
