import { parseRef, renderRef } from "./typedRefs.js";
import { appPath, workspacePath } from "./workspacePaths.js";

function asPathSegment(value) {
  return encodeURIComponent(String(value));
}

function lookupLabelHint(raw, prefix, value, labelHints) {
  if (!labelHints || typeof labelHints !== "object") {
    return "";
  }

  const direct =
    labelHints[raw] ?? labelHints[`${prefix}:${value}`] ?? labelHints[value];
  return String(direct ?? "").trim();
}

function summarizeUrl(value) {
  try {
    const url = new URL(String(value));
    const path = String(url.pathname ?? "").replace(/\/+$/, "") || "/";
    const shownPath = path.length > 28 ? `${path.slice(0, 28)}...` : path;
    return `${url.hostname}${shownPath}`;
  } catch {
    return "External link";
  }
}

function shouldHumanizeByDefault(prefix) {
  return prefix === "document" || prefix === "document_revision";
}

function humanizedLabelForPrefix(prefix, value) {
  if (prefix === "artifact") return "Artifact";
  if (prefix === "thread") return "Thread";
  if (prefix === "snapshot") return "Snapshot";
  if (prefix === "event") return "Event";
  if (prefix === "document") return `Document ${value}`.trim();
  if (prefix === "document_revision")
    return `Document revision ${value}`.trim();
  if (prefix === "url") return summarizeUrl(value);
  if (prefix === "inbox") return "Inbox item";
  if (prefix === "board") return `Board ${value}`.trim();
  return "";
}

function resolveRefLabels(raw, prefix, value, options = {}) {
  const humanize = Boolean(options.humanize) || shouldHumanizeByDefault(prefix);
  const labelHint = lookupLabelHint(raw, prefix, value, options.labelHints);

  if (!humanize) {
    return {
      label: raw,
      primaryLabel: raw,
      secondaryLabel: "",
    };
  }

  const primaryLabel =
    labelHint || humanizedLabelForPrefix(prefix, value) || raw;
  const secondaryLabel = primaryLabel === raw ? "" : raw;
  return {
    label: primaryLabel,
    primaryLabel,
    secondaryLabel,
  };
}

function toWorkspaceHref(workspaceSlug, pathname) {
  return workspaceSlug
    ? workspacePath(workspaceSlug, pathname)
    : appPath(pathname);
}

export function resolveRefLink(refValue, options = {}) {
  const parsed = parseRef(refValue);
  const raw = renderRef(parsed);
  const prefix = parsed.prefix;
  const value = parsed.value;
  const workspaceSlug = options.workspaceSlug;
  const threadId = options.threadId;
  const snapshotIsThread = Boolean(options.snapshotIsThread);

  if (!prefix) {
    return {
      raw,
      prefix,
      value,
      kind: "raw",
      ...resolveRefLabels(raw, prefix, value, options),
      href: "",
      isExternal: false,
      isLink: false,
    };
  }

  const labels = resolveRefLabels(raw, prefix, value, options);

  if (prefix === "artifact") {
    return {
      raw,
      prefix,
      value,
      kind: "artifact",
      ...labels,
      href: toWorkspaceHref(
        workspaceSlug,
        `/artifacts/${asPathSegment(value)}`,
      ),
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "thread") {
    return {
      raw,
      prefix,
      value,
      kind: "thread",
      ...labels,
      href: toWorkspaceHref(workspaceSlug, `/threads/${asPathSegment(value)}`),
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "snapshot") {
    const href = snapshotIsThread
      ? toWorkspaceHref(workspaceSlug, `/threads/${asPathSegment(value)}`)
      : toWorkspaceHref(workspaceSlug, `/snapshots/${asPathSegment(value)}`);
    return {
      raw,
      prefix,
      value,
      kind: "snapshot",
      ...labels,
      href,
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "event") {
    if (!threadId) {
      return {
        raw,
        prefix,
        value,
        kind: "event",
        ...labels,
        href: "",
        isExternal: false,
        isLink: false,
      };
    }
    return {
      raw,
      prefix,
      value,
      kind: "event",
      ...labels,
      href: toWorkspaceHref(
        workspaceSlug,
        `/threads/${asPathSegment(threadId)}#event-${asPathSegment(value)}`,
      ),
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "url") {
    return {
      raw,
      prefix,
      value,
      kind: "url",
      ...labels,
      href: value,
      isExternal: true,
      isLink: true,
    };
  }

  if (prefix === "inbox") {
    return {
      raw,
      prefix,
      value,
      kind: "inbox",
      ...labels,
      href: toWorkspaceHref(
        workspaceSlug,
        `/inbox#inbox-${asPathSegment(value)}`,
      ),
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "document") {
    return {
      raw,
      prefix,
      value,
      kind: "document",
      ...labels,
      href: toWorkspaceHref(workspaceSlug, `/docs/${asPathSegment(value)}`),
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "document_revision") {
    return {
      raw,
      prefix,
      value,
      kind: "document_revision",
      ...labels,
      href: toWorkspaceHref(
        workspaceSlug,
        `/docs/revisions/${asPathSegment(value)}`,
      ),
      isExternal: false,
      isLink: true,
    };
  }

  if (prefix === "board") {
    return {
      raw,
      prefix,
      value,
      kind: "board",
      ...labels,
      href: toWorkspaceHref(workspaceSlug, `/boards/${asPathSegment(value)}`),
      isExternal: false,
      isLink: true,
    };
  }

  return {
    raw,
    prefix,
    value,
    kind: "unknown",
    label: raw,
    primaryLabel: raw,
    secondaryLabel: "",
    href: "",
    isExternal: false,
    isLink: false,
  };
}
