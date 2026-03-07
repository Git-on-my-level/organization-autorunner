const EVENT_REF_RULES = {
  work_order_created: {
    threadRequired: true,
    requiredRefPrefixes: { artifact: 1 },
  },
  receipt_added: {
    threadRequired: true,
    requiredRefPrefixes: { artifact: 2 },
  },
  review_completed: {
    threadRequired: true,
    requiredRefPrefixes: { artifact: 3 },
  },
  commitment_created: {
    threadRequired: true,
    requiredRefPrefixes: { snapshot: 1 },
  },
  commitment_status_changed: {
    threadRequired: true,
    requiredRefPrefixes: { snapshot: 1 },
  },
  decision_needed: {
    threadRequired: true,
  },
  decision_made: {
    threadRequired: true,
  },
  snapshot_updated: {
    requiredRefPrefixes: { snapshot: 1 },
  },
  exception_raised: {
    threadRequired: true,
    requiredPayloadKeys: ["subtype"],
  },
  message_posted: {
    threadRequired: true,
  },
  inbox_item_acknowledged: {
    threadRequired: true,
    requiredRefPrefixes: { inbox: 1 },
  },
};

function typedRefPrefix(refValue) {
  const raw = String(refValue ?? "").trim();
  const separatorIndex = raw.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) {
    return "";
  }

  return raw.slice(0, separatorIndex).trim();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function commitmentTargetStatus(payload) {
  const toStatus = String(payload?.to_status ?? "").trim();
  if (toStatus) {
    return toStatus;
  }
  return String(payload?.status ?? "").trim();
}

function validateRequiredPrefixes(type, refs, requiredRefPrefixes) {
  if (!requiredRefPrefixes) {
    return "";
  }

  const actualByPrefix = {};
  for (const ref of refs) {
    const prefix = typedRefPrefix(ref);
    if (!prefix) {
      continue;
    }
    actualByPrefix[prefix] = (actualByPrefix[prefix] ?? 0) + 1;
  }

  for (const [prefix, count] of Object.entries(requiredRefPrefixes)) {
    const actual = actualByPrefix[prefix] ?? 0;
    if (actual >= count) {
      continue;
    }

    if (count === 1) {
      return `event.refs must include a "${prefix}:<id>" typed ref for event.type="${type}"`;
    }
    return `event.refs must include at least ${count} refs with prefix "${prefix}" for event.type="${type}"`;
  }

  return "";
}

function validateConditionalCommitmentStatusRefs(payload, refs) {
  const status = commitmentTargetStatus(payload);
  if (!status) {
    return "";
  }

  const prefixes = refs.map((ref) => typedRefPrefix(ref));
  const hasArtifact = prefixes.includes("artifact");
  const hasEvent = prefixes.includes("event");

  if (status === "done" && !(hasArtifact || hasEvent)) {
    return 'event.refs must include artifact:<receipt_id> or event:<decision_event_id> when event.type="commitment_status_changed" and payload.to_status="done"';
  }

  if (status === "canceled" && !hasEvent) {
    return 'event.refs must include event:<decision_event_id> when event.type="commitment_status_changed" and payload.to_status="canceled"';
  }

  return "";
}

export function validateEventCreatePayload(body) {
  if (!isObject(body)) {
    return "request body must be a JSON object";
  }

  const actorId = String(body.actor_id ?? "").trim();
  if (!actorId) {
    return "actor_id is required";
  }

  const event = body.event;
  if (!isObject(event)) {
    return "event is required";
  }

  const type = String(event.type ?? "").trim();
  if (!type) {
    return "event.type is required";
  }

  if (typeof event.summary !== "string") {
    return "event.summary is required";
  }

  if (!Array.isArray(event.refs)) {
    return "event.refs must be a list of strings";
  }

  for (const ref of event.refs) {
    if (typeof ref !== "string") {
      return "event.refs must be a list of strings";
    }
    if (!typedRefPrefix(ref)) {
      return `event.refs contains invalid typed ref ${JSON.stringify(ref)}`;
    }
  }

  if (!isObject(event.provenance)) {
    return "event.provenance is required";
  }

  if (!Array.isArray(event.provenance.sources)) {
    return "event.provenance.sources must be a list of strings";
  }
  for (const source of event.provenance.sources) {
    if (typeof source !== "string") {
      return "event.provenance.sources must be a list of strings";
    }
  }

  if (event.thread_id !== undefined && String(event.thread_id).trim() === "") {
    return "event.thread_id must be non-empty when provided";
  }

  if (
    event.payload !== undefined &&
    event.payload !== null &&
    !isObject(event.payload)
  ) {
    return "event.payload must be an object";
  }

  const rule = EVENT_REF_RULES[type];
  if (!rule) {
    // Keep open-enum behavior for unknown event types.
    return "";
  }

  const threadID = String(event.thread_id ?? "").trim();
  if (rule.threadRequired && !threadID) {
    return `event.thread_id is required for event.type="${type}"`;
  }

  const refs = event.refs;
  const prefixError = validateRequiredPrefixes(
    type,
    refs,
    rule.requiredRefPrefixes,
  );
  if (prefixError) {
    return prefixError;
  }

  const payload = isObject(event.payload) ? event.payload : {};
  for (const key of rule.requiredPayloadKeys ?? []) {
    if (!(key in payload) || payload[key] == null) {
      return `event.payload.${key} is required for event.type="${type}"`;
    }
  }

  if (type === "commitment_status_changed") {
    return validateConditionalCommitmentStatusRefs(payload, refs);
  }

  return "";
}
