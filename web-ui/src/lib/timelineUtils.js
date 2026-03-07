import { resolveRefLink } from "./refLinkModel.js";

const EVENT_TYPE_LABELS = {
  message_posted: "Message posted",
  work_order_created: "Work order created",
  receipt_added: "Receipt added",
  review_completed: "Review completed",
  decision_needed: "Needs decision",
  decision_made: "Decision made",
  snapshot_updated: "Details updated",
  commitment_created: "Commitment created",
  commitment_status_changed: "Commitment status changed",
  exception_raised: "Exception raised",
  inbox_item_acknowledged: "Item acknowledged",
};

const KNOWN_EVENT_TYPES = new Set(Object.keys(EVENT_TYPE_LABELS));

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function snapshotLabel(snapshot, id) {
  const record = asObject(snapshot);
  const title = String(record.title ?? record.current_summary ?? "").trim();
  if (title) {
    return title;
  }
  const kind = String(record.kind ?? record.type ?? "Snapshot").trim();
  return `${kind} ${id}`.trim();
}

function artifactLabel(artifact, id) {
  const record = asObject(artifact);
  const summary = String(record.summary ?? record.title ?? "").trim();
  if (summary) {
    return summary;
  }
  const kind = String(record.kind ?? "Artifact").trim();
  return `${kind} ${id}`.trim();
}

export function buildTimelineRefLabelHints(snapshots = {}, artifacts = {}) {
  const hints = {};

  for (const [snapshotId, snapshot] of Object.entries(asObject(snapshots))) {
    const id = String(snapshotId ?? "").trim();
    if (!id) continue;
    hints[`snapshot:${id}`] = snapshotLabel(snapshot, id);
  }

  for (const [artifactId, artifact] of Object.entries(asObject(artifacts))) {
    const id = String(artifactId ?? "").trim();
    if (!id) continue;
    hints[`artifact:${id}`] = artifactLabel(artifact, id);
  }

  return hints;
}

export function toTimelineViewEvent(event, options = {}) {
  const type = String(event?.type ?? "");
  const isKnownType = KNOWN_EVENT_TYPES.has(type);
  const refs = Array.isArray(event?.refs) ? event.refs : [];
  const threadId = options.threadId ?? event?.thread_id ?? "";
  const snapshots = asObject(options.snapshots);
  const labelHints =
    options.labelHints ??
    buildTimelineRefLabelHints(snapshots, options.artifacts);

  return {
    ...event,
    refs,
    isKnownType,
    typeLabel: EVENT_TYPE_LABELS[type] ?? "Unknown event type",
    rawType: type,
    changedFields:
      type === "snapshot_updated" &&
      Array.isArray(event?.payload?.changed_fields)
        ? event.payload.changed_fields
        : [],
    resolvedRefs: refs.map((refValue) => {
      const ref = String(refValue ?? "");
      const snapshotId = ref.startsWith("snapshot:") ? ref.slice(9) : "";
      const snapshot = snapshots[snapshotId];
      return resolveRefLink(refValue, {
        threadId,
        humanize: true,
        labelHints,
        snapshotIsThread: String(snapshot?.kind ?? "").trim() === "thread",
      });
    }),
  };
}

export function toTimelineView(events = [], options = {}) {
  return events.map((event) => toTimelineViewEvent(event, options));
}
