import { safeUrl } from './custom';
import { MAX_LINK_LENGTH, MAX_NOTES_BYTES } from './types';

/** The user's own watch link and notes on a saved title (UserItem.watchLink / .notes). */

const encoder = new TextEncoder();
export const utf8Bytes = (s: string) => encoder.encode(s).length;

/** Cuts text to fit `max` UTF-8 bytes without splitting a character. */
export function clampBytes(s: string, max = MAX_NOTES_BYTES): string {
  if (utf8Bytes(s) <= max) return s;
  let out = '';
  let used = 0;
  for (const ch of s) {
    const n = utf8Bytes(ch);
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** A plain http(s) link no longer than MAX_LINK_LENGTH, or undefined. Adds https:// when missing. */
export function cleanWatchLink(raw?: string): string | undefined {
  const url = safeUrl(raw);
  return url && url.length <= MAX_LINK_LENGTH ? url : undefined;
}

/** Notes trimmed and capped, or undefined when empty. */
export function cleanNotes(raw?: string): string | undefined {
  const s = clampBytes((raw ?? '').replace(/\r\n?/g, '\n').trim());
  return s || undefined;
}

/** "youtube.com" for https://www.youtube.com/watch?v=… */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
