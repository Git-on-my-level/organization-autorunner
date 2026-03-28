function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function registrationContent(documentPayload) {
  const revision = asObject(asObject(documentPayload)?.revision);
  return asObject(revision?.content);
}

function registrationLookup(value) {
  const lookup = asObject(value);
  if (
    lookup?.state === "ok" ||
    lookup?.state === "missing" ||
    lookup?.state === "error"
  ) {
    return lookup;
  }
  return { state: "ok", document: value };
}

export function registrationDocumentId(handle) {
  const normalized = String(handle ?? "").trim();
  return normalized ? `agentreg.${normalized}` : "";
}

export function describeWakeRouting(principal, registrationDoc, workspaceId) {
  const kind = String(principal?.principal_kind ?? "").trim();
  if (kind !== "agent") {
    return { applicable: false };
  }

  const handle = String(principal?.username ?? "").trim();
  const actorId = String(principal?.actor_id ?? "").trim();
  const bindingTarget = String(workspaceId ?? "").trim();
  const lookup = registrationLookup(registrationDoc);

  const base = {
    applicable: true,
    handle,
    wakeable: false,
    badgeLabel: "Not wakeable",
    badgeClass: "bg-amber-500/10 text-amber-400",
    summary: "",
  };

  if (principal?.revoked) {
    return { ...base, summary: "Revoked agent principals are not wakeable." };
  }
  if (!handle) {
    return { ...base, summary: "No username is set for `@handle` routing." };
  }

  if (lookup.state === "error") {
    return {
      ...base,
      badgeLabel: "Unknown",
      badgeClass: "bg-slate-500/10 text-slate-300",
      summary: "Registration status is unavailable right now.",
    };
  }

  if (lookup.state === "missing") {
    return {
      ...base,
      summary: `Missing registration document ${registrationDocumentId(handle)}.`,
    };
  }

  const documentMeta = asObject(asObject(lookup.document)?.document);
  if (
    String(documentMeta?.status ?? "").trim() === "tombstoned" ||
    String(documentMeta?.tombstoned_at ?? "").trim() !== ""
  ) {
    return {
      ...base,
      summary: "Registration document is tombstoned.",
    };
  }

  const content = registrationContent(lookup.document);
  if (!content) {
    return {
      ...base,
      summary: `Missing registration document ${registrationDocumentId(handle)}.`,
    };
  }

  const registeredHandle = String(content.handle ?? "").trim();
  if (registeredHandle && registeredHandle !== handle) {
    return {
      ...base,
      summary: `Registration doc handle does not match @${handle}.`,
    };
  }

  const registeredActorId = String(content.actor_id ?? "").trim();
  if (!registeredActorId || registeredActorId !== actorId) {
    return {
      ...base,
      summary: "Registration actor does not match the principal actor.",
    };
  }

  const status = String(content.status ?? "active").trim() || "active";
  if (status !== "active") {
    return {
      ...base,
      summary: `Registration status is ${status}.`,
    };
  }

  const bindings = Array.isArray(content.workspace_bindings)
    ? content.workspace_bindings
    : [];
  const matchingBinding = bindings.find(
    (binding) => String(binding?.workspace_id ?? "").trim() === bindingTarget,
  );

  if (!matchingBinding) {
    return {
      ...base,
      summary: "Registration is not enabled for this workspace.",
    };
  }

  if (matchingBinding.enabled === false) {
    return {
      ...base,
      summary: "Registration is disabled for this workspace.",
    };
  }

  return {
    applicable: true,
    handle,
    wakeable: true,
    badgeLabel: "Wakeable",
    badgeClass: "bg-emerald-500/10 text-emerald-400",
    summary: `Wakeable as @${handle}.`,
  };
}
