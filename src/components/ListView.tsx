import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Badge, Box, Button, Chip, Divider, IconButton, InputAdornment, LinearProgress, ListSubheader, MenuItem, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isOffline } from '../api/http';
import { checkMany } from '../db/streaming';
import { genreName } from '../lib/genres';
import { languageName } from '../lib/languages';
import { applyView, decadeOf, SORTS, type SortKey, type ViewState } from '../lib/listView';
import { SERVICES, serviceByKey } from '../lib/providers';
import { MY_RATINGS } from '../lib/ratings';
import { streamCounts, type StreamFilter } from '../lib/streaming';
import { isCustom, type UserItem } from '../lib/types';
import PosterCard, { PosterGrid } from './PosterCard';
import { useStreaming } from './Streaming';
import { useToast } from './Toast';

export const streamLabel = (f: StreamFilter) => (f === 'mine' ? 'On my services' : f === 'none' ? 'Not streaming' : `On ${serviceByKey(f)?.name ?? f}`);
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

const STORE = 'mm.view.';
function load(key: string, fallback: ViewState): ViewState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE + key) ?? 'null');
    if (!saved || !SORTS.some((s) => s.key === saved.sort)) return fallback;
    if (saved.service && !['mine', 'none'].includes(saved.service) && !serviceByKey(saved.service)) delete saved.service;
    return { ...fallback, ...saved };
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

  const stream = useStreaming();
  const toast = useToast();
  const shown = useMemo(() => applyView(items, view, text, stream), [items, view, text, stream]);
  const counts = useMemo(() => streamCounts(items, stream.rows, stream.mine), [items, stream]);
  const others = SERVICES.filter((s) => !stream.mine.includes(s.key) && counts.byService[s.key]);

  // Checks run through the shared queue (src/db/streaming.ts); this only tracks progress for the line below.
  const [progress, setProgress] = useState<{ kind: 'check' | 'refresh'; done: number; total: number } | null>(null);
  const tried = useRef(new Set<string>());
  const checkNew = () => {
    if (progress) return;
    const todo = items.filter((i) => !isCustom(i) && !stream.rows.has(i.key) && !tried.current.has(i.key));
    if (!todo.length || isOffline()) return;
    todo.forEach((i) => tried.current.add(i.key));
    void checkMany(todo, { onProgress: (done, total) => setProgress({ kind: 'check', done, total }) }).finally(() => setProgress(null));
  };
  // A remembered Streaming filter needs every title's info, so check the new ones on arrival.
  useEffect(() => {
    if (view.service && counts.unknown) checkNew();
  }, [view.service, counts.unknown]); // eslint-disable-line react-hooks/exhaustive-deps

  const checked = items.filter((i) => !isCustom(i) && stream.rows.has(i.key));
  const oldest = checked.reduce((m, i) => Math.min(m, stream.rows.get(i.key)!.checkedAt), Infinity);
  const refresh = async () => {
    if (progress || !checked.length) return;
    const { changed, failed } = await checkMany(checked, { fresh: true, onProgress: (done, total) => setProgress({ kind: 'refresh', done, total }) }).finally(() => setProgress(null));
    if (failed === checked.length) toast('Couldn’t reach TMDB just now. Your saved info is unchanged; try again later.', 'warning');
    else toast(changed ? `Updated. ${changed} title${changed === 1 ? '' : 's'} changed services.` : 'Up to date. No changes.', 'success');
  };

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
        <TextField
          select
          size="small"
          label="Streaming"
          value={view.service ?? ''}
          onChange={(e) => update({ service: (e.target.value || undefined) as StreamFilter | undefined })}
          sx={{ minWidth: 170 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, onOpen: checkNew, MenuProps: { slotProps: { paper: { sx: { maxHeight: 420 } } } } } }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="mine">On my services ({counts.mine})</MenuItem>
          {stream.mine.length > 0 && <ListSubheader>Your services</ListSubheader>}
          {stream.mine.map((k) => (
            <MenuItem key={k} value={k}>
              {serviceByKey(k)?.name ?? k} ({counts.byService[k] ?? 0})
            </MenuItem>
          ))}
          {others.length > 0 && <ListSubheader>Other services</ListSubheader>}
          {others.map((s) => (
            <MenuItem key={s.key} value={s.key}>
              {s.name} ({counts.byService[s.key]})
            </MenuItem>
          ))}
          <Divider />
          <MenuItem value="none">Not streaming ({counts.none})</MenuItem>
        </TextField>
        <Tooltip title={checked.length ? `Where these stream was last checked ${shortDate(oldest)}. Tap to check again.` : 'Nothing checked yet. Pick a Streaming option first.'}>
          <span>
            <IconButton aria-label="Check where these stream again" onClick={refresh} disabled={!checked.length || !!progress || isOffline()}>
              <RefreshRoundedIcon sx={progress?.kind === 'refresh' ? { animation: 'mm-spin 1s linear infinite', '@keyframes mm-spin': { to: { transform: 'rotate(360deg)' } } } : undefined} />
            </IconButton>
          </span>
        </Tooltip>
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
      {(active > 0 || view.service) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {view.service && <Chip size="small" label={streamLabel(view.service)} onDelete={() => update({ service: undefined })} />}
          {view.genre && <Chip size="small" label={genreName(view.genre)} onDelete={() => update({ genre: undefined })} />}
          {view.lang && <Chip size="small" label={languageName(view.lang)} onDelete={() => update({ lang: undefined })} />}
          {view.rating && <Chip size="small" label={ratingLabel(view.rating)} onDelete={() => update({ rating: undefined })} />}
          {view.decade && <Chip size="small" label={`${view.decade}s`} onDelete={() => update({ decade: undefined })} />}
        </Box>
      )}
      {progress && (
        <Box sx={{ mb: 1.5, maxWidth: 420 }} role="status">
          <Typography variant="body2" color="text.secondary">
            {progress.kind === 'refresh' ? `Refreshing ${progress.done} of ${progress.total}…` : `Checking where ${progress.done} of ${progress.total} stream…`}
          </Typography>
          <LinearProgress variant="determinate" value={progress.total ? (100 * progress.done) / progress.total : 0} sx={{ mt: 0.5, height: 3, borderRadius: '2px' }} />
        </Box>
      )}
      {view.service && !progress && (counts.custom > 0 || counts.unknown > 0) && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {[counts.custom ? `${counts.custom} of your own titles ${counts.custom === 1 ? 'isn’t' : 'aren’t'} included.` : '', counts.unknown ? `${counts.unknown} title${counts.unknown === 1 ? '' : 's'} couldn’t be checked yet.` : ''].filter(Boolean).join(' ')}
        </Typography>
      )}
      {shown.length < items.length && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Showing {shown.length} of {items.length}
        </Typography>
      )}
      {shown.length ? (
        <PosterGrid>
          {shown.map((i) => (
            <PosterCard key={i.key} snap={i} streaming="check" />
          ))}
        </PosterGrid>
      ) : (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {view.service && progress ? 'Checking where these stream…' : 'Nothing matches. Try clearing a filter.'}
        </Typography>
      )}
    </Box>
  );
}
