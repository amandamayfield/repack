export const UNCATEGORIZED = "Uncategorized";

// packed / total across a flat item list. Empty list -> {packed: 0, total: 0},
// which the ProgressBar renders as 0% (no divide-by-zero).
export function computeProgress(items) {
  const list = items ?? [];
  return {
    packed: list.filter((i) => i.packed).length,
    total: list.length,
  };
}

// Group items by their category *name*. Items carry `category` as a nullable id,
// so we resolve names from the categories list. A null category — or an id that
// isn't in the categories list (e.g. deleted mid-session) — falls back to
// "Uncategorized" rather than crashing. Item order within a group is preserved
// (the server already sorts items by `order`).
export function groupByCategory(items, categories) {
  const nameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const groups = new Map(); // name -> { name, items: [] }

  for (const item of items ?? []) {
    const name =
      (item.category != null && nameById.get(item.category)) || UNCATEGORIZED;
    if (!groups.has(name)) groups.set(name, { name, items: [] });
    groups.get(name).items.push(item);
  }

  return [...groups.values()];
}
