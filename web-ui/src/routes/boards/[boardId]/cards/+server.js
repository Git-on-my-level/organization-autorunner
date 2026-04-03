import { json } from "@sveltejs/kit";

import { listMockBoardCards, createMockBoardCard } from "$lib/mockCoreData";
import {
  assertMockModeEnabled,
  mockResultToResponse,
  readMockJsonBody,
} from "$lib/server/mockGuard";

export function GET({ params, url }) {
  const guardResponse = assertMockModeEnabled(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const cards = listMockBoardCards(params.boardId);
  return json({ board_id: params.boardId, cards });
}

export async function POST({ params, request, url }) {
  const guardResponse = assertMockModeEnabled(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const parsed = await readMockJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const body = parsed.body;

  if (!body?.actor_id) {
    return json({ error: "actor_id is required." }, { status: 400 });
  }

  const hasThread = String(body.thread_id ?? body.parent_thread ?? "").trim();
  const hasTitle = String(body.title ?? "").trim();
  if (!hasThread && !hasTitle) {
    return json(
      {
        error:
          "thread_id, parent_thread, or title is required (standalone cards need title).",
      },
      { status: 400 },
    );
  }

  const result = createMockBoardCard(params.boardId, body);
  return mockResultToResponse(result, 201);
}
