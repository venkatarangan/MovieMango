import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Box, Button, Card, CardContent, Fade, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { setUserNotes } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { cleanWatchLink, clampBytes, utf8Bytes } from '../lib/notes';
import { MAX_NOTES_BYTES, type TitleSnapshot } from '../lib/types';
import { useSavedItem } from './TitleActions';
import { useToast } from './Toast';

/**
 * "Your link and notes" on a title page: a legal place to watch that isn't a known service, and free-text
 * notes (1 KB). Saves when a field loses focus. Private: this device, plus the user's own Drive if synced.
 */
export default function MyNotes({ snap }: { snap: TitleSnapshot }) {
  const item = useSavedItem(snap);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(item?.watchLink ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [saved, setSaved] = useState(false);
  const editing = useRef(false);

  // Pick up changes from elsewhere (sync, import) unless the user is typing.
  useEffect(() => {
    if (editing.current) return;
    setLink(item?.watchLink ?? '');
    setNotes(item?.notes ?? '');
  }, [item?.watchLink, item?.notes]);

  const has = !!(item?.watchLink || item?.notes);
  const linkError = !!link.trim() && !cleanWatchLink(link);
  const bytes = utf8Bytes(notes);

  const save = async (field: 'watchLink' | 'notes') => {
    editing.current = false;
    const value = field === 'watchLink' ? link : notes;
    const current = (field === 'watchLink' ? item?.watchLink : item?.notes) ?? '';
    if (value.trim() === current || (field === 'watchLink' && linkError)) return;
    const { item: next, added } = await setUserNotes(snap, { [field]: value });
    if (field === 'watchLink') setLink(next.watchLink ?? '');
    trackEvent('notes_save', { field });
    if (added) toast('Added to your Watchlist so your link and notes are kept.', 'info');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!has && !open)
    return (
      <Button startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)} sx={{ mt: 1 }}>
        Add your own link or notes
      </Button>
    );

  return (
    <Card variant="outlined" sx={{ borderRadius: '20px', mt: 1, maxWidth: 760 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Your link and notes
          </Typography>
          <Fade in={saved}>
            <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }} role="status">
              <CheckRoundedIcon sx={{ fontSize: 16 }} /> Saved
            </Typography>
          </Fade>
        </Box>
        <Stack spacing={2}>
          <TextField
            label="My watch link"
            placeholder="https://www.youtube.com/watch?v=…"
            value={link}
            onFocus={() => (editing.current = true)}
            onChange={(e) => setLink(e.target.value.slice(0, 2000))}
            onBlur={() => void save('watchLink')}
            error={linkError}
            helperText={linkError ? 'Use a web address, like https://www.youtube.com/…' : 'A legal place to watch it that isn’t one of the services above, like a YouTube upload by the makers.'}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { inputMode: 'url', autoComplete: 'off', spellCheck: false } }}
          />
          <TextField
            label="My notes"
            placeholder="Amma recommended it. Watch the director’s cut."
            value={notes}
            onFocus={() => (editing.current = true)}
            onChange={(e) => setNotes(clampBytes(e.target.value, MAX_NOTES_BYTES))}
            onBlur={() => void save('notes')}
            helperText={`${bytes.toLocaleString('en-IN')} of ${MAX_NOTES_BYTES.toLocaleString('en-IN')} bytes. Tamil and other scripts use about 3 bytes a letter.`}
            multiline
            minRows={2}
            maxRows={8}
            size="small"
            fullWidth
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Only you can see this. It’s kept on this device, and in your own Google Drive if sync is on. It saves as you go.
        </Typography>
      </CardContent>
    </Card>
  );
}
