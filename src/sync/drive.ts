/** Minimal Drive v3 client for one JSON file in the hidden appDataFolder. */
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const SYNC_FILE = 'moviemango-sync.json';

export class DriveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Rate limits and server errors worth retrying (Google's guidance for the Drive API). */
const RETRY_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'];
export const retryable = (status: number, reason?: string) => status === 429 || status >= 500 || (status === 403 && !!reason && RETRY_REASONS.includes(reason));

const MAX_TRIES = 5;
/** Exponential backoff with jitter: about 1 s, 2 s, 4 s, 8 s (+ up to 1 s random), capped at 32 s. */
export const backoffMs = (attempt: number, random = Math.random()) => Math.min(2 ** attempt * 1000 + Math.round(random * 1000), 32_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(token: string, url: string, init: RequestInit = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (res.ok) return res;
    let message = `Google Drive error ${res.status}`;
    let reason: string | undefined;
    try {
      const err = ((await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } }).error;
      message = err?.message ?? message;
      reason = err?.errors?.[0]?.reason;
    } catch {
      /* not JSON */
    }
    if (attempt + 1 >= MAX_TRIES || !retryable(res.status, reason)) throw new DriveError(res.status, message);
    const retryAfter = Number(res.headers.get('Retry-After'));
    await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : backoffMs(attempt));
  }
}

export interface DriveFile {
  id: string;
  modifiedTime: string;
}

export async function findSyncFile(token: string): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name = '${SYNC_FILE}' and trashed = false`);
  const res = await call(token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`);
  const body = (await res.json()) as { files: DriveFile[] };
  return body.files[0] ?? null;
}

/** The file's id and last change time, or null if it's gone. One small call. */
export async function getFileMeta(token: string, id: string): Promise<DriveFile | null> {
  try {
    return (await (await call(token, `${API}/files/${id}?fields=id,modifiedTime`)).json()) as DriveFile;
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) return null;
    throw e;
  }
}

export async function downloadJson<T>(token: string, id: string): Promise<T> {
  const res = await call(token, `${API}/files/${id}?alt=media`);
  return (await res.json()) as T;
}

/**
 * Creates or replaces the sync file. `keepalive` lets a small upload finish while the page closes
 * (browsers cap keepalive bodies at 64 KB, so bigger ones go without it).
 */
export async function uploadJson(token: string, data: unknown, id?: string, opts: { keepalive?: boolean } = {}): Promise<DriveFile> {
  const json = JSON.stringify(data);
  const keepalive = !!opts.keepalive && json.length < 60_000;
  if (id) {
    const res = await call(token, `${UPLOAD}/files/${id}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json, keepalive });
    return (await res.json()) as DriveFile;
  }
  const boundary = `mm${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  return (await res.json()) as DriveFile;
}
