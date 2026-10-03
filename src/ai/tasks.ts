import { z } from 'zod';
import type { AiEngine, JsonSchema } from './types';

/** Pulls the first JSON object out of a model reply (small models sometimes wrap it in prose or fences). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('The AI reply was not valid JSON.');
  }
}

async function ask<T>(engine: AiEngine, system: string, user: string, schema: JsonSchema, parser: z.ZodType<T>, temperature?: number): Promise<T> {
  const text = await engine.generateJson(system, user, schema, { temperature });
  return parser.parse(extractJson(text));
}

const PERSONA =
  'You are MovieMango, a warm, witty movie and TV expert for a viewer in India. You know Indian cinema (Tamil, Hindi, Malayalam, Telugu and more) and world cinema well. Be concise and specific; no spoilers.';

// ---- Re-rank -------------------------------------------------------------

export interface RerankCandidate {
  n: number;
  line: string;
}

const RERANK_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, why: { type: 'string' } },
        required: ['n', 'why'],
      },
    },
  },
  required: ['picks'],
};

const rerankParser = z.object({ picks: z.array(z.object({ n: z.coerce.number().int(), why: z.string() })) });

/**
 * Asks the model to choose and explain picks. Only candidate numbers are accepted, so the model
 * can't invent titles; anything else is dropped.
 */
export async function rerank(engine: AiEngine, context: string, candidates: RerankCandidate[], count: number) {
  const system = `${PERSONA}
Choose the ${count} best titles for this viewer right now, ONLY from the numbered CANDIDATES.
Put the best first. Make the last one a bolder "wild card" if a good one exists.
For each, write "why": one friendly sentence (max 25 words) tying it to their taste, mood and time.
Reply as JSON: {"picks":[{"n":<candidate number>,"why":"..."}]}`;
  const user = `${context}

CANDIDATES (n | title | type | runtime | language | genres | where | note | overview):
${candidates.map((c) => `${c.n} | ${c.line}`).join('\n')}`;
  const result = await ask(engine, system, user, RERANK_SCHEMA, rerankParser, 0.6);
  const valid = new Set(candidates.map((c) => c.n));
  const seen = new Set<number>();
  return result.picks.filter((p) => valid.has(p.n) && !seen.has(p.n) && seen.add(p.n)).slice(0, count);
}

// ---- Free-text intent ----------------------------------------------------

export const intentParser = z.object({
  minutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(180), z.literal('binge')]).nullish(),
  moodNow: z.enum(['tired', 'stressed', 'happy', 'bored', 'sad', 'curious']).nullish(),
  want: z.enum(['laugh', 'cry', 'thrill', 'think', 'comfort', 'wow']).nullish(),
  discovery: z.enum(['new', 'rewatch', 'surprise']).nullish(),
  audience: z.enum(['solo', 'partner', 'family', 'kids']).nullish(),
  type: z.enum(['movie', 'tv', 'either']).nullish(),
  languages: z.array(z.string()).nullish(),
  avoid: z.array(z.string()).nullish(),
  note: z.string().nullish(),
});

export type Intent = z.infer<typeof intentParser>;

const INTENT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    minutes: { enum: [30, 60, 120, 180, 'binge', null] },
    moodNow: { enum: ['tired', 'stressed', 'happy', 'bored', 'sad', 'curious', null] },
    want: { enum: ['laugh', 'cry', 'thrill', 'think', 'comfort', 'wow', null] },
    discovery: { enum: ['new', 'rewatch', 'surprise', null] },
    audience: { enum: ['solo', 'partner', 'family', 'kids', null] },
    type: { enum: ['movie', 'tv', 'either', null] },
    languages: { type: 'array', items: { type: 'string' } },
    avoid: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
};

export async function parseIntent(engine: AiEngine, text: string): Promise<Intent> {
  const system = `${PERSONA}
Turn the viewer's request into settings. Use null for anything they didn't say.
minutes: 30, 60, 120, 180 or "binge" (round to the nearest). languages: ISO 639-1 codes (Tamil "ta", Hindi "hi", English "en", Malayalam "ml", Telugu "te", Korean "ko").
avoid: genres or themes they don't want. note: anything else that matters, in a few words.
Reply as JSON only.`;
  return ask(engine, system, text, INTENT_SCHEMA, intentParser, 0.1);
}

// ---- Taste portrait --------------------------------------------------------

const PORTRAIT_SCHEMA: JsonSchema = { type: 'object', properties: { portrait: { type: 'string' } }, required: ['portrait'] };

export async function writePortrait(engine: AiEngine, summary: string): Promise<string> {
  const system = `${PERSONA}
Write a short "taste portrait" of this viewer in second person ("You love…"), 2–3 sentences, max 60 words, from their saved titles and ratings. Be specific about genres, languages, eras and tone. Reply as JSON: {"portrait":"..."}`;
  const r = await ask(engine, system, summary, PORTRAIT_SCHEMA, z.object({ portrait: z.string() }), 0.7);
  return r.portrait.trim();
}

// ---- Review summary --------------------------------------------------------

const SUMMARY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { points: { type: 'array', items: { type: 'string' } } },
  required: ['points'],
};

export async function summariseReview(engine: AiEngine, title: string, reviewText: string): Promise<string[]> {
  const system = `${PERSONA}
Summarise this Mangoidiots review of "${title}" in exactly 3 short bullet points (max 20 words each), keeping the reviewer's verdict and tone. No spoilers. Reply as JSON: {"points":["...","...","..."]}`;
  const r = await ask(engine, system, reviewText.slice(0, 6000), SUMMARY_SCHEMA, z.object({ points: z.array(z.string()) }), 0.3);
  return r.points.slice(0, 3);
}
