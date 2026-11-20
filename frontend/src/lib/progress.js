// packed / total across a flat item list. Empty list -> {packed: 0, total: 0},
// which the progress components render as 0% (no divide-by-zero).
// Items count by name, ignoring case, like the server's counts: the same thing in
// two sections is one thing to pack, and it's packed once every copy is.
export function computeProgress(items) {
  const packedByName = new Map();
  for (const item of items ?? []) {
    const key = item.name.toLowerCase();
    packedByName.set(key, (packedByName.get(key) ?? true) && item.packed);
  }
  const states = [...packedByName.values()];
  return { packed: states.filter(Boolean).length, total: states.length };
}
