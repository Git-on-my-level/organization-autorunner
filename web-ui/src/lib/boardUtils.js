export const BOARD_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};

export const CANONICAL_BOARD_COLUMNS = [
  { key: "backlog", title: "Backlog" },
  { key: "ready", title: "Ready" },
  { key: "in_progress", title: "In Progress" },
  { key: "blocked", title: "Blocked" },
  { key: "review", title: "Review" },
  { key: "done", title: "Done" },
];

export const CANONICAL_BOARD_COLUMN_KEYS = CANONICAL_BOARD_COLUMNS.map(
  (column) => column.key,
);

export function createEmptyBoardColumnCounts() {
  return CANONICAL_BOARD_COLUMNS.reduce((counts, column) => {
    counts[column.key] = 0;
    return counts;
  }, {});
}

export function boardColumnTitle(columnKey, columnSchema = []) {
  const configured = (columnSchema ?? []).find(
    (column) => column?.key === columnKey,
  );
  if (configured?.title) {
    return configured.title;
  }

  const canonical = CANONICAL_BOARD_COLUMNS.find(
    (column) => column.key === columnKey,
  );
  return canonical?.title ?? columnKey;
}

export function boardSummaryCounts(summary) {
  const counts = createEmptyBoardColumnCounts();

  for (const [columnKey, count] of Object.entries(
    summary?.cards_by_column ?? {},
  )) {
    counts[columnKey] = Number(count ?? 0);
  }

  return counts;
}

export function groupBoardWorkspaceCards(cardsSection, columnSchema = []) {
  const groups = (columnSchema?.length ? columnSchema : CANONICAL_BOARD_COLUMNS)
    .map((column) => column.key)
    .reduce((acc, columnKey) => {
      acc[columnKey] = [];
      return acc;
    }, {});

  for (const item of cardsSection?.items ?? []) {
    const columnKey = String(item?.membership?.column_key ?? "").trim();
    if (!groups[columnKey]) {
      groups[columnKey] = [];
    }
    groups[columnKey].push(item);
  }

  return groups;
}

export function parseDelimitedValues(rawValue) {
  const seen = new Set();
  const values = [];

  for (const item of String(rawValue ?? "").split(/\r?\n|,/)) {
    const value = item.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    values.push(value);
  }

  return values;
}

export function joinDelimitedValues(items) {
  return (items ?? [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export function freshnessStatusLabel(status) {
  switch (String(status ?? "").trim()) {
    case "current":
      return "Current";
    case "pending":
      return "Pending refresh";
    case "error":
      return "Refresh error";
    case "missing":
      return "Not materialized";
    default:
      return "Unknown freshness";
  }
}

export function freshnessStatusTone(status) {
  switch (String(status ?? "").trim()) {
    case "current":
      return "text-emerald-300 bg-emerald-500/10";
    case "pending":
      return "text-amber-300 bg-amber-500/10";
    case "error":
      return "text-red-300 bg-red-500/10";
    case "missing":
      return "text-slate-300 bg-slate-500/10";
    default:
      return "text-[var(--ui-text-muted)] bg-[var(--ui-border)]";
  }
}

export function isFreshnessCurrent(freshness) {
  return String(freshness?.status ?? "").trim() === "current";
}
