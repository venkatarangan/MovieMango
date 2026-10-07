import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, InputAdornment, Skeleton, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { img, mediaTypeOf, searchMulti, snapshotFromList, type TmdbListItem } from '../api/tmdb';
import { ErrorNote, SectionTitle } from '../components/common';
import PosterCard, { Poster, PosterRow } from '../components/PosterCard';
import { QuickActions } from '../components/TitleActions';
import { PlayButtons } from '../components/WhereToWatch';
import { useAllItems, useShowsInProgress } from '../db/items';
import { useSettings, type Settings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { episodeLabel } from '../lib/episodes';
import { formatRuntime } from '../lib/format';
import { languageName } from '../lib/languages';
import { fillSlots } from '../lib/slots';
import type { MediaType, TitleSnapshot, UserItem } from '../lib/types';
import { languageShelf, luckyPicks, randomShelf, streamingNow, worldShelf } from '../reco/home';
import { partOfDay } from '../reco/moods';
import type { Pick } from '../reco/tonight';

const SHELF_SIZE = 15;

function greeting() {
  const p = partOfDay();
  return p === 'late night' ? 'Burning the midnight oil?' : `Good ${p === 'night' ? 'evening' : p}!`;
}

const forNow = () => {
  const p = partOfDay();
  return p === 'night' || p === 'late night' ? 'tonight' : `this ${p}`;
};

const metaLine = (s: TitleSnapshot) => [s.year, s.type === 'tv' ? 'Series' : 'Movie', languageName(s.originalLanguage)].filter(Boolean).join(' · ');

const keyOf = (s: TitleSnapshot) => `${s.type}:${s.tmdbId}`;

/**
 * The first `size` candidates that aren't hidden. When a shown title becomes hidden (saved,
 * watched, 👎), the next candidate takes its slot and the others stay put; Undo brings it back.
 * A new list starts over.
 */
function useSlots<T>(list: T[], key: (t: T) => string, hidden: Set<string>, size: number): T[] {
  const keys = list.map(key);
  const state = useRef({ id: '', slots: [] as string[][] });
  const id = keys.join('|');
  if (state.current.id !== id) state.current = { id, slots: [] };
  const { slots, shown } = fillSlots(state.current.slots, keys, hidden, size);
  state.current.slots = slots;
  const byKey = new Map(list.map((t, i) => [keys[i], t]));
  return shown.map((k) => byKey.get(k)!);
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Search box with live suggestions; Enter opens the full Search page. */
function SearchHero() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), 300);
  const results = useQuery({ queryKey: ['search', query], queryFn: () => searchMulti(query), enabled: query.length > 1 });
  const options = (query.length > 1 ? results.data?.results : [])?.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8) ?? [];

  const go = (value: string | TmdbListItem | null) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (value.trim()) navigate(`/search?q=${encodeURIComponent(value.trim())}`);
      return;
    }
    trackEvent('search');
    navigate(`/title/${mediaTypeOf(value)}/${value.id}`);
  };

  return (
    <Autocomplete
      freeSolo
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === 'string' ? o : (o.title ?? o.name ?? ''))}
      getOptionKey={(o) => (typeof o === 'string' ? o : `${o.media_type}:${o.id}`)}
      inputValue={text}
      onInputChange={(_, v, reason) => reason !== 'reset' && setText(v)}
      onChange={(_, v) => go(v)}
      loading={results.isFetching}
      noOptionsText="No matches yet"
      renderOption={({ key, ...props }, o) => {
        const snap = snapshotFromList(o, mediaTypeOf(o));
        return (
          <Box component="li" key={key} {...props} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Box sx={{ width: 36, flexShrink: 0 }}>
              <Poster path={snap.posterPath} title="" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {snap.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {metaLine(snap)}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search movies and TV shows"
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
              endAdornment: results.isFetching ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null,
              sx: { borderRadius: '999px', bgcolor: 'background.paper', fontSize: '1.05rem', py: '6px !important', pl: '16px !important' },
            },
            htmlInput: { ...params.slotProps.htmlInput, 'aria-label': 'Search movies and TV shows', enterKeyHint: 'search' },
          }}
        />
      )}
    />
  );
}

