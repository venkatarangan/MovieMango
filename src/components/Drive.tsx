import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';
import CloudSyncRoundedIcon from '@mui/icons-material/CloudSyncRounded';
import { Alert, Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, Switch, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import { saveSettings, useSettings } from '../db/settings';
import { driveConfigured } from '../sync/google';
import { connectDrive, disconnectDrive, reconnectDrive, syncNow, useSyncState } from '../sync/sync';
import { useToast } from './Toast';

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Google-branded sign-in button: white surface, Google "G", standard wording. */
export function GoogleSignInButton({ onClick, busy, label = 'Sign in with Google' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <Button
      onClick={onClick}
      disabled={busy}
      startIcon={busy ? <CircularProgress size={18} /> : <GoogleG />}
      variant="outlined"
      sx={{ bgcolor: '#fff', color: '#1F1F1F', borderColor: '#747775', px: 2.5, py: 1.1, fontFamily: 'Roboto, "Inter Variable", sans-serif', fontWeight: 500, '&:hover': { bgcolor: '#F8F9FA', borderColor: '#747775' } }}
    >
      {label}
    </Button>
  );
}

const ago = (t: number) => {
  if (!t) return 'not yet';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Small cloud icon in the header showing sync state; tap to reconnect or retry. */
export function SyncIndicator() {
  const sync = useSyncState();
  const settings = useSettings();
  const toast = useToast();
  if (sync.status === 'off') return null;
  if (sync.status === 'needs-auth')
    return (
      <Chip
        size="small"
        color="warning"
        icon={<CloudOffRoundedIcon />}
        label="Reconnect Drive"
        onClick={() => reconnectDrive().then(() => toast('Synced with Google Drive')).catch((e: Error) => toast(e.message, 'error'))}
      />
    );
  const manualPending = sync.status === 'pending' && settings?.driveAutoSync === false;
  const busy = sync.status === 'syncing' || (sync.status === 'pending' && !manualPending);
  const title =
    sync.status === 'error'
      ? `Sync problem: ${sync.error}. Tap to retry.`
      : manualPending
        ? 'Changes not synced yet. Tap to sync with Google Drive.'
        : sync.status === 'pending'
          ? 'Changes will be saved to Google Drive within 2 minutes. Tap to sync now.'
          : busy
            ? 'Syncing with Google Drive…'
            : `Synced with Google Drive ${ago(sync.lastSyncAt)}`;
  return (
    <Tooltip title={title}>
      <IconButton size="small" onClick={() => void syncNow()} aria-label={title} color={sync.status === 'error' ? 'error' : 'inherit'}>
        {sync.status === 'error' ? (
          <CloudOffRoundedIcon fontSize="small" />
        ) : manualPending ? (
          <CloudSyncRoundedIcon fontSize="small" sx={{ color: 'warning.main' }} />
        ) : busy ? (
          <CloudSyncRoundedIcon fontSize="small" sx={{ opacity: 0.7 }} />
        ) : (
          <CloudDoneRoundedIcon fontSize="small" sx={{ color: 'success.main' }} />
        )}
      </IconButton>
    </Tooltip>
  );
}

function SyncOptions() {
  const settings = useSettings();
  if (!settings) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <FormControlLabel
        control={<Switch checked={settings.driveAutoSync} onChange={(e) => saveSettings({ driveAutoSync: e.target.checked }).then(() => (e.target.checked ? syncNow() : undefined))} />}
        label="Sync automatically"
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 6, mt: -0.5, mb: 1 }}>
        On: changes are gathered and saved to Drive within 2 minutes, and right away when you leave the app. Off: only when you tap Sync now (the cloud icon turns orange when there’s something to sync).
      </Typography>
      <FormControlLabel
        control={<Switch checked={settings.driveSyncKeys} onChange={(e) => saveSettings({ driveSyncKeys: e.target.checked }).then(() => syncNow())} />}
        label="Include my TMDB and Gemini keys"
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 6, mt: -0.5 }}>
        Handy: a new phone or laptop picks up your keys when you sign in. Off: keys stay on this device only, and any copy in Drive is removed.
      </Typography>
    </Box>
  );
}

/** Settings panel for Google Drive backup and sync. */
export function DriveCard() {
  const settings = useSettings();
  const sync = useSyncState();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!settings) return null;

  if (!driveConfigured())
    return (
      <Typography variant="body2" color="text.secondary">
        Google Drive sync isn’t configured in this build. (Developers: set <code>VITE_GOOGLE_CLIENT_ID</code>; see the README.)
      </Typography>
    );

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Keep your lists, ratings, taste portrait and keys safe, and in sync between your phone and computer. MovieMango keeps one file in a hidden app folder in <b>your own</b> Google Drive and can’t see anything else there.
      </Typography>
      {settings.driveConnected ? (
        <>
          <Alert severity={sync.status === 'error' ? 'error' : sync.status === 'needs-auth' ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
            {sync.status === 'needs-auth'
              ? `Connected as ${settings.driveEmail || 'your Google account'}, but Google needs you to sign in again to keep syncing.`
              : sync.status === 'error'
                ? `Sync problem: ${sync.error}`
                : `Connected as ${settings.driveEmail || 'your Google account'} · last synced ${ago(sync.lastSyncAt || settings.lastSyncAt)}`}
          </Alert>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {sync.status === 'needs-auth' ? (
              <GoogleSignInButton busy={busy} label="Sign in again" onClick={() => act(reconnectDrive, 'Synced with Google Drive')} />
            ) : (
              <Button variant="outlined" color="inherit" startIcon={busy || sync.status === 'syncing' ? <CircularProgress size={16} /> : <CloudSyncRoundedIcon />} disabled={busy} onClick={() => act(syncNow, 'Synced with Google Drive')}>
                Sync now
              </Button>
            )}
            <Button color="inherit" disabled={busy} onClick={() => act(disconnectDrive, 'Disconnected from Google Drive')}>
              Disconnect
            </Button>
          </Box>
          <SyncOptions />
        </>
      ) : (
        <GoogleSignInButton busy={busy} onClick={() => act(() => connectDrive({ fresh: true }), 'Connected to Google Drive')} />
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Box>
  );
}
