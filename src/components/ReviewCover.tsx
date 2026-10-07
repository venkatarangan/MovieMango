import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import { Box, Button, CircularProgress, type SxProps, type Theme } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { parseReviewTitle } from '../api/mangoidiots';
import { db } from '../db';
import { restoreItem, toggleList } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { findReviewedTitle } from '../lib/reviewMatch';
import { itemKey, type TitleSnapshot } from '../lib/types';
import { useToast } from './Toast';

/**
 * A review's cover image, whole. Mangoidiots covers are 1550×600, so the frame has that shape;
 * an image of another shape sits in the middle over a blurred copy of itself instead of being cropped.
 */
export function ReviewCover({ src, sx }: { src: string; sx?: SxProps<Theme> }) {
  return (
    <Box sx={[{ position: 'relative', width: '100%', aspectRatio: '1550 / 600', overflow: 'hidden', bgcolor: 'action.hover' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box component="img" src={src} alt="" aria-hidden loading="lazy" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(18px)', transform: 'scale(1.15)', opacity: 0.6 }} />
      <Box component="img" src={src} alt="" loading="lazy" sx={{ position: 'relative', display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
    </Box>
  );
}

/** Finds the reviewed film on TMDB and adds it to the watchlist (with Undo); asks the user to pick when unsure. */
export function ReviewWatchlistButton({ postTitle, size = 'small' }: { postTitle: string; size?: 'small' | 'medium' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<TitleSnapshot | null>(null);
  const { name } = parseReviewTitle(postTitle);

  const add = async () => {
    setBusy(true);
    try {
      const snap = await findReviewedTitle(postTitle);
      if (!snap) {
        toast(`Pick the right “${name}” to add it to your watchlist.`, 'info');
        navigate(`/search?q=${encodeURIComponent(name)}`);
        return;
      }
      const prev = await db.items.get(itemKey(snap.type, snap.tmdbId));
      setAdded(snap);
      if (prev?.lists.includes('watchlist')) return toast(`“${snap.title}” is already on your watchlist`, 'info');
      await toggleList(snap, 'watchlist', true);
      trackEvent('list_toggle', { list: 'watchlist', on: true, from: 'review' });
      toast(`Added “${snap.title}” to your watchlist`, 'info', { label: 'Undo', onClick: () => void restoreItem(snap, prev).then(() => setAdded(null)) });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (added)
    return (
      <Button size={size} color="inherit" startIcon={<BookmarkAddedRoundedIcon />} component={RouterLink} to={`/title/${added.type}/${added.tmdbId}`}>
        On your watchlist · Open
      </Button>
    );
  return (
    <Button size={size} color="inherit" startIcon={busy ? <CircularProgress size={16} /> : <BookmarkAddRoundedIcon />} disabled={busy} onClick={add}>
      Add “{name}” to watchlist
    </Button>
  );
}
