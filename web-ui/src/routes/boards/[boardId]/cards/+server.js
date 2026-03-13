import { json } from "@sveltejs/kit";

import { listMockBoardCards, createMockBoardCard } from "$lib/mockCoreData";
import { guardMockRoute } from "$lib/server/mockGuard";

export function GET({ params, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const cards = listMockBoardCards(params.boardId);
  return json({ cards });
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

  try {
    const result = createMockBoardCard(params.boardId, body);
    return json(result);
  } catch (error) {
    return json({ error: error.message }, { status: 404 });
  }
}
