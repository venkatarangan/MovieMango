import { describe, expect, it } from 'vitest';
import { decodeEntities, matchesTitle, normaliseTitle, parseReviewTitle } from '../src/api/mangoidiots';

describe('Mangoidiots title matching', () => {
  it('parses "Title (Year), tagline"', () => {
    expect(parseReviewTitle('Jailer (2023), nothing special to see here')).toEqual({ name: 'Jailer', year: 2023 });
    expect(parseReviewTitle('Vettaiyan (2024): Encounter Drama Misfires')).toEqual({ name: 'Vettaiyan', year: 2024 });
    expect(parseReviewTitle('Dune &#8211; Part Two (2024), sand')).toEqual({ name: 'Dune – Part Two', year: 2024 });
  });

  it('normalises punctuation, accents and articles', () => {
    expect(normaliseTitle('The Lord of the Rings: The Return of the King')).toBe('lord of the rings the return of the king');
    expect(normaliseTitle('Amélie')).toBe('amelie');
    expect(decodeEntities('Tom &amp; Jerry &#8217;s')).toBe('Tom & Jerry ’s');
  });

  it('requires the same title and a close year', () => {
    expect(matchesTitle('Jailer (2023), nothing special', ['Jailer'], 2023)).toBe(true);
    expect(matchesTitle('Jailer (2023), nothing special', ['Jailer'], 2025)).toBe(false);
    expect(matchesTitle('Jananayagan (2026), Politics', ['Jailer'], 2026)).toBe(false);
    expect(matchesTitle('Vikram (2022), x', ['Vikram', 'விக்ரம்'], 2022)).toBe(true);
  });
});
