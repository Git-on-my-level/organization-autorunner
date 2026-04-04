import { json } from "@sveltejs/kit";

import { ackMockInboxItem, createMockEvent } from "$lib/mockCoreData";
import { assertMockModeEnabled, readMockJsonBody } from "$lib/server/mockGuard";

export async function POST({ request, url }) {
  const guardResponse = assertMockModeEnabled(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const parsed = await readMockJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const body = parsed.body;

  const subjectRef = String(body?.subject_ref ?? "").trim();
  const legacyThreadId = String(body?.thread_id ?? "").trim();
  if (
    !body?.actor_id ||
    !body?.inbox_item_id ||
    (!subjectRef && !legacyThreadId)
  ) {
    return json(
      {
        error:
          "actor_id, inbox_item_id, and subject_ref are required (legacy thread_id is still accepted in mock mode).",
      },
      { status: 400 },
    );
  }

  const item = ackMockInboxItem(body);

  if (!item) {
    return json({ error: "Inbox item not found." }, { status: 404 });
  }

  const eventThreadId =
    legacyThreadId || subjectRef.split(":").slice(1).join(":");

  const event = createMockEvent({
    id: `event-${Math.random().toString(36).slice(2, 10)}`,
    ts: new Date().toISOString(),
    type: "inbox_item_acknowledged",
    actor_id: body.actor_id,
    thread_id: eventThreadId,
    refs: [`inbox:${body.inbox_item_id}`, `thread:${eventThreadId}`],
    summary: `Acknowledged inbox item ${body.inbox_item_id}`,
    payload: {
      inbox_item_id: body.inbox_item_id,
    },
    provenance: {
      sources: ["actor_statement:ui"],
    },
  });

  return json({ event });
}
