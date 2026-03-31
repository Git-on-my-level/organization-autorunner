export async function listAllPrincipals(client, { limit = 200 } = {}) {
  const principals = [];
  const seenCursors = new Set();
  let cursor = "";

  while (true) {
    const response = await client.listPrincipals({
      limit,
      cursor,
    });
    principals.push(...(response.principals ?? []));

    const nextCursor = String(response.next_cursor ?? "").trim();
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return principals;
}
