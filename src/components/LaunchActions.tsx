import ContentPasteSearchRoundedIcon from '@mui/icons-material/ContentPasteSearchRounded';
import { Box, Button, Paper, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { saveSettings, useSettings } from '../db/settings';
import { useToast } from './Toast';
import { trackEvent } from '../lib/analytics';
import { clipboardHash, clipboardQuery, readClipboardText, recentlyOffered } from '../lib/clipboard';
import { isInstalledPwa } from '../lib/pwa';

/**
 * What the card offers: a known title (Android could read the clipboard), or a box to paste into (iPhone and
 * iPad don't let a web app read the clipboard, but they always allow the user's own paste into a text field).
 */
type Offer = { kind: 'text'; text: string } | { kind: 'paste' };

/** Set once per app start, so a cold launch checks the clipboard once and resumes check again. */
let checkedAtStart = false;

/**
 * Installed app only. When the app opens or comes back to the front, offers to search for text found on the
 * clipboard. It never searches by itself and never interrupts: a small card with a button, which can be ignored.
 * Android Chrome lets us read the clipboard at launch (after a one-time permission), so the card shows the
 * text. iPhone and iPad refuse that, even after a tap, so the card shows a box: tap it, choose Paste, and the
 * search starts. That is the user's own paste, so it needs no permission.
 */
export default function LaunchActions() {
  const settings = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const [offer, setOffer] = useState<Offer | null>(null);
  const busy = useRef(false);
  const last = useRef({ hash: '', at: 0 });
  last.current = { hash: settings?.clipboardHash ?? '', at: settings?.clipboardAt ?? 0 };

  const active = !!settings?.onboarded && !!settings.tmdbToken && settings.launchClipboardSearch && location.pathname !== '/welcome' && isInstalledPwa();

  const remember = useCallback((text: string) => saveSettings({ clipboardHash: clipboardHash(text), clipboardAt: Date.now() }), []);

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState !== 'visible') return;
    busy.current = true;
    try {
      const read = await readClipboardText();
      if (read.ok) {
        const text = clipboardQuery(read.text);
        if (text && !recentlyOffered(text, last.current)) setOffer({ kind: 'text', text });
      } else if (read.reason === 'blocked' || read.reason === 'unsupported') {
        // iPhone/iPad (or Android with the permission refused): we can't look, so offer a box to paste into.
        setOffer((o) => o ?? { kind: 'paste' });
      }
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!checkedAtStart) {
      checkedAtStart = true;
      void check();
    }
    const onShow = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [active, check]);

  useEffect(() => {
    if (!active) setOffer(null);
  }, [active]);

  const go = (text: string) => {
    void remember(text);
    trackEvent('clipboard_search'); // a count only; the text never goes to analytics
    setOffer(null);
    navigate(`/search?q=${encodeURIComponent(text)}`, { state: { paste: { text, at: Date.now() } } });
  };

  /** Text the user pasted (or typed and sent) into the card's box. */
  const submit = (raw: string, typed = false) => {
    const text = typed ? raw.trim() : clipboardQuery(raw);
    if (text && text.length > 1) return go(text);
    toast('That doesn’t look like a title. Copy just the title, then paste again.', 'info');
  };

  const dismiss = () => {
    if (offer?.kind === 'text') void remember(offer.text);
    setOffer(null);
  };

  if (!active || !offer) return null;
  const paste = offer.kind === 'paste';
  return (
    <Paper
      elevation={6}
      role="region"
      aria-label="Search what you copied"
      sx={{
        position: 'fixed',
        left: 12,
        right: 12,
        // The paste box sits at the top so the phone's keyboard doesn't cover it.
        ...(paste ? { top: 'calc(env(safe-area-inset-top) + 68px)' } : { bottom: { xs: 88, md: 24 } }),
        mx: 'auto',
        maxWidth: 480,
        zIndex: (t) => t.zIndex.snackbar,
        p: 1.5,
        borderRadius: '16px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <ContentPasteSearchRoundedIcon color="primary" sx={{ mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {paste ? 'Search what you copied?' : `Search for “${offer.text}”?`}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
            {paste ? 'Your phone doesn’t let apps look at the clipboard. Tap the box, choose Paste, and the search starts.' : 'Found on your clipboard. Only used for this search.'}
          </Typography>
        </Box>
      </Box>
      {paste && (
        <TextField
          fullWidth
          size="small"
          autoComplete="off"
          placeholder="Tap here, then Paste"
          sx={{ mt: 1 }}
          onPaste={(e) => {
            e.preventDefault();
            submit(e.clipboardData.getData('text'));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit((e.target as HTMLInputElement).value, true);
            }
          }}
          slotProps={{ htmlInput: { 'aria-label': 'Paste the title you copied', enterKeyHint: 'search' } }}
        />
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
        <Button size="small" color="inherit" onClick={dismiss}>
          Not now
        </Button>
        {!paste && (
          <Button size="small" variant="contained" onClick={() => go(offer.text)}>
            Search the clipboard text
          </Button>
        )}
      </Box>
    </Paper>
  );
}
