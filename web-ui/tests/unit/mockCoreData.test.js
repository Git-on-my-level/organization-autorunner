import { describe, expect, it } from "vitest";

describe("mockCoreData parity behaviors", () => {
  describe("inbox ack is non-destructive", () => {
    it("module exports ackMockInboxItem and listMockInboxItems functions", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      expect(typeof mod.ackMockInboxItem).toBe("function");
      expect(typeof mod.listMockInboxItems).toBe("function");
    });
  });

  describe("documents list matches contract behavior", () => {
    it("filters tombstoned docs by default and sorts by updated_at desc", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const docs = mod.listMockDocuments();

      expect(docs.map((doc) => doc.id)).toEqual([
        "product-constitution",
        "incident-response-playbook",
        "onboarding-guide-v1",
      ]);
    });

    it("includes tombstoned docs when requested", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const docs = mod.listMockDocuments({ include_tombstoned: true });

      expect(docs.map((doc) => doc.id)).toEqual([
        "product-constitution",
        "incident-response-playbook",
        "old-pricing-doc",
        "onboarding-guide-v1",
      ]);
    });

    it("supports thread-scoped filtering and head revision summaries", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const docs = mod.listMockDocuments({ thread_id: "thread-governance" });

      expect(docs.map((doc) => doc.id)).toEqual(["product-constitution"]);
      expect(docs[0]?.head_revision).toMatchObject({
        revision_id: "rev-pc-3",
        revision_number: 3,
        content_type: "text",
      });
    });
  });

  describe("boards parity behaviors", () => {
    it("returns nested board memberships in thread workspace", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const workspace = mod.getMockThreadWorkspace("thread-summer-menu");
      const membership = workspace?.board_memberships?.items?.[0];

      expect(membership).toMatchObject({
        board: {
          id: "board-product-launch",
          title: "Q2 Product Launch",
          status: "active",
        },
        card: {
          board_id: "board-product-launch",
          thread_id: "thread-summer-menu",
          column_key: "ready",
          pinned_document_id: "onboarding-guide-v1",
        },
      });
    });

    it("rejects invalid board status values on create", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const result = mod.createMockBoard({
        actor_id: "actor-test",
        board: {
          title: "Invalid",
          primary_thread_id: "thread-summer-menu",
          status: "archived",
        },
      });

      expect(result).toMatchObject({
        error: "validation",
        message: "board.status must be one of: active, paused, closed",
      });
    });

    it("rejects invalid board columns on card creation", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const result = mod.createMockBoardCard("board-product-launch", {
        actor_id: "actor-test",
        if_board_updated_at: mod.getMockBoard("board-product-launch")
          ?.updated_at,
        thread_id: "thread-pricing-glitch",
        column_key: "triage",
      });

      expect(result).toMatchObject({
        error: "validation",
        message:
          "column_key must be one of: backlog, ready, in_progress, blocked, review, done.",
      });
    });

    it("rejects missing pinned documents on card creation", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const result = mod.createMockBoardCard("board-product-launch", {
        actor_id: "actor-test",
        if_board_updated_at: mod.getMockBoard("board-product-launch")
          ?.updated_at,
        thread_id: "thread-pricing-glitch",
        pinned_document_id: "doc-does-not-exist",
      });

      expect(result).toMatchObject({
        error: "not_found",
        message: "Document not found: doc-does-not-exist",
      });
    });

    it("aggregates workspace documents and commitments across all board threads", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const workspace = mod.getMockBoardWorkspace("board-summer-menu");

      expect(workspace?.documents?.items?.map((doc) => doc.id)).toEqual([
        "incident-response-playbook",
      ]);
      expect(
        workspace?.commitments?.items?.map((commitment) => commitment.id),
      ).toEqual([
        "commitment-pricing-patch",
        "commitment-pricing-audit",
        "commitment-menu-board",
      ]);
      expect(workspace?.section_kinds).toMatchObject({
        board: "canonical",
        primary_thread: "canonical",
        primary_document: "canonical",
        cards: "convenience",
      });
    });

    it("includes primary-thread activity in board summaries", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const boardListItem = mod
        .listMockBoards()
        .find((item) => item.board.id === "board-supply-crisis");

      expect(boardListItem?.summary?.open_commitment_count).toBe(3);
      expect(
        Date.parse(String(boardListItem?.summary?.latest_activity_at ?? "")),
      ).toBeGreaterThan(
        Date.parse(String(boardListItem?.board?.updated_at ?? "")),
      );
    });

    it("uses derived collaboration and inbox counts in board card summaries", async () => {
      const mod = await import("../../src/lib/mockCoreData.js");
      const workspace = mod.getMockBoardWorkspace("board-summer-menu");
      const pricingCard = workspace?.cards?.items?.find(
        (item) => item.card?.thread_id === "thread-pricing-glitch",
      );

      expect(pricingCard?.summary).toMatchObject({
        open_commitment_count: 0,
        decision_request_count: 1,
        decision_count: 1,
        recommendation_count: 0,
        document_count: 1,
        inbox_count: 0,
        stale: false,
      });
    });
  });
});
