import { languageCode } from './languages';

/** "1990s", "'90s" or "2019" → a date range. */
export function parseYear(word: string): { from: number; to: number } | undefined {
  const w = word.trim().toLowerCase();
  const year = w.match(/^((?:18|19|20)\d\d)$/);
  if (year) return { from: Number(year[1]), to: Number(year[1]) };
  const decade = w.match(/^((?:18|19|20)\d)0s$/) ?? w.match(/^[’']?(\d)0s$/);
  if (decade) {
    const start = decade[1].length === 3 ? Number(decade[1]) * 10 : (Number(decade[1]) >= 3 ? 1900 : 2000) + Number(decade[1]) * 10;
    return { from: start, to: start + 9 };
  }
  return undefined;
}

/** Splits typed text into a year or decade, a language, and the words left over (a theme). */
export function parseFilterText(text: string): { year?: string; lang?: string; theme?: string } {
  const out: { year?: string; lang?: string; theme?: string } = {};
  const rest: string[] = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const lang = languageCode(word);
    if (!out.year && parseYear(word)) out.year = word.toLowerCase();
    else if (!out.lang && lang) out.lang = lang;
    else rest.push(word);
  }
  if (rest.length) out.theme = rest.join(' ');
  return out;
}
