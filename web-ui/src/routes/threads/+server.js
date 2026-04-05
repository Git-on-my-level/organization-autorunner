import { json } from "@sveltejs/kit";

import { listMockThreads } from "$lib/mockCoreData";
import { assertMockModeEnabled } from "$lib/server/mockGuard";

export function GET({ url }) {
  const guardResponse = assertMockModeEnabled(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const params = url.searchParams;
  const filters = {
    status: params.get("status") ?? undefined,
    priority: params.get("priority") ?? undefined,
    cadence: params.get("cadence") ?? undefined,
    stale: params.get("stale") ?? undefined,
    tag: params.getAll("tag"),
  };

  return json({
    threads: listMockThreads(filters),
  });
}
