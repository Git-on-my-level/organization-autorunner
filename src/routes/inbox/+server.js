import { json } from "@sveltejs/kit";

import { listMockInboxItems } from "$lib/mockCoreData";

export function GET() {
  return json({
    items: listMockInboxItems(),
    generated_at: new Date().toISOString(),
  });
}
