/**
 * Keeps a row's visible titles in place. Each slot remembers the titles it has shown, oldest
 * first, and shows the oldest one that isn't hidden: when a title becomes hidden (saved, watched,
 * 👎) the next unused candidate takes its slot, and if that's undone the original comes back.
 * The other slots don't move. Keys in, keys out.
 */
export function fillSlots(prev: string[][], candidates: string[], hidden: Set<string>, size: number): { slots: string[][]; shown: string[] } {
  const valid = new Set(candidates);
  const slots = prev.slice(0, size).map((h) => h.filter((k) => valid.has(k)));
  const reserved = new Set(slots.flat());
  const pool = candidates.filter((k) => !hidden.has(k) && !reserved.has(k));
  for (let i = 0; i < size; i++) {
    const history = (slots[i] ??= []);
    if (!history.some((k) => !hidden.has(k))) {
      const next = pool.shift();
      if (next) history.push(next);
    }
  }
  const shown = slots.map((h) => h.find((k) => !hidden.has(k))).filter((k): k is string => !!k);
  return { slots, shown };
}
