import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Alert, Box, Button, Chip, FormControlLabel, InputAdornment, MenuItem, Skeleton, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { discover, getWatchProviderCatalogue, searchKeywords, snapshotFromList, type TmdbPage } from '../api/tmdb';
import { ErrorNote } from '../components/common';
import PosterCard, { PosterGrid } from '../components/PosterCard';
import { useSettings, type Settings } from '../db/settings';
import { MOVIE_GENRES, TV_GENRES } from '../lib/genres';
import { parseFilterText, parseYear } from '../lib/browse';
import { languageName, LANGUAGES, WORLD_LANGUAGES } from '../lib/languages';
import { resolveProviderIds } from '../lib/providers';
import type { MediaType, TitleSnapshot } from '../lib/types';

/** Titles per "page" here: five TMDB pages of 20. */
const PER_SET = 5;
const TMDB_MAX_PAGE = 500;

type Sort = 'new' | 'popular' | 'top';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'new', label: 'Newest first' },
  { key: 'popular', label: 'Most popular' },
  { key: 'top', label: 'Top rated' },
];

/** The nearest genre on the other side when switching between films and shows. */
const OTHER_TYPE_GENRE: Record<number, number> = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768, 10759: 28, 10765: 878, 10768: 10752, 10762: 10751 };

const genresFor = (type: MediaType) => (type === 'movie' ? MOVIE_GENRES : TV_GENRES);

interface Filters {
  type: MediaType;
  genre?: number;
  sort: Sort;
  year?: string;
  lang?: string;
  theme?: string;
  mine: boolean;
  myLangs: boolean;
  set: number;
}

async function loadSet(f: Filters, settings: Settings, keywordIds: number[]): Promise<{ titles: TitleSnapshot[]; total: number; pages: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const movie = f.type === 'movie';
  const dateKey = movie ? 'primary_release_date' : 'first_air_date';
  const range = f.year ? parseYear(f.year) : undefined;
  let providers: string | undefined;
  if (f.mine) {
    const catalogue = await getWatchProviderCatalogue(f.type, settings.region).catch(() => ({ results: [] }));
    const ids = resolveProviderIds(catalogue.results);
    providers = [...new Set(settings.services.flatMap((k) => ids[k] ?? []))].join('|');
  }
  const params: Record<string, string | number | undefined> = {
    with_genres: f.genre,
    with_keywords: keywordIds.length ? keywordIds.join('|') : undefined,
    with_original_language: f.lang ?? (f.myLangs ? settings.languages.join('|') : undefined),
    sort_by: f.sort === 'new' ? `${dateKey}.desc` : f.sort === 'top' ? 'vote_average.desc' : 'popularity.desc',
    // A few votes keeps out placeholder entries; "top rated" needs more to mean anything.
    'vote_count.gte': f.sort === 'top' ? (movie ? 200 : 100) : movie ? 10 : 5,
    // Released titles only, so "newest" isn't a wall of announced projects.
    [`${dateKey}.lte`]: range && `${range.to}-12-31` < today ? `${range.to}-12-31` : today,
    [`${dateKey}.gte`]: range ? `${range.from}-01-01` : undefined,
    ...(providers ? { watch_region: settings.region, with_watch_providers: providers, with_watch_monetization_types: 'flatrate|free|ads' } : {}),
  };
  const first = f.set * PER_SET + 1;
  const pages = await Promise.all(
    Array.from({ length: PER_SET }, (_, i) => first + i)
      .filter((p) => p <= TMDB_MAX_PAGE)
      .map((page) => discover(f.type, { ...params, page }).catch((e) => (page === first ? Promise.reject(e) : ({ results: [], total_pages: 0, total_results: 0, page } as TmdbPage)))),
  );
  const seen = new Set<number>();
  const titles = pages
    .flatMap((p) => p.results)
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => snapshotFromList(r, f.type));
  return { titles, total: pages[0]?.total_results ?? 0, pages: Math.min(pages[0]?.total_pages ?? 0, TMDB_MAX_PAGE) };
}

