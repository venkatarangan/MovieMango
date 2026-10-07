import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Badge, Box, Button, Chip, InputAdornment, MenuItem, Popover, Stack, TextField, Typography } from '@mui/material';
import { useMemo, useState, type ReactNode } from 'react';
import { genreName } from '../lib/genres';
import { languageName } from '../lib/languages';
import { applyView, decadeOf, SORTS, type SortKey, type ViewState } from '../lib/listView';
import { MY_RATINGS } from '../lib/ratings';
import type { UserItem } from '../lib/types';
import PosterCard, { PosterGrid } from './PosterCard';

const STORE = 'mm.view.';
function load(key: string, fallback: ViewState): ViewState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE + key) ?? 'null');
    return saved && SORTS.some((s) => s.key === saved.sort) ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

/** A list's titles with type chips, sort, filters and a find box. The view is remembered per list on this device. */
export default function ListView({ viewKey, items, defaultSort = 'added', actions }: { viewKey: string; items: UserItem[]; defaultSort?: SortKey; actions?: (shown: UserItem[]) => ReactNode }) {
  const [view, setView] = useState<ViewState>(() => load(viewKey, { type: 'all', sort: defaultSort }));
  const [text, setText] = useState('');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const update = (patch: Partial<ViewState>) => {
    const next = { ...view, ...patch };
    setView(next);
    try {
      localStorage.setItem(STORE + viewKey, JSON.stringify(next));
    } catch {
      /* storage unavailable: the view just isn't remembered */
    }
  };

  const shown = useMemo(() => applyView(items, view, text), [items, view, text]);
  // Filter choices come from what's in the list.
  const options = useMemo(() => {
    const count = <K,>(keys: (K | undefined)[]) => {
      const m = new Map<K, number>();
      for (const k of keys) if (k !== undefined) m.set(k, (m.get(k) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      genres: count(items.flatMap((i) => i.genreIds)),
      langs: count(items.map((i) => i.originalLanguage)),
      decades: count(items.map((i) => decadeOf(i.year))).sort((a, b) => b[0] - a[0]),
      films: items.filter((i) => i.type === 'movie').length,
      shows: items.filter((i) => i.type === 'tv').length,
    };
  }, [items]);
  const active = [view.genre, view.lang, view.rating, view.decade].filter((x) => x !== undefined).length;

  const ratingLabel = (r: NonNullable<ViewState['rating']>) => (r === 'none' ? 'No rating' : `${MY_RATINGS.find((m) => m.key === r)!.emoji} ${MY_RATINGS.find((m) => m.key === r)!.short}`);

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.5 }}>
        {(['all', 'movie', 'tv'] as const).map((k) => {
          const n = k === 'all' ? items.length : k === 'movie' ? options.films : options.shows;
          return <Chip key={k} label={`${k === 'all' ? 'All' : k === 'movie' ? 'Films' : 'Shows'} · ${n}`} color={view.type === k ? 'primary' : 'default'} variant={view.type === k ? 'filled' : 'outlined'} onClick={() => update({ type: k })} disabled={k !== 'all' && !n} />;
        })}
        <Box sx={{ flex: 1 }} />
        {actions?.(shown)}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Find in this list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ flex: '1 1 180px', maxWidth: 320 }}
          slotProps={{
            input: { startAdornment: (<InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment>), sx: { borderRadius: '999px' } },
            htmlInput: { 'aria-label': 'Find in this list' },
          }}
        />
        <TextField select size="small" label="Sort" value={view.sort} onChange={(e) => update({ sort: e.target.value as SortKey })} sx={{ minWidth: 170 }}>
          {SORTS.map((s) => (
            <MenuItem key={s.key} value={s.key}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <Badge badgeContent={active} color="primary">
          <Button color="inherit" variant="outlined" startIcon={<FilterListRoundedIcon />} onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderColor: 'divider' }}>
            Filter
          </Button>
        </Badge>
      </Box>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { p: 2, width: 280, borderRadius: '16px' } } }}>
        <Stack spacing={1.5}>
          <TextField select size="small" label="Genre" value={view.genre ?? ''} onChange={(e) => update({ genre: e.target.value ? Number(e.target.value) : undefined })}>
            <MenuItem value="">Any genre</MenuItem>
            {options.genres.map(([g, n]) => (
              <MenuItem key={g} value={g}>
                {genreName(g)} ({n})
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Language" value={view.lang ?? ''} onChange={(e) => update({ lang: e.target.value || undefined })}>
            <MenuItem value="">Any language</MenuItem>
            {options.langs.map(([l, n]) => (
              <MenuItem key={l} value={l}>
                {languageName(l)} ({n})
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Your rating" value={view.rating ?? ''} onChange={(e) => update({ rating: (e.target.value || undefined) as ViewState['rating'] })}>
            <MenuItem value="">Any</MenuItem>
            {(['love', 'like', 'dislike', 'none'] as const).map((r) => (
              <MenuItem key={r} value={r}>
                {ratingLabel(r)}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Decade" value={view.decade ?? ''} onChange={(e) => update({ decade: e.target.value ? Number(e.target.value) : undefined })}>
            <MenuItem value="">Any decade</MenuItem>
            {options.decades.map(([d, n]) => (
              <MenuItem key={d} value={d}>
                {d}s ({n})
              </MenuItem>
            ))}
          </TextField>
          {active > 0 && (
            <Button size="small" onClick={() => update({ genre: undefined, lang: undefined, rating: undefined, decade: undefined })}>
              Clear filters
            </Button>
          )}
        </Stack>
      </Popover>
      {active > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {view.genre && <Chip size="small" label={genreName(view.genre)} onDelete={() => update({ genre: undefined })} />}
          {view.lang && <Chip size="small" label={languageName(view.lang)} onDelete={() => update({ lang: undefined })} />}
          {view.rating && <Chip size="small" label={ratingLabel(view.rating)} onDelete={() => update({ rating: undefined })} />}
          {view.decade && <Chip size="small" label={`${view.decade}s`} onDelete={() => update({ decade: undefined })} />}
        </Box>
      )}
      {shown.length < items.length && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Showing {shown.length} of {items.length}
        </Typography>
      )}
      {shown.length ? (
        <PosterGrid>
          {shown.map((i) => (
            <PosterCard key={i.key} snap={i} />
          ))}
        </PosterGrid>
      ) : (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          Nothing matches. Try clearing a filter.
        </Typography>
      )}
    </Box>
  );
}
