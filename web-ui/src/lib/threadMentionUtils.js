/**
 * Parse an in-progress @mention at the text cursor. Returns null when the
 * cursor is not inside a mention token (after @, word-boundary @ only).
 *
 * @param {string} value
 * @param {number} cursorIndex
 * @returns {{ atIndex: number, query: string } | null}
 */
export function parseActiveMention(value, cursorIndex) {
  const text = String(value ?? "");
  const sel = Math.min(
    Math.max(0, Math.floor(Number(cursorIndex) || 0)),
    text.length,
  );
  let i = sel - 1;
  while (i >= 0 && /[a-z0-9._-]/i.test(text[i] ?? "")) {
    i -= 1;
  }
  if (i < 0 || text[i] !== "@") {
    return null;
  }
  if (i > 0 && !/\s/.test(text[i - 1] ?? "")) {
    return null;
  }
  const query = text.slice(i + 1, sel);
  return { atIndex: i, query };
}

/**
 * @param {{ handle: string, displayLabel?: string }[]} candidates
 * @param {string} query
 */
export function filterMentionCandidates(candidates, query) {
  const q = String(query ?? "").toLowerCase();
  const list = Array.isArray(candidates) ? candidates : [];
  return list.filter((c) =>
    String(c?.handle ?? "")
      .toLowerCase()
      .startsWith(q),
  );
}

/**
 * @param {object[]} principals
 * @param {(actorId: string) => string} [displayNameForActor]
 * @returns {{ handle: string, actorId: string, displayLabel: string }[]}
 */
export function agentHandlesFromPrincipals(principals, displayNameForActor) {
  const resolve =
    typeof displayNameForActor === "function" ? displayNameForActor : () => "";
  const rows = [];
  for (const p of principals ?? []) {
    if (String(p?.principal_kind ?? "") !== "agent" || p?.revoked) {
      continue;
    }
    const handle = String(p?.username ?? "").trim();
    if (!handle) {
      continue;
    }
    const actorId = String(p?.actor_id ?? "").trim();
    const dn = actorId ? resolve(actorId) : "";
    rows.push({
      handle,
      actorId,
      displayLabel: dn || handle,
    });
  }
  rows.sort((a, b) => a.handle.localeCompare(b.handle));
  return rows;
}
