const actors = [];

const inboxItems = [
  {
    id: "inbox-001",
    category: "decision_needed",
    title: "Approve onboarding exception handling",
    recommended_action: "Record a decision on escalation path.",
    thread_id: "thread-onboarding",
    commitment_id: "commitment-onboard-1",
    refs: [
      "thread:thread-onboarding",
      "artifact:artifact-policy-draft",
      "url:https://example.com/onboarding-brief",
    ],
    source_event_time: "2026-03-03T12:00:00.000Z",
  },
  {
    id: "inbox-002",
    category: "exception",
    title: "Missing legal signer for external policy packet",
    recommended_action: "Acknowledge and assign remediation owner.",
    thread_id: "thread-onboarding",
    refs: ["thread:thread-onboarding", "event:evt-1001"],
    source_event_time: "2026-03-03T09:00:00.000Z",
  },
  {
    id: "inbox-003",
    category: "commitment_risk",
    title: "Commitment at risk: onboarding SLA response",
    recommended_action: "Confirm revised due date with owner.",
    thread_id: "thread-incident-42",
    commitment_id: "commitment-sla-42",
    refs: ["thread:thread-incident-42"],
    source_event_time: "2026-03-02T15:20:00.000Z",
  },
];

const events = [
  {
    id: "evt-1001",
    ts: "2026-03-03T08:00:00.000Z",
    type: "message_posted",
    actor_id: "actor-policy-owner",
    thread_id: "thread-onboarding",
    refs: ["thread:thread-onboarding", "artifact:artifact-policy-draft"],
    summary: "Waiting on legal review confirmation.",
    payload: { text: "Need legal signer to proceed." },
    provenance: { sources: ["actor_statement:event-1001"] },
  },
  {
    id: "evt-1002",
    ts: "2026-03-03T10:30:00.000Z",
    type: "unknown_future_type",
    actor_id: "actor-integrations",
    thread_id: "thread-onboarding",
    refs: ["event:evt-1001", "mystery:opaque-value"],
    summary: "Future event type should still render.",
    payload: { score: 9 },
    provenance: { sources: ["inferred"] },
  },
];

export function listMockActors() {
  return actors;
}

export function createMockActor(actor) {
  actors.push(actor);
  return actor;
}

export function createMockEvent(event) {
  events.push(event);
  return event;
}

export function listMockInboxItems() {
  return inboxItems;
}

export function ackMockInboxItem({ thread_id, inbox_item_id }) {
  const index = inboxItems.findIndex(
    (item) =>
      item.id === inbox_item_id &&
      (!thread_id || String(item.thread_id) === String(thread_id)),
  );

  if (index === -1) {
    return null;
  }

  return inboxItems.splice(index, 1)[0];
}

export function listMockTimelineEvents(threadId) {
  return events
    .filter((event) => event.thread_id === threadId)
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}
