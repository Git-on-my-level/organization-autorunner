import { writable, get } from "svelte/store";
import { setContext, getContext } from "svelte";

const TIMELINE_KEY = Symbol("timeline-context");

function timelineEventsFromResult(res) {
  if (res && typeof res === "object" && Array.isArray(res.events)) {
    return res.events;
  }
  return [];
}

export function createTimelineContext(coreClient) {
  const store = writable({
    timeline: [],
    timelineLoading: false,
    timelineError: "",
  });
  get(store);

  let loadSeq = 0;

  async function loadTimeline(scopeId, opts = {}) {
    const seq = ++loadSeq;
    store.update((s) => ({
      ...s,
      timelineLoading: true,
      timelineError: "",
    }));
    try {
      let res;
      if (opts?.asTopic) {
        res = await coreClient.listTopicTimeline(scopeId);
      } else if (opts?.asCard) {
        res = await coreClient.listCardTimeline(scopeId);
      } else {
        res = await coreClient.listThreadTimeline(scopeId);
      }
      if (seq !== loadSeq) return;
      store.update((s) => ({
        ...s,
        timeline: timelineEventsFromResult(res),
        timelineLoading: false,
        timelineError: "",
      }));
    } catch (err) {
      if (seq !== loadSeq) return;
      const message =
        err && typeof err === "object" && "message" in err
          ? String(err.message)
          : String(err);
      store.update((s) => ({
        ...s,
        timelineLoading: false,
        timelineError: message,
      }));
    }
  }

  function refreshTimeline() {}

  return { store, loadTimeline, refreshTimeline };
}

export function setTimelineContext(ctx) {
  setContext(TIMELINE_KEY, ctx);
}

export function getTimelineContext() {
  return getContext(TIMELINE_KEY);
}