export default function Browse() {
  const { type: rawType } = useParams();
  const type: MediaType = rawType === 'tv' ? 'tv' : 'movie';
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const genreParam = Number(params.get('genre')) || undefined;
  const genre = genreParam && genresFor(type)[genreParam] ? genreParam : undefined;
  const f: Filters = {
    type,
    genre,
    sort: (SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'new') as Sort,
    year: params.get('year') ?? undefined,
    lang: params.get('lang') ?? undefined,
    theme: params.get('theme') ?? undefined,
    mine: params.get('mine') === '1',
    myLangs: params.get('mylangs') === '1',
    set: Math.max(0, Number(params.get('p')) || 0),
  };
  const [text, setText] = useState('');
  useEffect(() => setText([f.theme, f.year, f.lang && languageName(f.lang)].filter(Boolean).join(' ')), [f.theme, f.year, f.lang]);

  const update = (patch: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!keepPage) next.delete('p');
    setParams(next, { replace: !keepPage });
    if (keepPage) window.scrollTo({ top: 0 });
  };

  const keywords = useQuery({ queryKey: ['keywords', f.theme], queryFn: () => searchKeywords(f.theme!), enabled: !!f.theme && !!settings?.tmdbToken, staleTime: Infinity });
  // Up to three closest themes, e.g. "heist" → heist, bank heist, heist movie.
  const kw = [...(keywords.data?.results ?? [])]
    .sort((a, b) => Number(b.name.toLowerCase() === f.theme?.toLowerCase()) - Number(a.name.toLowerCase() === f.theme?.toLowerCase()))
    .slice(0, 3);
  const themeReady = !f.theme || keywords.isSuccess || keywords.isError;
  const results = useQuery({
    queryKey: ['browse', f, kw.map((k) => k.id), settings?.services, settings?.languages],
    queryFn: () => loadSet(f, settings!, kw.map((k) => k.id)),
    enabled: !!settings?.tmdbToken && themeReady && !(f.theme && !kw.length),
    placeholderData: keepPreviousData,
  });

  if (!settings) return null;
  const typeWord = type === 'movie' ? 'films' : 'shows';
  const heading = genre ? `${genresFor(type)[genre]} ${typeWord}` : f.lang ? `${languageName(f.lang)} ${typeWord}` : type === 'movie' ? 'Films' : 'Shows';
  const data = results.data;
  const from = f.set * PER_SET * 20 + 1;
  const hasNext = !!data && (f.set + 1) * PER_SET < data.pages;

  const switchType = (t: MediaType) => {
    if (t === type) return;
    const g = genre && (genresFor(t)[genre] ? genre : OTHER_TYPE_GENRE[genre]);
    const next = new URLSearchParams(params);
    if (g) next.set('genre', String(g));
    else next.delete('genre');
    next.delete('p');
    navigate(`/browse/${t}?${next}`, { replace: true });
  };

  const pager = data && (f.set > 0 || hasNext) && (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3 }}>
      <Button startIcon={<ArrowBackRoundedIcon />} disabled={f.set === 0} onClick={() => update({ p: f.set > 1 ? String(f.set - 1) : undefined }, true)}>
        Previous 100
      </Button>
      <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />} disabled={!hasNext} onClick={() => update({ p: String(f.set + 1) }, true)}>
        Next 100
      </Button>
    </Box>
  );

  return (
    <Box>
      <Typography variant="h4" component="h1">
        {heading}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {data && !results.isPlaceholderData ? (data.total ? `${SORTS.find((s) => s.key === f.sort)!.label} · ${from.toLocaleString('en-IN')}–${(from + data.titles.length - 1).toLocaleString('en-IN')} of ${data.total.toLocaleString('en-IN')}` : 'Nothing matches these filters.') : 'Loading…'}
      </Typography>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          const p = parseFilterText(text);
          update({ theme: p.theme, year: p.year, lang: p.lang });
        }}
      >
        <TextField
          fullWidth
          size="small"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filter by a word, year or language: heist 1990s Korean"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
              endAdornment: (
                <Button type="submit" size="small">
                  Apply
                </Button>
              ),
              sx: { borderRadius: '999px', bgcolor: 'background.paper' },
            },
            htmlInput: { 'aria-label': 'Filter by a word, year or language', enterKeyHint: 'search' },
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mt: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v) => v && switchType(v)} aria-label="Films or shows">
          <ToggleButton value="movie" sx={{ px: 2, textTransform: 'none' }}>
            Films
          </ToggleButton>
          <ToggleButton value="tv" sx={{ px: 2, textTransform: 'none' }}>
            Shows
          </ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Genre" value={genre ?? ''} onChange={(e) => update({ genre: e.target.value || undefined })} sx={{ minWidth: 160 }}>
          <MenuItem value="">Any genre</MenuItem>
          {Object.entries(genresFor(type))
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
        </TextField>
        <TextField select size="small" label="Sort" value={f.sort} onChange={(e) => update({ sort: e.target.value === 'new' ? undefined : e.target.value })} sx={{ minWidth: 150 }}>
          {SORTS.map((s) => (
            <MenuItem key={s.key} value={s.key}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Language" value={f.lang ?? ''} onChange={(e) => update({ lang: e.target.value || undefined })} sx={{ minWidth: 150 }}>
          <MenuItem value="">Any language</MenuItem>
          {[...new Set([...settings.languages, ...LANGUAGES.map((l) => l.code), ...WORLD_LANGUAGES])].map((code) => (
            <MenuItem key={code} value={code}>
              {languageName(code)}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel control={<Switch checked={f.mine} onChange={(e) => update({ mine: e.target.checked ? '1' : undefined })} />} label="On my services" />
        {!f.lang && <FormControlLabel control={<Switch checked={f.myLangs} onChange={(e) => update({ mylangs: e.target.checked ? '1' : undefined })} />} label="My languages" />}
      </Box>

      {(f.theme || f.year) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {f.theme && <Chip label={kw.length ? `Theme: ${kw.map((k) => k.name).join(' / ')}` : `Theme: ${f.theme}`} onDelete={() => update({ theme: undefined })} color={kw.length || !themeReady ? 'primary' : 'default'} variant="outlined" />}
          {f.year && <Chip label={`Year: ${f.year}`} onDelete={() => update({ year: undefined })} color="primary" variant="outlined" />}
        </Box>
      )}
      {f.theme && themeReady && !kw.length && (
        <Alert severity="info" sx={{ mt: 2 }}>
          TMDB has no theme called “{f.theme}”. Try a broader word like heist, revenge, cricket or time travel, or a year like 2019 or 1990s.
        </Alert>
      )}

      <Box sx={{ mt: 2.5 }}>
        <ErrorNote error={results.error} />
        {!data && results.isFetching ? (
          <PosterGrid>
            {Array.from({ length: 18 }, (_, i) => (
              <Skeleton key={i} variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '2 / 3' }} />
            ))}
          </PosterGrid>
        ) : (
          data && (
            <Box data-loading={results.isPlaceholderData || undefined} sx={{ opacity: results.isPlaceholderData ? 0.5 : 1, transition: 'opacity .2s' }}>
              <PosterGrid>
                {data.titles.map((s) => (
                  <PosterCard key={s.tmdbId} snap={s} subtitle={[s.year, languageName(s.originalLanguage)].filter(Boolean).join(' · ')} />
                ))}
              </PosterGrid>
            </Box>
          )
        )}
        {pager}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        Data from TMDB (not endorsed or certified by TMDB). Streaming availability by JustWatch.
      </Typography>
    </Box>
  );
}
