import { describe, expect, it } from 'vitest';
import { clipboardHash, clipboardQuery, recentlyOffered } from '../src/lib/clipboard';

describe('clipboard text → search', () => {
  it('accepts normal titles in any script', () => {
    expect(clipboardQuery('Dune: Part Two')).toBe('Dune: Part Two');
    expect(clipboardQuery('  The   Family Man \n')).toBe('The Family Man');
    expect(clipboardQuery('பொன்னியின் செல்வன்')).toBe('பொன்னியின் செல்வன்');
    expect(clipboardQuery('दंगल')).toBe('दंगल');
    expect(clipboardQuery('1917')).toBe('1917');
    expect(clipboardQuery('Se7en')).toBe('Se7en');
  });

  it('cleans shared snippets down to the title', () => {
    expect(clipboardQuery('Dune\nhttps://www.imdb.com/title/tt15239678/')).toBe('Dune');
    expect(clipboardQuery('https://www.imdb.com/title/tt15239678/\nDune')).toBe('Dune');
    expect(clipboardQuery('Dune: Part Two (2024)')).toBe('Dune: Part Two');
    expect(clipboardQuery('Dune - IMDb')).toBe('Dune');
    expect(clipboardQuery('“Dune”')).toBe('Dune');
    expect(clipboardQuery('RRR\n\nTelugu, 2022')).toBe('RRR');
    expect(clipboardQuery('Watch Dune https://netflix.com/title/1')).toBe('Watch Dune');
  });

  it('ignores empty, tiny and long text', () => {
    expect(clipboardQuery('')).toBeNull();
    expect(clipboardQuery(null)).toBeNull();
    expect(clipboardQuery('a')).toBeNull();
    expect(clipboardQuery('word '.repeat(30))).toBeNull();
  });

  it('ignores links, emails, code and multi-line text', () => {
    expect(clipboardQuery('https://www.imdb.com/title/tt0111161/')).toBeNull();
    expect(clipboardQuery('www.example.com')).toBeNull();
    expect(clipboardQuery('me@example.com')).toBeNull();
    expect(clipboardQuery('{"a":1}')).toBeNull();
    expect(clipboardQuery('line one\nline two\nline three')).toBeNull();
  });

  it('ignores things that look like keys, passwords or numbers', () => {
    expect(clipboardQuery('AIzaSyD3adbeefdeadbeef1234567890abcdef')).toBeNull();
    expect(clipboardQuery('eyJhbGciOiJIUzI1NiJ9')).toBeNull();
    expect(clipboardQuery('9876543210')).toBeNull();
    expect(clipboardQuery('4111 1111 1111 1111')).toBeNull();
    expect(clipboardQuery('12345')).toBeNull();
  });

  it('does not offer the same text again within 30 minutes', () => {
    const last = { hash: clipboardHash('Dune'), at: 1_000_000 };
    expect(recentlyOffered('dune', last, 1_000_000 + 60_000)).toBe(true);
    expect(recentlyOffered('Dune', last, 1_000_000 + 31 * 60_000)).toBe(false);
    expect(recentlyOffered('Arrival', last, 1_000_000 + 60_000)).toBe(false);
    expect(recentlyOffered('Dune', { hash: '', at: 0 }, 5)).toBe(false);
  });
});
