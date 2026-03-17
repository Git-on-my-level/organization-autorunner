import { get, writable } from "svelte/store";

export const currentWorkspaceSlug = writable("");
export const devActorMode = writable(false);

export function setCurrentWorkspaceSlug(workspaceSlug) {
  const normalized = String(workspaceSlug ?? "").trim();
  currentWorkspaceSlug.set(normalized);
  return normalized;
}

export function getCurrentWorkspaceSlug() {
  return get(currentWorkspaceSlug);
}

export function setDevActorMode(enabled) {
  devActorMode.set(Boolean(enabled));
}

export function getDevActorMode() {
  return get(devActorMode);
}

export const currentProjectSlug = currentWorkspaceSlug;
export const setCurrentProjectSlug = setCurrentWorkspaceSlug;
export const getCurrentProjectSlug = getCurrentWorkspaceSlug;