function LuckyPick({ pick, services }: { pick: Pick; services: string[] }) {
  const s = pick.snap;
  const to = `/title/${s.type}/${s.tmdbId}`;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, minWidth: 0 }}>
      <Box component={RouterLink} to={to} sx={{ width: 76, flexShrink: 0 }}>
        <Poster path={s.posterPath} title={s.title} />
      </Box>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography component={RouterLink} to={to} variant="subtitle1" sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, lineHeight: 1.2 }}>
          {s.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {[s.year, s.type === 'tv' ? 'Series' : 'Movie', s.runtime ? formatRuntime(s.runtime) : '', languageName(s.originalLanguage)].filter(Boolean).join(' · ')}
        </Typography>
        <Typography variant="body2" sx={{ fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {pick.why}
        </Typography>
        <Box sx={{ mt: 0.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <PlayButtons availability={pick.availability.slice(0, 1)} title={s.title} myServices={services} compact />
          <QuickActions snap={s} inline />
        </Box>
      </Box>
    </Box>
  );
}

/** Three instant picks from Tonight's pipeline (no AI), with a shuffle and a link to the full Tonight page. */
function FeelingLucky({ settings, items }: { settings: Settings; items: UserItem[] }) {
  const [turn, setTurn] = useState(0);
  const round = Math.floor(turn / 2);
  const day = new Date().toDateString();
  // Kept for the whole session: coming back to Home shouldn't recompute (or re-call TMDB).
  const lucky = useQuery({ queryKey: ['lucky', day, partOfDay(), round], queryFn: () => luckyPicks(settings, items, round), staleTime: Infinity, gcTime: Infinity, enabled: !!settings.tmdbToken });
  const picks = lucky.data?.picks ?? [];
  // Odd turns show the second three first. A pick you save, watch or 👎 makes way for the next one;
  // picks that were already on your watchlist (a nudge) stay until you act on them.
  const ordered = picks.length > 3 && turn % 2 ? [...picks.slice(3), ...picks.slice(0, 3)] : picks;
  const onWatchlist = useMemo(() => new Set(items.filter((i) => i.lists.includes('watchlist')).map((i) => i.key)), [lucky.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = new Set(items.filter((i) => i.lists.includes('watched') || i.rating === 'dislike' || (i.lists.includes('watchlist') && !onWatchlist.has(i.key))).map((i) => i.key));
  const shown = useSlots(ordered, (p) => keyOf(p.snap), hidden, 3);

  return (
    <Card variant="outlined" sx={{ borderRadius: '20px', mt: 2.5, borderColor: 'primary.main', borderWidth: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6" component="h2">
              🎲 Feeling lucky?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Three picks for {forNow()}, on your services.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button color="inherit" startIcon={<CasinoRoundedIcon />} disabled={lucky.isFetching} onClick={() => { setTurn(turn + 1); trackEvent('lucky_shuffle'); }}>
              Shuffle
            </Button>
            <Button component={RouterLink} to="/tonight" variant="contained" endIcon={<ArrowForwardRoundedIcon />}>
              Tonight
            </Button>
          </Box>
        </Box>
        <ErrorNote error={lucky.error} />
        {lucky.isFetching && !shown.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[0, 1, 2].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5, ...(i > 0 && { display: { xs: 'none', md: 'flex' } }) }}>
                <Skeleton variant="rounded" width={76} height={114} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="70%" />
                  <Skeleton width="40%" />
                  <Skeleton height={48} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : shown.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, opacity: lucky.isFetching ? 0.5 : 1 }}>
            {shown.map((p) => (
              <LuckyPick key={`${p.snap.type}:${p.snap.tmdbId}`} pick={p} services={settings.services} />
            ))}
          </Box>
        ) : (
          lucky.isSuccess && (
            <Typography color="text.secondary">
              Nothing fits right now. Try <RouterLink to="/tonight">Tonight</RouterLink> with more time, or add services and languages in Settings.
            </Typography>
          )
        )}
      </CardContent>
    </Card>
  );
}

function Shelf({ title, to, children, empty, note }: { title: string; to?: string; children: ReactNode; empty?: boolean; note?: string }) {
  if (empty) return null;
  return (
    <Box component="section">
      <SectionTitle
        action={
          to && (
            <Button component={RouterLink} to={to} size="small" endIcon={<ArrowForwardRoundedIcon />}>
              See all
            </Button>
          )
        }
      >
        {title}
      </SectionTitle>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: -1, mb: 1.5 }}>
          {note}
        </Typography>
      )}
      <PosterRow>{children}</PosterRow>
    </Box>
  );
}

