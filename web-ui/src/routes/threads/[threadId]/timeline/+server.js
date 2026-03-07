import { json } from "@sveltejs/kit";

import { getMockThreadTimeline } from "$lib/mockCoreData";
import { guardMockRoute } from "$lib/server/mockGuard";

export function GET({ params, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  return json(getMockThreadTimeline(params.threadId));
}
