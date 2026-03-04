import { json } from "@sveltejs/kit";

import { listMockTimelineEvents } from "$lib/mockCoreData";

export function GET({ params }) {
  return json({
    events: listMockTimelineEvents(params.threadId),
  });
}
