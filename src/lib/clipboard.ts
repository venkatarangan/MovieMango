/**
 * "Search what I copied": decide whether clipboard text looks like a movie or TV title, and read it.
 * The text is only ever used as a TMDB search, on this device; it is never stored (only a hash, so the
 * same text isn't offered again and again) and never sent to analytics.
 */

const MAX_LEN = 100;
const SAME_TEXT_QUIET_MS = 30 * 60_000;

/** The text to search for, or null when the clipboard doesn't look like a title. */
export function clipboardQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > MAX_LEN) return null;
  // Several lines of prose, a list, code or JSON are not a title.
  if ((raw.trim().match(/\n/g)?.length ?? 0) > 1) return null;
  if (/^[{[<]/.test(text)) return null;
  // Links and email addresses (a shared link is not a title; the Import page handles lists).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^www\./i.test(text) || /\S+@\S+\.\S+/.test(text)) return null;
  // One long unbroken string is much more likely a key, token or password than a title.
  if (!/\s/.test(text) && (text.length > 24 || (text.length >= 16 && /\d/.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text)))) return null;
  // Titles in any script (Tamil, Hindi…) have letters; only a bare four-digit number such as "1917" is allowed without.
  if (!/\p{L}/u.test(text)) return /^\d{4}$/.test(text) ? text : null;
  const digits = (text.match(/\d/g) ?? []).length;
  if (digits > 8 && digits / text.length > 0.4) return null;
  return text;
}

/** Small, fast, non-cryptographic hash (FNV-1a) of the normalised text. */
export function clipboardHash(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** True when this exact text was already offered a moment ago. */
export function recentlyOffered(text: string, last: { hash: string; at: number }, now = Date.now()): boolean {
  return !!last.hash && last.hash === clipboardHash(text) && now - last.at < SAME_TEXT_QUIET_MS;
}

export type ClipboardRead = { ok: true; text: string } | { ok: false; reason: 'unsupported' | 'blocked' | 'empty' };

/**
 * Reads clipboard text. Android Chrome allows this at launch once the user has said yes; iPhone and
 * iPad only allow it right after a tap (and show their own "Paste" button), so callers pass the tap.
 */
export async function readClipboardText(): Promise<ClipboardRead> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return { ok: false, reason: 'unsupported' };
  try {
    const text = await navigator.clipboard.readText();
    return text?.trim() ? { ok: true, text } : { ok: false, reason: 'empty' };
  } catch {
    return { ok: false, reason: 'blocked' };
  }
}
