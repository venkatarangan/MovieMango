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

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let message = `Google Drive error ${res.status}`;
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new DriveError(res.status, message);
  }
  return res;
}

export async function findSyncFile(token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name = '${SYNC_FILE}' and trashed = false`);
  const res = await call(token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`);
  const body = (await res.json()) as { files: { id: string; modifiedTime: string }[] };
  return body.files[0] ?? null;
}

export async function downloadJson<T>(token: string, id: string): Promise<T> {
  const res = await call(token, `${API}/files/${id}?alt=media`);
  return (await res.json()) as T;
}

export async function uploadJson(token: string, data: unknown, id?: string): Promise<string> {
  const json = JSON.stringify(data);
  if (id) {
    await call(token, `${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
    return id;
  }
  const boundary = `mm${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  return ((await res.json()) as { id: string }).id;
}
