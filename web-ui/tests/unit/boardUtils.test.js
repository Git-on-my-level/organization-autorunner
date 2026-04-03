import { describe, expect, it } from "vitest";

import { boardCardStableId } from "../../src/lib/boardUtils.js";

describe("boardUtils", () => {
  describe("boardCardStableId", () => {
    it("prefers versioned card id when present", () => {
      expect(
        boardCardStableId({
          id: "a7472ac6-c002-445b-ade5-b0cc7a2532cd",
          thread_id: null,
        }),
      ).toBe("a7472ac6-c002-445b-ade5-b0cc7a2532cd");
    });

    it("falls back to thread_id for legacy thread-backed rows", () => {
      expect(
        boardCardStableId({
          id: "",
          thread_id: "thread-execution",
        }),
      ).toBe("thread-execution");
    });
  });
});
