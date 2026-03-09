import { get, writable } from "svelte/store";

export const currentProjectSlug = writable("");

export function setCurrentProjectSlug(projectSlug) {
  const normalized = String(projectSlug ?? "").trim();
  currentProjectSlug.set(normalized);
  return normalized;
}

export function getCurrentProjectSlug() {
  return get(currentProjectSlug);
}
