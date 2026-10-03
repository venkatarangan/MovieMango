import type { AiEngine, ProgressFn } from './types';

const EXPECT = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

export async function nanoAvailability(): Promise<LanguageModelAvailability> {
  const LM = globalThis.LanguageModel;
  if (!LM) return 'unavailable';
  try {
    return await LM.availability(EXPECT);
  } catch {
    return 'unavailable';
  }
}

/** Triggers (or resumes) Chrome's one-time model download. Must be called from a user gesture. */
export async function downloadNano(onProgress?: ProgressFn): Promise<void> {
  const LM = globalThis.LanguageModel;
  if (!LM) throw new Error('This browser has no built-in AI.');
  const session = await LM.create({
    ...EXPECT,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.({ text: 'Downloading Gemini Nano (one time)…', progress: e.loaded }));
    },
  });
  session.destroy();
}

export function nanoEngine(): AiEngine {
  return {
    id: 'nano',
    label: 'Gemini Nano',
    async generateJson(system, user, schema, opts) {
      const LM = globalThis.LanguageModel;
      if (!LM) throw new Error('Gemini Nano is not available in this browser.');
      const session = await LM.create({ ...EXPECT, initialPrompts: [{ role: 'system', content: system }], signal: opts?.signal });
      try {
        return await session.prompt(user, { responseConstraint: schema, signal: opts?.signal });
      } finally {
        session.destroy();
      }
    },
  };
}
