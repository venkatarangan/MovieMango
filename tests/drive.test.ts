import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffMs, DriveError, getFileMeta, retryable, uploadJson } from '../src/sync/drive';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const rateLimited = () => json(403, { error: { message: 'User rate limit exceeded', errors: [{ reason: 'userRateLimitExceeded' }] } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Drive retries', () => {
  it('retries rate limits and server errors only', () => {
    expect(retryable(429)).toBe(true);
    expect(retryable(503)).toBe(true);
    expect(retryable(403, 'userRateLimitExceeded')).toBe(true);
    expect(retryable(403, 'rateLimitExceeded')).toBe(true);
    expect(retryable(403, 'insufficientPermissions')).toBe(false);
    expect(retryable(401)).toBe(false);
    expect(retryable(404)).toBe(false);
  });

  it('backs off exponentially with jitter, capped', () => {
    expect(backoffMs(0, 0)).toBe(1000);
    expect(backoffMs(3, 1)).toBe(9000);
    expect(backoffMs(10, 0)).toBe(32_000);
  });

  it('waits and retries after a rate limit, then succeeds', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(json(429, {}, { 'Retry-After': '3' })).mockResolvedValueOnce(json(200, { id: 'f1', modifiedTime: 't1' }));
    vi.stubGlobal('fetch', fetch);
    const meta = getFileMeta('tok', 'f1');
    await vi.advanceTimersByTimeAsync(2000); // first backoff (1–2 s)
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000); // Retry-After: 3
    await expect(meta).resolves.toEqual({ id: 'f1', modifiedTime: 't1' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after five tries, and never retries other errors', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => json(500, { error: { message: 'Backend Error' } }));
    vi.stubGlobal('fetch', fetch);
    const meta = getFileMeta('tok', 'f1');
    const failed = expect(meta).rejects.toBeInstanceOf(DriveError);
    await vi.advanceTimersByTimeAsync(60_000);
    await failed;
    expect(fetch).toHaveBeenCalledTimes(5);

    fetch.mockClear().mockImplementation(async () => json(403, { error: { message: 'Forbidden', errors: [{ reason: 'insufficientPermissions' }] } }));
    await expect(getFileMeta('tok', 'f1')).rejects.toThrow('Forbidden');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a missing file as null and returns the new modifiedTime after an upload', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(404, { error: { message: 'File not found' } })).mockResolvedValueOnce(json(200, { id: 'f1', modifiedTime: 't2' }));
    vi.stubGlobal('fetch', fetch);
    expect(await getFileMeta('tok', 'gone')).toBeNull();
    expect(await uploadJson('tok', { a: 1 }, 'f1', { keepalive: true })).toEqual({ id: 'f1', modifiedTime: 't2' });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toContain('fields=id,modifiedTime');
    expect(init.keepalive).toBe(true);
  });
});
