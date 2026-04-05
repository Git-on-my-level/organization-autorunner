import { splitTypedRef } from "$lib/inboxUtils";

/**
 * Canonical backing-thread id for board card rows / create payloads.
 * Prefers `thread_id`, then legacy `parent_thread` (string or { thread_id | id }).
 */
export function resolveBoardCardThreadIdField(row) {
  const r = row && typeof row === "object" ? row : {};
  const direct = String(r.thread_id ?? "").trim();
  if (direct) return direct;
  const pt = r.parent_thread;
  if (typeof pt === "string") {
    const s = String(pt).trim();
    if (s) return s;
  } else if (pt && typeof pt === "object") {
    const id = String(pt.thread_id ?? pt.id ?? "").trim();
    if (id) return id;
  }
  return "";
}

function encodeRouteSegment(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

export function topicDetailPathFromRef(refValue) {
  const { prefix, id } = splitTypedRef(String(refValue ?? "").trim());
  if (prefix === "topic" && id) {
    return `/topics/${encodeRouteSegment(id)}`;
  }
  if (prefix === "thread" && id) {
    return `/threads/${encodeRouteSegment(id)}`;
  }
  return "";
}

export function topicDetailPathFromSubject({
  topicId,
  topicRef,
  subjectRef,
  relatedRefs,
  threadId,
} = {}) {
  const explicitTopicId = String(topicId ?? "").trim();
  if (explicitTopicId) {
    return `/topics/${encodeRouteSegment(explicitTopicId)}`;
  }

  const candidates = [
    topicRef,
    subjectRef,
    ...(Array.isArray(relatedRefs) ? relatedRefs : []),
  ];
  for (const candidate of candidates) {
    const path = topicDetailPathFromRef(candidate);
    if (path) {
      return path;
    }
  }

  const explicitThreadId = String(threadId ?? "").trim();
  if (explicitThreadId) {
    return `/threads/${encodeRouteSegment(explicitThreadId)}`;
  }

  return "";
}

/**
 * Path segment for `/topics/:segment` from a backing-thread inspect payload.
 * Prefers `thread.topic_ref` when it is a `topic:` ref; otherwise uses `thread.id`.
 */
export function topicRouteSegmentFromBackingThread(thread) {
  if (!thread || typeof thread !== "object") return "";
  const { prefix, id } = splitTypedRef(String(thread.topic_ref ?? "").trim());
  if (prefix === "topic" && id) return id;
  return String(thread.id ?? "").trim();
}

/**
 * Path segment for `/topics/:segment` from board workspace card row data.
 * Prefers canonical `topic_ref` / `topic:` related refs, then backing thread's topic ref,
 * then linked backing thread ids (API/thread fields).
 */
/**
 * Canonical `topic:<id>` ref for a board: prefer ordered `board.refs`, fall back to `primary_topic_ref`.
 */
export function boardPrimaryTopicRef(board) {
  const b = board && typeof board === "object" ? board : {};
  const refs = Array.isArray(b.refs) ? b.refs : [];
  for (const raw of refs) {
    const p = splitTypedRef(String(raw ?? "").trim());
    if (p.prefix === "topic" && p.id) {
      return `topic:${p.id}`;
    }
  }
  return String(b.primary_topic_ref ?? "").trim();
}

/** Whether the board is associated with the given topic id (refs scan, then legacy primary ref). */
export function boardOwnsTopicId(board, topicId) {
  const tid = String(topicId ?? "").trim();
  if (!tid) return false;
  const refs = Array.isArray(board?.refs) ? board.refs : [];
  for (const raw of refs) {
    const p = splitTypedRef(String(raw ?? "").trim());
    if (p.prefix === "topic" && p.id === tid) return true;
  }
  const legacy = splitTypedRef(String(board?.primary_topic_ref ?? "").trim());
  return legacy.prefix === "topic" && legacy.id === tid;
}

export function topicRouteSegmentFromBoardCardRow(membership, backingThread) {
  const m = membership && typeof membership === "object" ? membership : {};
  const fromMembership = splitTypedRef(String(m.topic_ref ?? "").trim());
  if (fromMembership.prefix === "topic" && fromMembership.id) {
    return fromMembership.id;
  }

  const refs = Array.isArray(m.related_refs) ? m.related_refs : [];
  for (const raw of refs) {
    const p = splitTypedRef(String(raw ?? "").trim());
    if (p.prefix === "topic" && p.id) return p.id;
  }

  const fromBacking = topicRouteSegmentFromBackingThread(backingThread);
  if (fromBacking) return fromBacking;

  return resolveBoardCardThreadIdField(m);
}

/**
 * Board header / context line: canonical topic id for linking to `/topics/...`.
 */
export function topicRouteSegmentFromBoardWorkspace(workspace) {
  const ws = workspace && typeof workspace === "object" ? workspace : {};
  const primary = String(ws.primary_topic?.id ?? "").trim();
  if (primary) return primary;

  const board = ws.board && typeof ws.board === "object" ? ws.board : {};
  const fromBoardRef = splitTypedRef(boardPrimaryTopicRef(board));
  if (fromBoardRef.prefix === "topic" && fromBoardRef.id)
    return fromBoardRef.id;

  const bt = ws.backing_thread;
  const fromThread = topicRouteSegmentFromBackingThread(bt);
  if (fromThread) return fromThread;

  return String(bt?.id ?? board.thread_id ?? "").trim();
}

/**
 * Inbox: prefer explicit `topic_id`, then `topic:` subject resolution.
 */
export function inboxTopicRouteSegment(item) {
  const row = item && typeof item === "object" ? item : {};
  const explicit = String(row.topic_id ?? "").trim();
  if (explicit) return explicit;

  const subject = String(row.subject_ref ?? "").trim();
  if (subject) {
    const p = splitTypedRef(subject);
    if (p.prefix === "topic" && p.id) return p.id;
  }
  return "";
}
