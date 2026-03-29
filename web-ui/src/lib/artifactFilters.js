import { KIND_LABELS } from "$lib/artifactKinds";
import {
  buildSearchString,
  readEnumSearchParam,
  readStringSearchParam,
} from "$lib/urlState";

export const ARTIFACT_KIND_VALUES = Object.freeze(Object.keys(KIND_LABELS));

export const DEFAULT_ARTIFACT_LIST_FILTERS = Object.freeze({
  kind: "",
  thread_id: "",
  created_after: "",
  created_before: "",
});

function normalizeDateTimeLocalValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  return Number.isNaN(Date.parse(raw)) ? "" : raw;
}

function toIsoOrEmpty(value) {
  const normalized = normalizeDateTimeLocalValue(value);
  if (!normalized) {
    return "";
  }

  return new Date(normalized).toISOString();
}

export function parseArtifactListSearchParams(searchParams) {
  return {
    kind: readEnumSearchParam(searchParams, "kind", ARTIFACT_KIND_VALUES, ""),
    thread_id: readStringSearchParam(searchParams, "thread_id"),
    created_after: normalizeDateTimeLocalValue(
      readStringSearchParam(searchParams, "created_after"),
    ),
    created_before: normalizeDateTimeLocalValue(
      readStringSearchParam(searchParams, "created_before"),
    ),
  };
}

export function buildArtifactListSearchString(filters = {}) {
  return buildSearchString({
    kind: filters.kind,
    thread_id: filters.thread_id,
    created_after: normalizeDateTimeLocalValue(filters.created_after),
    created_before: normalizeDateTimeLocalValue(filters.created_before),
  });
}

export function buildArtifactListQuery(filters = {}) {
  return {
    kind: String(filters.kind ?? "").trim(),
    thread_id: String(filters.thread_id ?? "").trim(),
    created_after: toIsoOrEmpty(filters.created_after),
    created_before: toIsoOrEmpty(filters.created_before),
  };
}

export function hasArtifactListFilters(filters = {}) {
  return Boolean(
    String(filters.kind ?? "").trim() ||
    String(filters.thread_id ?? "").trim() ||
    String(filters.created_after ?? "").trim() ||
    String(filters.created_before ?? "").trim(),
  );
}
