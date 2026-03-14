import { json } from "@sveltejs/kit";

import { listMockBoardCards, createMockBoardCard } from "$lib/mockCoreData";
import { guardMockRoute } from "$lib/server/mockGuard";

export function GET({ params, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const cards = listMockBoardCards(params.boardId);
  return json({ board_id: params.boardId, cards });
}

export async function POST({ params, request, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const body = await request.json();

  if (!body?.actor_id) {
    return json({ error: "actor_id is required." }, { status: 400 });
  }

  if (!body?.thread_id) {
    return json({ error: "thread_id is required." }, { status: 400 });
  }

  const result = createMockBoardCard(params.boardId, body);
  if (result?.error === "conflict") {
    return json(result, { status: 409 });
  }
  if (result?.error === "not_found") {
    return json({ error: result.message }, { status: 404 });
  }
  if (result?.error === "validation") {
    return json({ error: result.message }, { status: 400 });
  }

  return json(result, { status: 201 });
}