function ShelfSkeleton() {
  return (
    <PosterRow>
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '2 / 3' }} />
      ))}
    </PosterRow>
  );
}

function RandomShelf({ type, settings, hidden, seed }: { type: MediaType; settings: Settings; hidden: Set<string>; seed: number }) {
  const shelf = useQuery({ queryKey: ['shelf', type, seed, settings.services, settings.languages], queryFn: () => randomShelf(type, settings, seed), enabled: !!settings.tmdbToken });
  const list = useSlots(shelf.data ?? [], keyOf, hidden, SHELF_SIZE);
  const title = type === 'movie' ? 'Movies for you' : 'Shows for you';
  if (shelf.isLoading)
    return (
      <Box component="section">
        <SectionTitle>{title}</SectionTitle>
        <ShelfSkeleton />
      </Box>
    );
  return (
    <Shelf title={title} empty={!list.length}>
      {list.map((s) => (
        <PosterCard key={`${s.type}:${s.tmdbId}`} snap={s} subtitle={metaLine(s)} />
      ))}
    </Shelf>
  );
}

function StreamingShelf({ settings, items }: { settings: Settings; items: UserItem[] }) {
  const watchKeys = items.filter((i) => i.lists.includes('watchlist')).map((i) => i.key).sort().join(',');
  const streaming = useQuery({ queryKey: ['streaming-now', watchKeys, settings.services], queryFn: () => streamingNow(items, settings), enabled: !!watchKeys && !!settings.tmdbToken, staleTime: 30 * 60_000 });
  const list = streaming.data ?? [];
  return (
    <Shelf title="From your watchlist, on your services" to="/library?tab=watchlist" empty={!list.length}>
      {list.map(({ item, availability, isNew }) => (
        <Box key={item.key} sx={{ position: 'relative' }}>
          <PosterCard snap={item} subtitle={availability.map((a) => a.service.name).join(' · ')} />
          <Box sx={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 0.5, alignItems: 'center', pointerEvents: 'none' }}>
            {isNew && <Chip size="small" color="secondary" label="New" sx={{ height: 22, fontWeight: 700 }} />}
            {availability[0]?.logoPath && <Box component="img" src={img(availability[0].logoPath, 'w92')} alt="" sx={{ width: 24, height: 24, borderRadius: '6px', boxShadow: 2 }} />}
          </Box>
        </Box>
      ))}
    </Shelf>
  );
}

function WorldShelf({ settings, items, hidden, seed }: { settings: Settings; items: UserItem[]; hidden: Set<string>; seed: number }) {
  const tasteKey = items.filter((i) => i.rating || i.lists.includes('watched')).length;
  const shelf = useQuery({ queryKey: ['world', seed, settings.services, settings.languages, tasteKey > 0], queryFn: () => worldShelf(settings, items, seed), enabled: !!settings.tmdbToken, staleTime: Infinity });
  const list = useSlots(shelf.data ?? [], keyOf, hidden, SHELF_SIZE);
  return (
    <Shelf title="🌏 World picks for you" note="Top-rated in languages you don’t usually watch, on your services. Turn on subtitles and dive in." empty={!list.length}>
      {list.map((s) => (
        <PosterCard key={`${s.type}:${s.tmdbId}`} snap={s} subtitle={metaLine(s)} />
      ))}
    </Shelf>
  );
}

