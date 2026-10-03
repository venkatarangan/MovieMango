import { describe, expect, it } from 'vitest';
import { chooseEngine, type EngineStatus } from '../src/ai/engine';
import { extractJson, rerank } from '../src/ai/tasks';
import type { AiEngine } from '../src/ai/types';

const status = (p: Partial<{ nano: EngineStatus['nano']; qwenSupported: boolean; qwenCached: boolean; key: boolean }>): EngineStatus => ({
  nano: p.nano ?? 'unavailable',
  qwen: { supported: p.qwenSupported ?? false, cached: p.qwenCached ?? false, modelId: 'Qwen3-1.7B-q4f16_1-MLC' },
  gemini: { hasKey: p.key ?? false },
});

describe('engine choice', () => {
  it('auto prefers Nano, then cached Qwen, then Gemini', () => {
    expect(chooseEngine('auto', status({ nano: 'available', key: true })).id).toBe('nano');
    expect(chooseEngine('auto', status({ qwenSupported: true, qwenCached: true, key: true })).id).toBe('qwen');
    expect(chooseEngine('auto', status({ key: true })).id).toBe('gemini');
  });

  it('never downloads silently: offers actions instead', () => {
    const c = chooseEngine('auto', status({ nano: 'downloadable', qwenSupported: true }));
    expect(c.id).toBeNull();
    expect(c.actions).toEqual(['nano-download', 'qwen-download', 'gemini-key']);
  });

  it('uses Basic only when chosen', () => {
    expect(chooseEngine('basic', status({ nano: 'available' })).id).toBe('basic');
    expect(chooseEngine('auto', status({})).id).toBeNull();
  });

  it('honours an explicit choice or says what is needed', () => {
    expect(chooseEngine('gemini', status({ nano: 'available', key: true })).id).toBe('gemini');
    const c = chooseEngine('gemini', status({ nano: 'available' }));
    expect(c.id).toBeNull();
    expect(c.actions).toEqual(['gemini-key']);
  });
});

describe('AI output handling', () => {
  it('extracts JSON wrapped in prose, fences or think tags', () => {
    expect(extractJson('<think>hmm</think>```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"picks":[]} hope that helps')).toEqual({ picks: [] });
  });

  it('keeps only real, unique candidate numbers', async () => {
    const fake: AiEngine = {
      id: 'gemini',
      label: 'fake',
      generateJson: async () => JSON.stringify({ picks: [{ n: 2, why: 'a' }, { n: 99, why: 'invented' }, { n: 2, why: 'dupe' }, { n: '1', why: 'b' }] }),
    };
    const picks = await rerank(fake, 'ctx', [{ n: 1, line: 'A' }, { n: 2, line: 'B' }], 6);
    expect(picks).toEqual([{ n: 2, why: 'a' }, { n: 1, why: 'b' }]);
  });
});
