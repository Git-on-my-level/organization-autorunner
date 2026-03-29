import { describe, expect, it } from "vitest";

import {
  buildArtifactListQuery,
  buildArtifactListSearchString,
  hasArtifactListFilters,
  parseArtifactListSearchParams,
} from "../../src/lib/artifactFilters.js";

describe("artifact list URL state", () => {
  it("parses artifact filters from search params", () => {
    expect(
      parseArtifactListSearchParams(
        new URLSearchParams(
          "kind=receipt&thread_id=thread-onboarding&created_after=2026-03-04T09%3A30",
        ),
      ),
    ).toEqual({
      kind: "receipt",
      thread_id: "thread-onboarding",
      created_after: "2026-03-04T09:30",
      created_before: "",
    });
  });

  it("drops invalid values while parsing", () => {
    expect(
      parseArtifactListSearchParams(
        new URLSearchParams(
          "kind=unknown&thread_id=%20%20&created_after=not-a-date&created_before=2026-03-04T14%3A00",
        ),
      ),
    ).toEqual({
      kind: "",
      thread_id: "",
      created_after: "",
      created_before: "2026-03-04T14:00",
    });
  });

  it("serializes artifact filters into a stable search string", () => {
    expect(
      buildArtifactListSearchString({
        kind: "work_order",
        thread_id: "thread-onboarding",
        created_after: "2026-03-04T09:30",
        created_before: "",
      }),
    ).toBe(
      "kind=work_order&thread_id=thread-onboarding&created_after=2026-03-04T09%3A30",
    );
  });

  it("builds the artifact API query with ISO timestamps", () => {
    expect(
      buildArtifactListQuery({
        kind: "review",
        thread_id: "thread-onboarding",
        created_after: "2026-03-04T09:30",
        created_before: "2026-03-04T17:45",
      }),
    ).toEqual({
      kind: "review",
      thread_id: "thread-onboarding",
      created_after: new Date("2026-03-04T09:30").toISOString(),
      created_before: new Date("2026-03-04T17:45").toISOString(),
    });
  });

  it("detects whether any artifact filters are active", () => {
    expect(hasArtifactListFilters({})).toBe(false);
    expect(hasArtifactListFilters({ thread_id: "thread-onboarding" })).toBe(
      true,
    );
  });
});
