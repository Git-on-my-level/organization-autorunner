import { describe, expect, it } from "vitest";

import {
  describeWakeRouting,
  registrationDocumentId,
} from "../../src/lib/wakeRouting.js";

describe("wakeRouting", () => {
  it("marks an agent wakeable when the durable workspace id is bound", () => {
    const result = describeWakeRouting(
      {
        principal_kind: "agent",
        actor_id: "actor-ops-ai",
        username: "m4-hermes",
        revoked: false,
      },
      {
        state: "ok",
        document: {
          document: {
            id: "agentreg.m4-hermes",
            status: "active",
          },
          revision: {
            content: {
              handle: "m4-hermes",
              actor_id: "actor-ops-ai",
              status: "active",
              workspace_bindings: [{ workspace_id: "ws-123", enabled: true }],
            },
          },
        },
      },
      "ws-123",
    );

    expect(registrationDocumentId("m4-hermes")).toBe("agentreg.m4-hermes");
    expect(result).toMatchObject({
      applicable: true,
      wakeable: true,
      badgeLabel: "Wakeable",
      summary: "Wakeable as @m4-hermes.",
    });
  });

  it("distinguishes transient registration lookup failures from missing docs", () => {
    const principal = {
      principal_kind: "agent",
      actor_id: "actor-ops-ai",
      username: "m4-hermes",
      revoked: false,
    };

    expect(
      describeWakeRouting(principal, { state: "missing" }, "ws-123"),
    ).toMatchObject({
      applicable: true,
      wakeable: false,
      badgeLabel: "Not wakeable",
      summary: "Missing registration document agentreg.m4-hermes.",
    });

    expect(
      describeWakeRouting(principal, { state: "error" }, "ws-123"),
    ).toMatchObject({
      applicable: true,
      wakeable: false,
      badgeLabel: "Unknown",
      summary: "Registration status is unavailable right now.",
    });
  });
});
