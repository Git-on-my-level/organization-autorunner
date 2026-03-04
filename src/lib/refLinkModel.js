import { parseRef, renderRef } from "./typedRefs.js";

function asPathSegment(value) {
  return encodeURIComponent(String(value));
}

function humanizeId(value) {
  return String(value)
    .replace(/^(artifact|thread|event|snapshot|inbox)-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 40);
}

function shortLabel(prefix, value) {
  const prefixLabels = {
    artifact: "artifact",
    thread: "thread",
    snapshot: "snapshot",
    event: "event",
    inbox: "inbox",
  };
  const tag = prefixLabels[prefix] ?? prefix;
  const name = humanizeId(value);
  return name || `${tag}:${value}`;
}

export function resolveRefLink(refValue, options = {}) {
  const parsed = parseRef(refValue);
  const raw = renderRef(parsed);
  const prefix = parsed.prefix;
  const value = parsed.value;
  const threadId = options.threadId;
  const snapshotIsThread = Boolean(options.snapshotIsThread);

  if (!prefix) {
    return { raw, prefix, value, kind: "raw", label: raw, href: "", isExternal: false, isLink: false };
  }

  if (prefix === "artifact") {
    return { raw, prefix, value, kind: "artifact", label: shortLabel("artifact", value), href: `/artifacts/${asPathSegment(value)}`, isExternal: false, isLink: true };
  }

  if (prefix === "thread") {
    return { raw, prefix, value, kind: "thread", label: shortLabel("thread", value), href: `/threads/${asPathSegment(value)}`, isExternal: false, isLink: true };
  }

  if (prefix === "snapshot") {
    const href = snapshotIsThread
      ? `/threads/${asPathSegment(value)}`
      : `/snapshots/${asPathSegment(value)}`;
    return { raw, prefix, value, kind: "snapshot", label: shortLabel("snapshot", value), href, isExternal: false, isLink: true };
  }

  if (prefix === "event") {
    if (!threadId) {
      return { raw, prefix, value, kind: "event", label: shortLabel("event", value), href: "", isExternal: false, isLink: false };
    }
    return { raw, prefix, value, kind: "event", label: shortLabel("event", value), href: `/threads/${asPathSegment(threadId)}#event-${asPathSegment(value)}`, isExternal: false, isLink: true };
  }

  if (prefix === "url") {
    let displayUrl = value;
    try { displayUrl = new URL(value).hostname; } catch {}
    return { raw, prefix, value, kind: "url", label: displayUrl, href: value, isExternal: true, isLink: true };
  }

  if (prefix === "inbox") {
    return { raw, prefix, value, kind: "inbox", label: shortLabel("inbox", value), href: `/inbox#inbox-${asPathSegment(value)}`, isExternal: false, isLink: true };
  }

  return { raw, prefix, value, kind: "unknown", label: raw, href: "", isExternal: false, isLink: false };
}
