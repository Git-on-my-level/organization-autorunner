<script>
  import { onMount } from "svelte";

  import {
    authenticatedAgent,
    getAuthenticatedActorId,
  } from "$lib/authSession";
  import {
    actorRegistry,
    getSelectedActorId,
    lookupActorDisplayName,
    principalRegistry,
    selectedActorId,
  } from "$lib/actorSession";
  import { coreClient } from "$lib/coreClient";
  import { devActorMode } from "$lib/workspaceContext";
  import { kindColor, kindLabel } from "$lib/artifactKinds";
  import { formatTimestamp } from "$lib/formatDate";

  let artifacts = $state([]);
  let loading = $state(true);
  let error = $state("");
  let purgeConfirmId = $state("");
  let busyArtifactId = $state("");
  let purgeAllConfirm = $state(false);
  let purgeAllBusy = $state(false);

  let isHumanPrincipal = $derived.by(() => {
    if ($authenticatedAgent?.principal_kind === "human") {
      return true;
    }
    if (!$devActorMode) {
      return false;
    }
    const id = String($selectedActorId ?? "").trim();
    if (!id) {
      return false;
    }
    const actor = $actorRegistry.find((a) => a.id === id);
    return (
      Array.isArray(actor?.tags) &&
      actor.tags.some((t) => String(t).toLowerCase() === "human")
    );
  });
  let actorName = $derived((id) =>
    lookupActorDisplayName(id, $actorRegistry, $principalRegistry),
  );

  async function loadTombstonedArtifacts() {
    loading = true;
    error = "";
    try {
      artifacts =
        (await coreClient.listArtifacts({ tombstoned_only: "true" }))
          .artifacts ?? [];
    } catch (e) {
      error = `Failed to load trash: ${e instanceof Error ? e.message : String(e)}`;
      artifacts = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadTombstonedArtifacts();
  });

  function rowHeading(artifact) {
    const summary = String(artifact?.summary ?? "").trim();
    if (summary) return summary;
    return `${kindLabel(artifact?.kind)} artifact`;
  }

  function tombstoneReason(artifact) {
    const r = String(artifact?.tombstone_reason ?? "").trim();
    return r || "—";
  }

  async function restoreArtifact(artifactId) {
    const id = String(artifactId ?? "").trim();
    if (!id || busyArtifactId) return;
    busyArtifactId = id;
    error = "";
    try {
      await coreClient.restoreArtifact(id, {});
      purgeConfirmId = "";
      await loadTombstonedArtifacts();
    } catch (e) {
      error = `Restore failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busyArtifactId = "";
    }
  }

  async function confirmPurge(artifactId) {
    const id = String(artifactId ?? "").trim();
    if (!id || busyArtifactId) return;
    busyArtifactId = id;
    error = "";
    try {
      const body = {};
      if (!getAuthenticatedActorId()) {
        body.actor_id = getSelectedActorId();
      }
      await coreClient.purgeArtifact(id, body);
      purgeConfirmId = "";
      await loadTombstonedArtifacts();
    } catch (e) {
      error = `Purge failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busyArtifactId = "";
    }
  }

  function cancelPurge() {
    purgeConfirmId = "";
  }

  async function purgeAll() {
    if (purgeAllBusy || artifacts.length === 0) return;
    purgeAllBusy = true;
    error = "";
    let failed = 0;
    const ids = artifacts.map((a) => a.id);
    for (const id of ids) {
      try {
        const body = {};
        if (!getAuthenticatedActorId()) {
          body.actor_id = getSelectedActorId();
        }
        await coreClient.purgeArtifact(id, body);
      } catch {
        failed++;
      }
    }
    purgeAllConfirm = false;
    purgeAllBusy = false;
    if (failed > 0) {
      error = `Purge completed with ${failed} failure${failed > 1 ? "s" : ""}`;
    }
    await loadTombstonedArtifacts();
  }
</script>

