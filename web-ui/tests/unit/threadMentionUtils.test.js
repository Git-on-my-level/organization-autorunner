import { describe, expect, it } from "vitest";

import {
  agentHandlesFromPrincipals,
  filterMentionCandidates,
  parseActiveMention,
  wakeableAgentHandlesFromPrincipals,
} from "../../src/lib/threadMentionUtils.js";

describe("parseActiveMention", () => {
  it("returns null when there is no @", () => {
    expect(parseActiveMention("hello", 5)).toBeNull();
  });

  it("detects mention at start", () => {
    expect(parseActiveMention("@su", 3)).toEqual({ atIndex: 0, query: "su" });
  });

  it("requires whitespace before @ when not at start", () => {
    expect(parseActiveMention("foo@su", 6)).toBeNull();
    expect(parseActiveMention("foo @su", 7)).toEqual({
      atIndex: 4,
      query: "su",
    });
  });

  it("returns empty query right after @", () => {
    expect(parseActiveMention("hi @", 4)).toEqual({ atIndex: 3, query: "" });
  });

  it("stops at cursor inside the handle", () => {
    expect(parseActiveMention("@supply partial", 4)).toEqual({
      atIndex: 0,
      query: "sup",
    });
  });
});

describe("filterMentionCandidates", () => {
  it("filters by handle prefix case-insensitively", () => {
    const c = [
      { handle: "alpha.bot", displayLabel: "A" },
      { handle: "beta.bot", displayLabel: "B" },
    ];
    expect(filterMentionCandidates(c, "be")).toEqual([c[1]]);
    expect(filterMentionCandidates(c, "ALP")).toEqual([c[0]]);
  });
});

describe("agentHandlesFromPrincipals", () => {
  it("keeps non-revoked agents with usernames and sorts", () => {
    const out = agentHandlesFromPrincipals(
      [
        {
          principal_kind: "agent",
          username: "z.last",
          actor_id: "a1",
          revoked: false,
        },
        {
          principal_kind: "human",
          username: "human",
          actor_id: "h1",
          revoked: false,
        },
        {
          principal_kind: "agent",
          username: "a.first",
          actor_id: "a2",
          revoked: false,
        },
        {
          principal_kind: "agent",
          username: "gone",
          actor_id: "a3",
          revoked: true,
        },
      ],
      (id) => (id === "a2" ? "Display A" : ""),
    );
    expect(out.map((r) => r.handle)).toEqual(["a.first", "z.last"]);
    expect(out[0].displayLabel).toBe("Display A");
    expect(out[1].displayLabel).toBe("z.last");
  });
});

describe("wakeableAgentHandlesFromPrincipals", () => {
  it("keeps only wakeable agents", () => {
    const out = wakeableAgentHandlesFromPrincipals(
      [
        {
          principal_kind: "agent",
          username: "wakeable.one",
          actor_id: "a1",
          revoked: false,
          wakeRouting: { wakeable: true },
        },
        {
          principal_kind: "agent",
          username: "not-ready",
          actor_id: "a2",
          revoked: false,
          wakeRouting: { wakeable: false },
        },
        {
          principal_kind: "agent",
          username: "unknown",
          actor_id: "a3",
          revoked: false,
        },
      ],
      (id) => (id === "a1" ? "Wakeable One" : ""),
    );

    expect(out).toEqual([
      {
        handle: "wakeable.one",
        actorId: "a1",
        displayLabel: "Wakeable One",
      },
    ]);
  });
});
