import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coreClientMocks = vi.hoisted(() => ({
  getThreadWorkspace: vi.fn(),
  listThreadTimeline: vi.fn(),
  listArtifacts: vi.fn(),
}));

vi.mock("../../src/lib/coreClient.js", () => ({
  coreClient: {
    getThreadWorkspace: coreClientMocks.getThreadWorkspace,
    listThreadTimeline: coreClientMocks.listThreadTimeline,
    listArtifacts: coreClientMocks.listArtifacts,
  },
}));

import { threadDetailStore } from "../../src/lib/threadDetailStore.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("threadDetailStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    threadDetailStore.reset();
  });

  afterEach(() => {
    threadDetailStore.reset();
  });

  it("keeps existing workspace content mounted during background refresh", async () => {
    coreClientMocks.getThreadWorkspace.mockResolvedValueOnce({
      thread: { id: "thread-1", title: "Initial workspace" },
      context: {
        recent_events: [],
        documents: [],
        open_commitments: [],
      },
    });

    await threadDetailStore.loadWorkspace("thread-1");

    const pendingRefresh = deferred();
    coreClientMocks.getThreadWorkspace.mockReturnValueOnce(
      pendingRefresh.promise,
    );

    const refreshPromise = threadDetailStore.refreshThreadDetail("thread-1", {
      workspace: true,
    });

    expect(get(threadDetailStore).snapshotLoading).toBe(false);
    expect(get(threadDetailStore).snapshot).toMatchObject({
      id: "thread-1",
      title: "Initial workspace",
    });

    pendingRefresh.resolve({
      thread: { id: "thread-1", title: "Refreshed workspace" },
      context: {
        recent_events: [{ id: "event-1", type: "actor_statement" }],
        documents: [{ id: "doc-1", title: "Doc 1" }],
        open_commitments: [{ id: "commit-1", status: "open" }],
      },
    });

    await refreshPromise;

    expect(get(threadDetailStore)).toMatchObject({
      snapshot: { id: "thread-1", title: "Refreshed workspace" },
      timeline: [{ id: "event-1", type: "actor_statement" }],
      documents: [{ id: "doc-1", title: "Doc 1" }],
      commitments: [{ id: "commit-1", status: "open" }],
      snapshotLoading: false,
      snapshotError: "",
      documentsError: "",
    });
  });
});
