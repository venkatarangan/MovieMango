import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { listLabel, saveCustomTitle, useCustomLists } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { customSnapshot, safeUrl } from '../lib/custom';
import { MOVIE_GENRES, TV_GENRES } from '../lib/genres';
import { LANGUAGES } from '../lib/languages';
import { BUILTIN_LISTS, itemKey, type MediaType, type UserItem } from '../lib/types';
import { ChipGroup } from './ChipGroup';
import { useToast } from './Toast';

interface Form {
  type: MediaType;
  title: string;
  originalTitle: string;
  year: string;
  runtime: string;
  language: string;
  genreIds: number[];
  overview: string;
  director: string;
  cast: string;
  url: string;
  list: string;
}

const blank = (title = ''): Form => ({ type: 'movie', title, originalTitle: '', year: '', runtime: '', language: '', genreIds: [], overview: '', director: '', cast: '', url: '', list: 'watchlist' });

const fromItem = (i: UserItem): Form => ({
  type: i.type,
  title: i.title,
  originalTitle: i.custom?.originalTitle ?? '',
  year: i.year ? String(i.year) : '',
  runtime: i.runtime ? String(i.runtime) : '',
  language: i.originalLanguage ?? '',
  genreIds: i.genreIds,
  overview: i.custom?.overview ?? '',
  director: i.custom?.director ?? '',
  cast: i.custom?.cast?.join(', ') ?? '',
  url: i.custom?.url ?? '',
  list: 'watchlist',
});

/** Add or edit a title that isn't in TMDB. Everything stays in this browser (and your Drive, if connected). */
export default function CustomTitleDialog({ open, onClose, item, initialTitle, onSaved }: { open: boolean; onClose: () => void; item?: UserItem; initialTitle?: string; onSaved?: (item: UserItem) => void }) {
  const [f, setF] = useState<Form>(blank());
  const lists = useCustomLists() ?? [];
  const toast = useToast();
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));

  useEffect(() => {
    if (open) setF(item ? fromItem(item) : blank(initialTitle?.trim() ?? ''));
  }, [open, item, initialTitle]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const year = Number(f.year);
  const yearBad = !!f.year && !(year > 1870 && year < 2100);
  const urlBad = !!f.url.trim() && !safeUrl(f.url);
  const genres = f.type === 'tv' ? TV_GENRES : MOVIE_GENRES;

  const save = async () => {
    const snap = customSnapshot({
      tmdbId: item?.tmdbId,
      type: f.type,
      title: f.title,
      year: year || undefined,
      runtime: Number(f.runtime) || undefined,
      originalLanguage: f.language || undefined,
      genreIds: f.genreIds,
      originalTitle: f.originalTitle,
      overview: f.overview,
      director: f.director,
      cast: f.cast,
      url: f.url,
    });
    const saved = await saveCustomTitle(snap, item ? { previousKey: itemKey(item.type, item.tmdbId) } : { list: f.list });
    trackEvent(item ? 'custom_edit' : 'custom_add');
    toast(item ? 'Saved' : `Added to ${listLabel[f.list] ?? lists.find((l) => l.id === f.list)?.name ?? 'your list'}`);
    onSaved?.(saved);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen} aria-labelledby="custom-title-heading">
      <DialogTitle id="custom-title-heading">{item ? 'Edit your title' : 'Add your own title'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          For films and shows that aren’t on TMDB: indie films, old TV serials, festival picks, home videos. It’s saved only in this browser and your own Drive.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <ChipGroup label="Type" options={[{ key: 'movie', label: 'Movie' }, { key: 'tv', label: 'TV series' }]} value={f.type} onChange={(t: MediaType) => setF((p) => ({ ...p, type: t, genreIds: [] }))} />
          <TextField required autoFocus label="Title (in English)" value={f.title} onChange={(e) => set('title', e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField label="Original title" helperText="In its own script, if different. For example, தமிழ் or हिन्दी." value={f.originalTitle} onChange={(e) => set('originalTitle', e.target.value)} slotProps={{ htmlInput: { maxLength: 200, lang: f.language || undefined } }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1.4fr' }, gap: 2 }}>
            <TextField label="Year" value={f.year} error={yearBad} helperText={yearBad ? 'Check the year' : ' '} onChange={(e) => set('year', e.target.value.replace(/\D/g, '').slice(0, 4))} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            <TextField label={f.type === 'tv' ? 'Episode length (min)' : 'Runtime (min)'} value={f.runtime} helperText=" " onChange={(e) => set('runtime', e.target.value.replace(/\D/g, '').slice(0, 4))} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            <TextField select label="Language" value={f.language} helperText=" " onChange={(e) => set('language', e.target.value)} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
              <MenuItem value="">
                <em>Not set</em>
              </MenuItem>
              {LANGUAGES.map((l) => (
                <MenuItem key={l.code} value={l.code}>
                  {l.native ? `${l.name} · ${l.native}` : l.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <ChipGroup label="Genres" multi options={Object.entries(genres).map(([id, name]) => ({ key: Number(id), label: name }))} value={f.genreIds} onChange={(g: number[]) => set('genreIds', g)} />
          <TextField label="Description" multiline minRows={3} value={f.overview} onChange={(e) => set('overview', e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <TextField label={f.type === 'tv' ? 'Created by' : 'Director'} value={f.director} onChange={(e) => set('director', e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField label="Cast" helperText="Separate names with commas." value={f.cast} onChange={(e) => set('cast', e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <TextField label="Link for more information" placeholder="https://" type="url" value={f.url} error={urlBad} helperText={urlBad ? 'Use a web link starting with http:// or https://' : 'A Wikipedia page, a YouTube video or a review, for example.'} onChange={(e) => set('url', e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
          {!item && (
            <TextField select label="Add to" value={f.list} onChange={(e) => set('list', e.target.value)}>
              {BUILTIN_LISTS.map((l) => (
                <MenuItem key={l} value={l}>
                  {listLabel[l]}
                </MenuItem>
              ))}
              {lists.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {`${l.emoji ?? ''} ${l.name}`.trim()}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={!f.title.trim() || yearBad || urlBad}>
          {item ? 'Save' : 'Add title'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
