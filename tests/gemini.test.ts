import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiTimeoutError, validateGeminiKey } from '../src/ai/gemini';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Gemini key check', () => {
  it('gives up with a timeout error when Google is slow, so setup can offer to skip AI', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const check = validateGeminiKey('AIza-test-key-0123456789', 5000);
    const result = expect(check).rejects.toBeInstanceOf(GeminiTimeoutError);
    await vi.advanceTimersByTimeAsync(5001);
    await result;
  });

  it('says false for a rejected key and true for a good one', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    expect(await validateGeminiKey('bad-key-bad-key-bad-key')).toBe(false);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ models: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect(await validateGeminiKey('good-key-good-key-good')).toBe(true);
  });
});
