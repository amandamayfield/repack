// packed / total across a flat item list. Empty list -> {packed: 0, total: 0},
// which the progress components render as 0% (no divide-by-zero).
export function computeProgress(items) {
  const list = items ?? [];
  return {
    packed: list.filter((i) => i.packed).length,
    total: list.length,
  };
}
