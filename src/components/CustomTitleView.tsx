import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { db } from '../db';
import { removeCustomTitle, toSnapshot } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { safeFilename, titleToText } from '../lib/exportText';
import { formatRuntime } from '../lib/format';
import { genreName } from '../lib/genres';
import { languageName } from '../lib/languages';
import { itemKey, type MediaType } from '../lib/types';
import { EmptyState, SectionTitle } from './common';
import CustomTitleDialog from './CustomTitleDialog';
import ListActions from './ListActions';
import { Poster } from './PosterCard';
import ShareButton from './ShareButton';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Title page for a custom title (negative id). Everything comes from IndexedDB; no TMDB calls. */
export default function CustomTitleView({ type, id }: { type: MediaType; id: number }) {
  const item = useLiveQuery(async () => (await db.items.get(itemKey(type, id))) ?? null, [type, id]);
  const snap = useMemo(() => item && toSnapshot(item), [item]);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (item === undefined) return null;
  if (!item || !snap) return <EmptyState title="This title isn’t in your library">It may have been added on another device that hasn’t synced yet.</EmptyState>;

  const c = item.custom ?? {};
  const meta = [item.year, type === 'tv' ? 'Series' : 'Movie', item.runtime ? formatRuntime(item.runtime) + (type === 'tv' ? ' per episode' : '') : null, languageName(item.originalLanguage)].filter(Boolean);
  const exportText = () => titleToText({ snap, overview: c.overview, genres: item.genreIds.map(genreName), director: c.director, cast: c.cast, myRating: item.rating });

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: { xs: 2, md: 4 }, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'center', sm: 'flex-start' } }}>
        <Box sx={{ width: { xs: 180, sm: 220, md: 260 }, flexShrink: 0, boxShadow: 6, borderRadius: '12px' }}>
          <Poster title={item.title} original={c.originalTitle} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          <Typography variant="h4" component="h1" sx={{ lineHeight: 1.15 }}>
            {item.title}
          </Typography>
          {c.originalTitle && c.originalTitle !== item.title && (
            <Typography color="text.secondary" lang={item.originalLanguage}>
              {c.originalTitle}
            </Typography>
          )}
          <Typography sx={{ mt: 1 }} color="text.secondary">
            {meta.join(' · ')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5, alignItems: 'center' }}>
            <Chip size="small" label="Added by you · not in TMDB" color="secondary" variant="outlined" />
            {item.genreIds.map((g) => (
              <Chip key={g} size="small" label={genreName(g)} variant="outlined" clickable component={RouterLink} to={`/browse/${type}?genre=${g}`} />
            ))}
          </Box>
          {c.director && (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {type === 'tv' ? 'Created by' : 'Directed by'} <b>{c.director}</b>
            </Typography>
          )}
          <Box sx={{ mt: 2 }}>
            <ListActions snap={snap} />
          </Box>
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            {c.url && (
              <Button href={c.url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined" color="inherit">
                {hostOf(c.url)}
              </Button>
            )}
            <ShareButton title={item.title} filename={safeFilename(`${item.title}${item.year ? `-${item.year}` : ''}`)} build={exportText} what="title" />
            <Button color="inherit" startIcon={<EditRoundedIcon />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setConfirm(true)}>
              Delete
            </Button>
          </Box>
        </Box>
      </Box>

      <SectionTitle>Story</SectionTitle>
      <Typography sx={{ maxWidth: 760, whiteSpace: 'pre-line' }}>{c.overview || 'No description yet. Tap Edit to add one.'}</Typography>

      {!!c.cast?.length && (
        <>
          <SectionTitle>Cast</SectionTitle>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {c.cast.map((name) => (
              <Chip key={name} label={name} variant="outlined" />
            ))}
          </Box>
        </>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        You added this title yourself, so there’s no streaming information for it. It’s saved in this browser and, if connected, your own Google Drive.
      </Typography>

      <CustomTitleDialog open={editing} onClose={() => setEditing(false)} item={item} onSaved={(s) => s.type !== type && navigate(`/title/${s.type}/${s.tmdbId}`, { replace: true })} />
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Delete “{item.title}”?</DialogTitle>
        <DialogContent>
          <Typography>It’s removed from all your lists, along with your rating.</Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              await removeCustomTitle(item.key);
              trackEvent('custom_delete');
              navigate('/library');
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
