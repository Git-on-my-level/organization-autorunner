import { json } from "@sveltejs/kit";

import { validateEventCreatePayload } from "$lib/eventValidation";
import { createMockEvent } from "$lib/mockCoreData";
import { validateEventRefRule } from "$lib/eventRefRules.js";
import { guardMockRoute } from "$lib/server/mockGuard";

export async function POST({ request, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const body = await request.json();
  const validationError = validateEventCreatePayload(body);
  if (validationError) {
    return json({ error: validationError }, { status: 400 });
  }

  const eventInput = body.event;
  const refValidation = validateEventRefRule(
    eventInput.type,
    eventInput.refs ?? [],
    {
      ...(eventInput.payload ?? {}),
      thread_id: eventInput.thread_id,
    },
  );
  if (!refValidation.valid) {
    return json({ error: refValidation.error }, { status: 400 });
  }

  const event = createMockEvent({
    id: `event-${Math.random().toString(36).slice(2, 10)}`,
    ts: new Date().toISOString(),
    actor_id: body.actor_id,
    ...eventInput,
  });

  return json({ event });
}
