import ContentPasteSearchRoundedIcon from '@mui/icons-material/ContentPasteSearchRounded';
import { Box, Button, Paper, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { saveSettings, useSettings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { clipboardHash, clipboardQuery, readClipboardText, recentlyOffered } from '../lib/clipboard';
import { isInstalledPwa } from '../lib/pwa';

/** What the card offers: a known title (Android could read the clipboard) or a tap to read it (iPhone/iPad need one). */
type Offer = { kind: 'text'; text: string } | { kind: 'tap' };

/** Set once per app start, so a cold launch checks the clipboard once and resumes check again. */
let checkedAtStart = false;

/**
 * Installed app only. When the app opens or comes back to the front, offers to search for text found on the
 * clipboard. It never searches by itself and never interrupts: a small card with a button, which can be ignored.
 * Android Chrome lets us read the clipboard at launch (after a one-time permission), so the card shows the
 * text. iPhone and iPad only allow it right after a tap, so the card shows the button and reads on tap.
 */
export default function LaunchActions() {
  const settings = useSettings();
  const navigate = useNavigate();
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
      } else if (read.reason === 'blocked') {
        // iPhone/iPad: reading needs a tap. We don't know what's copied, so just offer the button.
        setOffer((o) => o ?? { kind: 'tap' });
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

  // Called from the tap itself, which is what lets iPhone and iPad read the clipboard.
  const onSearch = async () => {
    if (offer?.kind === 'text') return go(offer.text);
    const read = await readClipboardText();
    const text = read.ok ? clipboardQuery(read.text) : null;
    if (text) go(text);
    else {
      setOffer(null);
      navigate('/search');
    }
  };

  const dismiss = () => {
    if (offer?.kind === 'text') void remember(offer.text);
    setOffer(null);
  };

  if (!active || !offer) return null;
  return (
    <Paper
      elevation={6}
      role="region"
      aria-label="Search what you copied"
      sx={{ position: 'fixed', left: 12, right: 12, bottom: { xs: 88, md: 24 }, mx: 'auto', maxWidth: 480, zIndex: (t) => t.zIndex.snackbar, p: 1.5, borderRadius: '16px' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <ContentPasteSearchRoundedIcon color="primary" sx={{ mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {offer.kind === 'text' ? `Search for “${offer.text}”?` : 'Search what you copied?'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
            {offer.kind === 'text' ? 'Found on your clipboard. Only used for this search.' : 'Tap, then allow Paste. Only used for this search.'}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
        <Button size="small" color="inherit" onClick={dismiss}>
          Not now
        </Button>
        <Button size="small" variant="contained" onClick={onSearch}>
          Search the clipboard text
        </Button>
      </Box>
    </Paper>
  );
}
