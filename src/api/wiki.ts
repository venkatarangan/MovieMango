import { cached, DAY, getJson, HOUR } from './http';

const UA = { 'Api-User-Agent': 'MovieMango/0.1 (https://watch.mangoidiots.com)' };

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

/** English Wikipedia summary for a Wikidata item (TMDB gives us the Wikidata ID). */
export function wikiSummaryForWikidata(qid: string): Promise<WikiSummary | null> {
  return cached(`wiki:${qid}`, 7 * DAY, async () => {
    const entity = await getJson<{ entities: Record<string, { sitelinks?: { enwiki?: { title: string } } }> }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`,
    );
    const title = entity.entities[qid]?.sitelinks?.enwiki?.title;
    if (!title) return null;
    const s = await getJson<{ title: string; extract: string; content_urls?: { desktop?: { page?: string } } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { headers: UA },
    );
    return { title: s.title, extract: s.extract, url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  });
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Today's "In the news" headlines from Wikipedia, used (opt-in) as light context for the day's mood. */
export function newsHeadlines(date = new Date()): Promise<string[]> {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return cached(`news:${y}${m}${d}`, 3 * HOUR, async () => {
    const feed = await getJson<{ news?: { story: string }[] }>(`https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`, { headers: UA });
    return (feed.news ?? []).slice(0, 5).map((n) => stripHtml(n.story));
  });
}
