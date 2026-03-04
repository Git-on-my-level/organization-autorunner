import { json } from "@sveltejs/kit";

import { createMockEvent } from "$lib/mockCoreData";

export async function POST({ request }) {
  const body = await request.json();

  if (!body?.actor_id) {
    return json({ error: "actor_id is required" }, { status: 400 });
  }

  if (!body?.event?.type || !body?.event?.summary) {
    return json(
      { error: "event.type and event.summary are required" },
      { status: 400 },
    );
  }

  const event = createMockEvent({
    id: `event-${Math.random().toString(36).slice(2, 10)}`,
    ts: new Date().toISOString(),
    actor_id: body.actor_id,
    ...body.event,
  });

  return json({ event });
}