function LanguageOfWeek({ settings, hidden }: { settings: Settings; hidden: Set<string> }) {
  const week = new Date().toDateString();
  const shelf = useQuery({ queryKey: ['lang-week', week, settings.services, settings.languages], queryFn: () => languageShelf(settings), enabled: !!settings.tmdbToken, staleTime: Infinity });
  const data = shelf.data;
  const list = useSlots(data?.titles ?? [], keyOf, hidden, SHELF_SIZE);
  if (!data) return null;
  const name = languageName(data.language);
  return (
    <Shelf title={`🗣️ This week: ${name}`} note={`A new language every week. The best-rated ${name} films and shows on your services.`} to={`/browse/movie?lang=${data.language}&sort=top`} empty={!list.length}>
      {list.map((s) => (
        <PosterCard key={`${s.type}:${s.tmdbId}`} snap={s} subtitle={[s.year, s.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')} />
      ))}
    </Shelf>
  );
}

function ContinueWatching() {
  const shows = useShowsInProgress();
  const list = [...(shows ?? [])].sort((a, b) => Number(!a.nextEpisode) - Number(!b.nextEpisode)).slice(0, SHELF_SIZE);
  return (
    <Shelf title="Continue watching" empty={!list.length}>
      {list.map((i) => (
        <PosterCard key={i.key} snap={i} subtitle={i.nextEpisode ? `Next: ${episodeLabel(i.nextEpisode)}` : 'All caught up'} />
      ))}
    </Shelf>
  );
}

export default function Home() {
  const settings = useSettings();
  const items = useAllItems();
  // A fresh shuffle each time Home opens.
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));

  const { watchlist, watched, hidden } = useMemo(() => {
    const all = items ?? [];
    return {
      watchlist: all.filter((i) => i.lists.includes('watchlist')).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SHELF_SIZE),
      watched: all.filter((i) => i.lists.includes('watched')).sort((a, b) => (b.watchedAt ?? b.updatedAt) - (a.watchedAt ?? a.updatedAt)).slice(0, SHELF_SIZE),
      // Suggestion rows skip what you've already saved, watched or 👎'd; saving one swaps in the next.
      hidden: new Set(all.filter((i) => i.lists.includes('watched') || i.lists.includes('watchlist') || i.rating === 'dislike').map((i) => i.key)),
    };
  }, [items]);

  if (!settings || !items) return null;

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 1.5 }}>
        {greeting()}
      </Typography>
      <SearchHero />

      <FeelingLucky settings={settings} items={items} />

      <ContinueWatching />
      <StreamingShelf settings={settings} items={items} />
      <RandomShelf type="movie" settings={settings} hidden={hidden} seed={seed} />
      <RandomShelf type="tv" settings={settings} hidden={hidden} seed={seed + 1} />
      <WorldShelf settings={settings} items={items} hidden={hidden} seed={seed} />
      <LanguageOfWeek settings={settings} hidden={hidden} />

      <Shelf title="Latest on your watchlist" to="/library?tab=watchlist" empty={!watchlist.length}>
        {watchlist.map((i) => (
          <PosterCard key={i.key} snap={i} />
        ))}
      </Shelf>
      <Shelf title="Recently watched" to="/library?tab=watched" empty={!watched.length}>
        {watched.map((i) => (
          <PosterCard key={i.key} snap={i} />
        ))}
      </Shelf>

      {!watchlist.length && !watched.length && (
        <Card variant="outlined" sx={{ borderRadius: '20px', mt: 3 }}>
          <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <AutoAwesomeRoundedIcon color="primary" />
            <Typography variant="body2">
              Tap <b>＋</b> on any poster to save it, or 👍 ❤️ 👎 on a title page. The more MovieMango knows, the better your picks.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        Data from TMDB (not endorsed or certified by TMDB). Streaming availability by JustWatch.
      </Typography>
    </Box>
  );
}
