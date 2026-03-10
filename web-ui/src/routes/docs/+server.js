import { json } from "@sveltejs/kit";
import { listMockDocuments } from "$lib/mockCoreData";
import { guardMockRoute } from "$lib/server/mockGuard";

export function GET({ url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) return guardResponse;
  const params = url.searchParams;
  const filters = {
    include_tombstoned: params.get("include_tombstoned") === "true",
  };
  return json({ documents: listMockDocuments(filters) });
}
