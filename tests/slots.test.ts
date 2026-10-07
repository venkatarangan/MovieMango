import { describe, expect, it } from 'vitest';
import { fillSlots } from '../src/lib/slots';

describe('row slots', () => {
  const keys = ['a', 'b', 'c', 'd', 'e'];

  it('fills with the first titles that aren’t hidden', () => {
    expect(fillSlots([], keys, new Set(['b']), 3).shown).toEqual(['a', 'c', 'd']);
  });

  it('replaces a hidden title in its own slot, and Undo brings it back', () => {
    const first = fillSlots([], keys, new Set(), 3);
    expect(first.shown).toEqual(['a', 'b', 'c']);
    const saved = fillSlots(first.slots, keys, new Set(['b']), 3);
    expect(saved.shown).toEqual(['a', 'd', 'c']);
    const undone = fillSlots(saved.slots, keys, new Set(), 3);
    expect(undone.shown).toEqual(['a', 'b', 'c']);
    // Hiding two more uses up the rest, and the row shrinks when nothing is left.
    expect(fillSlots(undone.slots, keys, new Set(['a', 'b', 'c']), 3).shown).toEqual(['e', 'd']);
  });
});
