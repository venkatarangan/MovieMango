import { getJson, HttpError } from '../api/http';
import type { AiEngine } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

/** Lists the Gemini text models this key can use. Also serves as a key check. */
export async function listGeminiModels(key: string): Promise<{ id: string; label: string }[]> {
  const data = await getJson<{ models: GeminiModel[] }>(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  return data.models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/embedding|image|tts|audio|live/.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }));
}

export async function validateGeminiKey(key: string): Promise<boolean> {
  try {
    await listGeminiModels(key.trim());
    return true;
  } catch (e) {
    if (e instanceof HttpError && (e.status === 400 || e.status === 401 || e.status === 403)) return false;
    throw e;
  }
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

export function geminiEngine(key: string, model: string): AiEngine {
  return {
    id: 'gemini',
    label: 'Gemini',
    async generateJson(system, user, schema, opts) {
      const body = (withSchema: boolean) =>
        JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: opts?.temperature ?? 0.7,
            responseMimeType: 'application/json',
            ...(withSchema ? { responseJsonSchema: schema } : {}),
          },
        });
      const call = (withSchema: boolean) =>
        getJson<GenerateResponse>(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: body(withSchema),
          signal: opts?.signal,
        });
      let res: GenerateResponse;
      try {
        res = await call(true);
      } catch (e) {
        // Older models reject responseJsonSchema; plain JSON mode still works with the schema in the prompt.
        if (e instanceof HttpError && e.status === 400) res = await call(false);
        else throw e;
      }
      if (res.promptFeedback?.blockReason) throw new Error(`Gemini declined: ${res.promptFeedback.blockReason}`);
      return res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    },
  };
}
