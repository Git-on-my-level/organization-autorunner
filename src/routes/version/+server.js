import { json } from "@sveltejs/kit";

import { EXPECTED_SCHEMA_VERSION } from "$lib/config";

export function GET() {
  return json({ schema_version: EXPECTED_SCHEMA_VERSION });
}
