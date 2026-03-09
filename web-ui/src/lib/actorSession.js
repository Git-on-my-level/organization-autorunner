import { get, writable } from "svelte/store";

import { getCurrentProjectSlug, currentProjectSlug } from "./projectContext.js";
import {
  DEFAULT_PROJECT_SLUG,
  buildProjectStorageKey,
} from "./projectPaths.js";

export const ACTOR_STORAGE_KEY = "oar_ui_actor_id";

export const actorSessionReady = writable(false);
export const selectedActorId = writable("");
export const actorRegistry = writable([]);

const actorStateByProject = new Map();

function createEmptyActorState() {
  return {
    ready: false,
    selectedActorId: "",
    actorRegistry: [],
  };
}

function ensureActorState(projectSlug = getCurrentProjectSlug()) {
  const slug = String(projectSlug ?? "").trim();
  if (!actorStateByProject.has(slug)) {
    actorStateByProject.set(slug, createEmptyActorState());
  }

  return actorStateByProject.get(slug);
}

function syncCurrentProjectStores(projectSlug = getCurrentProjectSlug()) {
  const state = ensureActorState(projectSlug);
  actorSessionReady.set(state.ready);
  selectedActorId.set(state.selectedActorId);
  actorRegistry.set([...state.actorRegistry]);
  return state;
}

currentProjectSlug.subscribe((projectSlug) => {
  syncCurrentProjectStores(projectSlug);
});

export function actorStorageKey(projectSlug = getCurrentProjectSlug()) {
  return buildProjectStorageKey(ACTOR_STORAGE_KEY, projectSlug);
}

export function loadStoredActorId(
  storage = localStorage,
  projectSlug = getCurrentProjectSlug(),
) {
  const scopedActorId = storage.getItem(actorStorageKey(projectSlug));
  if (scopedActorId) {
    return scopedActorId;
  }

  const normalizedProjectSlug = String(projectSlug ?? "").trim();
  if (
    !normalizedProjectSlug ||
    normalizedProjectSlug === DEFAULT_PROJECT_SLUG
  ) {
    return storage.getItem(ACTOR_STORAGE_KEY) ?? "";
  }

  return "";
}

export function saveSelectedActorId(
  actorId,
  storage = localStorage,
  projectSlug = getCurrentProjectSlug(),
) {
  const storageKey = actorStorageKey(projectSlug);
  if (!actorId) {
    storage.removeItem(storageKey);
    storage.removeItem(ACTOR_STORAGE_KEY);
    return "";
  }

  storage.setItem(storageKey, actorId);
  return actorId;
}

export function initializeActorSession(
  storage = localStorage,
  projectSlug = getCurrentProjectSlug(),
) {
  const state = ensureActorState(projectSlug);
  state.selectedActorId = loadStoredActorId(storage, projectSlug);
  state.ready = true;
  syncCurrentProjectStores(projectSlug);
  return state.selectedActorId;
}

export function chooseActor(
  actorId,
  storage = localStorage,
  projectSlug = getCurrentProjectSlug(),
) {
  const state = ensureActorState(projectSlug);
  state.selectedActorId = saveSelectedActorId(actorId, storage, projectSlug);
  syncCurrentProjectStores(projectSlug);
  return state.selectedActorId;
}

export function clearSelectedActor(
  storage = localStorage,
  projectSlug = getCurrentProjectSlug(),
) {
  return chooseActor("", storage, projectSlug);
}

export function replaceActorRegistry(
  actors,
  projectSlug = getCurrentProjectSlug(),
) {
  const state = ensureActorState(projectSlug);
  state.actorRegistry = [...(actors ?? [])];
  syncCurrentProjectStores(projectSlug);
  return state.actorRegistry;
}

export function shouldShowActorGate(isReady, actorId) {
  return Boolean(isReady) && !actorId;
}

export function buildActorCreatePayload({
  id,
  displayName,
  tags = [],
  createdAt = new Date().toISOString(),
}) {
  return {
    actor: {
      id,
      display_name: displayName,
      tags,
      created_at: createdAt,
    },
  };
}

export function buildActorNameMap(actors) {
  return new Map(
    (actors ?? []).map((actor) => [
      actor.id,
      actor.display_name || actor.id || "Unknown actor",
    ]),
  );
}

export function lookupActorDisplayName(actorId, actors) {
  if (!actorId) {
    return "Unknown actor";
  }

  const map = buildActorNameMap(actors);
  return map.get(actorId) ?? actorId;
}

export function getSelectedActorId(projectSlug = getCurrentProjectSlug()) {
  if (projectSlug && projectSlug !== getCurrentProjectSlug()) {
    return ensureActorState(projectSlug).selectedActorId;
  }

  return get(selectedActorId);
}
