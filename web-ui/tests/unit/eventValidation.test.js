import { describe, expect, it } from "vitest";

import { validateEventCreatePayload } from "../../src/lib/eventValidation.js";

function validBaseEvent(overrides = {}) {
  return {
    actor_id: "actor-1",
    event: {
      type: "message_posted",
      summary: "hello",
      thread_id: "thread-1",
      refs: ["thread:thread-1"],
      provenance: { sources: ["actor_statement:event-1"] },
      ...overrides,
    },
  };
}

describe("event validation", () => {
  it("accepts valid event payloads", () => {
    expect(validateEventCreatePayload(validBaseEvent())).toBe("");
  });

  it("rejects thread-scoped events without thread_id", () => {
    const error = validateEventCreatePayload(
      validBaseEvent({ thread_id: undefined }),
    );

    expect(error).toContain(
      'event.thread_id is required for event.type="message_posted"',
    );
  });

  it("rejects review_completed payloads that miss required artifact refs", () => {
    const error = validateEventCreatePayload(
      validBaseEvent({
        type: "review_completed",
        refs: ["artifact:work_order_1", "artifact:receipt_1"],
      }),
    );

    expect(error).toContain('at least 3 refs with prefix "artifact"');
  });

  it("enforces commitment status transition evidence refs", () => {
    const error = validateEventCreatePayload(
      validBaseEvent({
        type: "commitment_status_changed",
        refs: ["snapshot:commitment_1"],
        payload: { to_status: "done" },
      }),
    );

    expect(error).toContain(
      "event.refs must include artifact:<receipt_id> or event:<decision_event_id>",
    );
  });

  it("keeps unknown event types open", () => {
    const error = validateEventCreatePayload(
      validBaseEvent({
        type: "future_custom_type",
        thread_id: undefined,
        refs: ["mystery:opaque"],
      }),
    );

    expect(error).toBe("");
  });
});
