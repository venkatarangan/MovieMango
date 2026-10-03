/**
 * Google Identity Services (GIS) token flow, entirely in the browser. We ask only for:
 *  - drive.appdata: a hidden, app-private folder in the user's own Drive (MovieMango can't see any other file)
 *  - openid + email: to show which account is connected
 * Access tokens last about an hour. A new one needs a popup, so it must start from a user action.
 */
export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
export const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata openid email';

export const driveConfigured = () => !!CLIENT_ID;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
          hasGrantedAllScopes?(r: TokenResponse, ...scopes: string[]): boolean;
        };
      };
    };
  }
}

let gisLoading: Promise<void> | null = null;

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error('Couldn’t load Google sign-in. Check your connection or ad blocker.'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export interface AccessToken {
  token: string;
  expiresAt: number;
}

const STORE = 'mm.driveToken';

/** Keeps the short-lived token for this tab only, so a reload within the hour doesn't need another popup. */
export function storedToken(): AccessToken | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(STORE) ?? 'null') as AccessToken | null;
    return t && t.expiresAt > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

function storeToken(t: AccessToken | null) {
  try {
    if (t) sessionStorage.setItem(STORE, JSON.stringify(t));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* storage unavailable */
  }
}

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public kind: 'cancelled' | 'denied' | 'popup' | 'other' = 'other',
  ) {
    super(message);
  }
}

/**
 * Opens Google's sign-in/consent popup. Call it from a click handler.
 * `fresh` shows the account chooser (first connect); otherwise Google reuses the earlier consent.
 */
export async function requestToken(opts: { fresh?: boolean; hint?: string } = {}): Promise<AccessToken> {
  if (!CLIENT_ID) throw new GoogleAuthError('Google Drive isn’t configured in this build.');
  await loadGis();
  const oauth2 = window.google!.accounts!.oauth2!;
  return new Promise<AccessToken>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPES,
      callback: (r) => {
        if (r.error || !r.access_token) {
          return reject(new GoogleAuthError(r.error === 'access_denied' ? 'You didn’t allow access to Google Drive.' : (r.error_description ?? r.error ?? 'Google sign-in failed.'), r.error === 'access_denied' ? 'denied' : 'other'));
        }
        if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(r, 'https://www.googleapis.com/auth/drive.appdata')) {
          return reject(new GoogleAuthError('MovieMango needs permission to use its own app folder in your Drive. Please tick that box.', 'denied'));
        }
        const t = { token: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
        storeToken(t);
        resolve(t);
      },
      error_callback: (e) =>
        reject(
          new GoogleAuthError(
            e.type === 'popup_closed' ? 'The Google window was closed before signing in.' : e.type === 'popup_failed_to_open' ? 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.' : (e.message ?? 'Google sign-in failed.'),
            e.type === 'popup_closed' ? 'cancelled' : e.type === 'popup_failed_to_open' ? 'popup' : 'other',
          ),
        ),
    });
    client.requestAccessToken({ prompt: opts.fresh ? 'select_account' : '', login_hint: opts.hint || undefined });
  });
}

export async function fetchEmail(token: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return '';
  const body = (await res.json()) as { email?: string };
  return body.email ?? '';
}

export async function revokeToken(token?: string) {
  storeToken(null);
  if (!token) return;
  try {
    await loadGis();
    window.google?.accounts?.oauth2?.revoke(token);
  } catch {
    /* best effort */
  }
}

export function forgetToken() {
  storeToken(null);
}
