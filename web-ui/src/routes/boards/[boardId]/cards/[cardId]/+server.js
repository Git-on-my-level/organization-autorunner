import { json } from "@sveltejs/kit";

import { updateMockBoardCard, removeMockBoardCard } from "$lib/mockCoreData";
import { guardMockRoute } from "$lib/server/mockGuard";

export async function PATCH({ params, request, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const body = await request.json();

  if (!body?.actor_id) {
    return json({ error: "actor_id is required." }, { status: 400 });
  }

  try {
    const result = updateMockBoardCard(params.boardId, params.cardId, body);
    return json(result);
  } catch (error) {
    return json({ error: error.message }, { status: 404 });
  }
}

export async function DELETE({ params, request, url }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) {
    return guardResponse;
  }

  const body = await request.json();

  if (!body?.actor_id) {
    return json({ error: "actor_id is required." }, { status: 400 });
  }

  try {
    const result = removeMockBoardCard(params.boardId, params.cardId);
    return json(result);
  } catch (error) {
    return json({ error: error.message }, { status: 404 });
  }
}
