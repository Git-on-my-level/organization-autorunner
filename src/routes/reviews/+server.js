import { json } from "@sveltejs/kit";

import { createMockReview } from "$lib/mockCoreData";

export async function POST({ request }) {
  const body = await request.json();

  if (!body?.actor_id || !body?.artifact || !body?.packet) {
    return json(
      { error: "actor_id, artifact, and packet are required." },
      { status: 400 },
    );
  }

  const result = createMockReview(body);
  if (result.error) {
    return json({ error: result.message }, { status: 400 });
  }

  return json({
    artifact: result.artifact,
    event: result.event,
  });
}