<div class="mb-4 flex items-start justify-between gap-4">
  <div>
    <h1 class="text-lg font-semibold text-[var(--ui-text)]">Trash</h1>
    <p class="mt-0.5 text-[12px] text-[var(--ui-text-muted)]">
      Tombstoned artifacts. Restore returns them to the default artifact list;
      purge permanently removes them (human principals only).
    </p>
  </div>
  {#if isHumanPrincipal && !loading && artifacts.length > 0}
    <div class="shrink-0">
      {#if !purgeAllConfirm}
        <button
          class="cursor-pointer rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={Boolean(busyArtifactId) || purgeAllBusy}
          onclick={() => {
            purgeAllConfirm = true;
          }}
          type="button"
        >
          Purge all ({artifacts.length})
        </button>
      {:else}
        <div
          class="rounded-md border border-red-500/35 bg-red-500/5 p-2.5 text-[12px]"
        >
          <p class="font-medium text-red-300">
            Permanently delete all {artifacts.length} artifact{artifacts.length ===
            1
              ? ""
              : "s"}?
          </p>
          <div class="mt-2 flex justify-end gap-1.5">
            <button
              class="cursor-pointer rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ui-text-muted)] hover:bg-[var(--ui-border-subtle)]"
              onclick={() => {
                purgeAllConfirm = false;
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              class="cursor-pointer rounded-md bg-red-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={purgeAllBusy}
              onclick={() => {
                void purgeAll();
              }}
              type="button"
            >
              {purgeAllBusy ? "Purging..." : "Confirm purge all"}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if error}
  <div class="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
    {error}
  </div>
{/if}

{#if loading}
  <div
    class="mt-12 flex items-center justify-center gap-2 text-[13px] text-[var(--ui-text-muted)]"
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
    Loading tombstoned artifacts...
  </div>
{:else if artifacts.length === 0 && !error}
  <div class="mt-8 text-center">
    <p class="text-[13px] font-medium text-[var(--ui-text-muted)]">
      No tombstoned artifacts
    </p>
  </div>
{/if}

{#if !loading && artifacts.length > 0}
  <div
    class="space-y-px rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] overflow-hidden"
  >
    {#each artifacts as artifact, i}
      <div
        class="px-4 py-3 {i > 0 ? 'border-t border-[var(--ui-border)]' : ''}"
      >
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold {kindColor(
                  artifact.kind,
                )}"
              >
                {kindLabel(artifact.kind)}
              </span>
              <span class="text-[13px] font-medium text-[var(--ui-text)]">
                {rowHeading(artifact)}
              </span>
            </div>

            <div
              class="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-[var(--ui-text-muted)] sm:grid-cols-2 xl:grid-cols-3"
            >
              <div>
                <span class="text-[var(--ui-text-subtle)]">Created</span>
                {formatTimestamp(artifact.created_at) || "—"}
                <span class="text-[var(--ui-text-subtle)]"> · </span>
                {actorName(artifact.created_by)}
              </div>
              <div>
                <span class="text-[var(--ui-text-subtle)]">Tombstoned</span>
                {formatTimestamp(artifact.tombstoned_at) || "—"}
                <span class="text-[var(--ui-text-subtle)]"> · </span>
                {actorName(artifact.tombstoned_by)}
              </div>
              <div class="sm:col-span-2 xl:col-span-1">
                <span class="text-[var(--ui-text-subtle)]">Reason</span>
                {tombstoneReason(artifact)}
              </div>
            </div>
          </div>

          <div class="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
            <div class="flex flex-wrap justify-end gap-1.5">
              <button
                class="cursor-pointer rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-border)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busyArtifactId === artifact.id}
                onclick={() => restoreArtifact(artifact.id)}
                type="button"
              >
                Restore
              </button>
              {#if isHumanPrincipal}
                {#if purgeConfirmId !== artifact.id}
                  <button
                    class="cursor-pointer rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={Boolean(busyArtifactId)}
                    onclick={() => {
                      purgeConfirmId = artifact.id;
                    }}
                    type="button"
                  >
                    Purge
                  </button>
                {/if}
              {/if}
            </div>

            {#if isHumanPrincipal && purgeConfirmId === artifact.id}
              <div
                class="rounded-md border border-red-500/35 bg-red-500/5 p-2.5 text-[12px]"
                role="region"
                aria-label="Confirm purge"
              >
                <p class="font-medium text-red-300">
                  Permanently delete this artifact? This cannot be undone.
                </p>
                <div class="mt-2 flex flex-wrap justify-end gap-1.5">
                  <button
                    class="cursor-pointer rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ui-text-muted)] hover:bg-[var(--ui-border-subtle)]"
                    onclick={cancelPurge}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    class="cursor-pointer rounded-md bg-red-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busyArtifactId === artifact.id}
                    onclick={() => confirmPurge(artifact.id)}
                    type="button"
                  >
                    Confirm purge
                  </button>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
