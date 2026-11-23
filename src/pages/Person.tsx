import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { Avatar, Box, Button, Chip, IconButton, LinearProgress, Skeleton, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { isOffline } from '../api/http';
import { getPerson, img } from '../api/tmdb';
import { ErrorNote } from '../components/common';
import PosterCard, { PosterGrid } from '../components/PosterCard';
import { StreamingSelect, useStreaming } from '../components/Streaming';
import { useToast } from '../components/Toast';
import { restoreFavourite, setFavourite, useIsFavourite } from '../db/people';
import { checkMany } from '../db/streaming';
import { departmentLabel } from '../lib/people';
import { isReleased, personCredits, type Credit } from '../lib/personCredits';
import { matchesStream, streamCounts, validStreamFilter } from '../lib/streaming';
import type { MediaType } from '../lib/types';
import { streamLabel } from '../components/ListView';

type Filter = 'all' | MediaType;

/** Titles looked up at a time when a Streaming filter is on (the rest wait for "Check more"). */
const CHECK_BATCH = 24;
/** ⟳ re-checks at most this many titles. */
const REFRESH_MAX = 40;

const shortDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export default function Person() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const [bioOpen, setBioOpen] = useState(false);
  const toast = useToast();
  const person = useQuery({ queryKey: ['person', id], queryFn: () => getPerson(id), enabled: id > 0 });
  const p = person.data;
  const favourite = useIsFavourite(id);
  const stream = useStreaming();

  const { acting, directing } = useMemo(() => personCredits(p), [p]);

  const directorFirst = p?.known_for_department === 'Directing' || (directing.length > acting.length && directing.length > 0);
  const tabs = (directorFirst ? (['directing', 'acting'] as const) : (['acting', 'directing'] as const)).filter((t) => (t === 'acting' ? acting : directing).length > 0);
  const tab = tabs.find((t) => t === params.get('tab')) ?? tabs[0];
  const filter = (params.get('type') as Filter) || 'all';
  const on = validStreamFilter(params.get('on'));
  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // What the Acting/Directing tab and Films/Shows chip show before the Streaming filter.
  const source = tab === 'directing' ? directing : acting;
  const typed = useMemo(() => source.filter((c) => filter === 'all' || c.snap.type === filter), [source, filter]);
  const fits = (c: Credit) => !on || matchesStream(stream.rows.get(c.key), on, stream.mine) === true;
  const shown = typed.filter(fits);
  // Titles we can ask about: released ones. Info is fetched a batch at a time, never for the whole filmography.
  const askable = typed.filter((c) => isReleased(c));
  const unchecked = askable.filter((c) => !stream.rows.has(c.key));
  const checkedHere = askable.filter((c) => stream.rows.has(c.key));
  const counts = useMemo(() => streamCounts(askable.map((c) => ({ key: c.key, tmdbId: c.snap.tmdbId })), stream.rows, stream.mine), [askable, stream]);

  const [progress, setProgress] = useState<{ kind: 'check' | 'refresh'; done: number; total: number } | null>(null);
  const tried = useRef(new Set<string>());
  const checkMore = (manual: boolean) => {
    if (progress || isOffline()) return;
    const todo = unchecked.filter((c) => manual || !tried.current.has(c.key)).slice(0, CHECK_BATCH);
    if (!todo.length) return;
    todo.forEach((c) => tried.current.add(c.key));
    void checkMany(todo.map((c) => c.snap), { onProgress: (done, total) => setProgress({ kind: 'check', done, total }) }).finally(() => setProgress(null));
  };
  // Turning a filter on (or changing tab/chip with one on) looks up the newest titles that have no info yet.
  useEffect(() => {
    if (on && p) checkMore(false);
  }, [on, tab, filter, p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    const todo = checkedHere.slice(0, REFRESH_MAX);
    if (progress || !todo.length) return;
    const { changed, failed } = await checkMany(todo.map((c) => c.snap), { fresh: true, onProgress: (done, total) => setProgress({ kind: 'refresh', done, total }) }).finally(() => setProgress(null));
    if (failed === todo.length) toast('Couldn’t reach TMDB just now. Your saved info is unchanged; try again later.', 'warning');
    else toast(changed ? `Updated. ${changed} title${changed === 1 ? '' : 's'} changed services.` : 'Up to date. No changes.', 'success');
  };

  const toggleFavourite = async () => {
    if (!p) return;
    const on = !favourite;
    const prev = await setFavourite(p, on);
    toast(on ? `${p.name} is now a favourite. Nothing was added to your lists.` : `${p.name} is no longer a favourite.`, 'info', { label: 'Undo', onClick: () => void restoreFavourite(p, prev) });
  };

  if (person.error) return <ErrorNote error={person.error} />;
  if (!p)
    return (
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Skeleton variant="circular" width={96} height={96} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="40%" height={40} />
          <Skeleton width="30%" />
        </Box>
      </Box>
    );

  const typeCounts = (src: Credit[]) => ({ all: src.length, movie: src.filter((c) => c.snap.type === 'movie').length, tv: src.filter((c) => c.snap.type === 'tv').length });
  // With a Streaming filter, counts are the titles that match so far (only titles that have been looked up can match).
  const n = typeCounts((tab === 'directing' ? directing : acting).filter(fits));
  const tabCount = (t: 'acting' | 'directing') => {
    const all = t === 'acting' ? acting : directing;
    return on ? `${all.filter(fits).length} of ${all.length}` : String(all.length);
  };
  const life = [p.birthday && `Born ${new Date(p.birthday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, p.place_of_birth, p.deathday && `Died ${new Date(p.deathday).getFullYear()}`].filter(Boolean).join(' · ');
  const oldest = checkedHere.reduce((m, c) => Math.min(m, stream.rows.get(c.key)!.checkedAt), Infinity);
  const onName = on ? streamLabel(on).replace(/^On /, '') : '';

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: { xs: 2, sm: 3 }, alignItems: 'flex-start' }}>
        <Avatar src={img(p.profile_path, 'w185')} alt="" sx={{ width: { xs: 88, sm: 120 }, height: { xs: 88, sm: 120 }, fontSize: 40 }}>
          {p.name[0]}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h4" component="h1" sx={{ lineHeight: 1.15 }}>
            {p.name}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {[departmentLabel(p.known_for_department), life].filter(Boolean).join(' · ')}
          </Typography>
          <Tooltip title={favourite ? 'Remove from your favourite people' : 'Keep an eye on this person. It adds nothing to your lists and helps shape your picks a little.'}>
            <span>
              <Button
                size="small"
                variant={favourite ? 'contained' : 'outlined'}
                color={favourite ? 'secondary' : 'inherit'}
                startIcon={favourite ? <FavoriteRoundedIcon /> : <FavoriteBorderRoundedIcon />}
                aria-pressed={!!favourite}
                disabled={favourite === undefined}
                onClick={() => void toggleFavourite()}
                sx={{ mt: 1, borderRadius: '999px', ...(!favourite && { borderColor: 'divider' }) }}
              >
                {favourite ? 'Favourite' : 'Add to favourites'}
              </Button>
            </span>
          </Tooltip>
          {p.biography && (
            <Box sx={{ mt: 1, maxWidth: 760 }}>
              <Typography variant="body2" sx={bioOpen ? { whiteSpace: 'pre-line' } : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.biography}
              </Typography>
              {p.biography.length > 280 && (
                <Button size="small" onClick={() => setBioOpen(!bioOpen)} sx={{ px: 0 }}>
                  {bioOpen ? 'Less' : 'More'}
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {tabs.length > 0 ? (
        <>
          <Tabs value={tab} onChange={(_, v) => set('tab', v)} sx={{ mt: 2, mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            {tabs.map((t) => (
              <Tab key={t} value={t} label={`${t === 'acting' ? 'Acting' : 'Directing'} (${tabCount(t)})`} />
            ))}
          </Tabs>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['all', 'movie', 'tv'] as const).map((k) => (
              <Chip key={k} label={`${k === 'all' ? 'All' : k === 'movie' ? 'Films' : 'Shows'} · ${n[k]}`} color={filter === k ? 'primary' : 'default'} variant={filter === k ? 'filled' : 'outlined'} onClick={() => set('type', k === 'all' ? undefined : k)} disabled={k !== 'all' && !n[k]} />
            ))}
            <Box sx={{ flex: 1 }} />
            <StreamingSelect value={on} onChange={(v) => set('on', v)} counts={counts} onOpen={() => checkMore(false)} showNone={false} />
            <Tooltip title={checkedHere.length ? `Where these stream was last checked ${shortDate(oldest)}. Tap to check again (up to ${REFRESH_MAX} titles).` : 'Nothing checked yet. Pick a Streaming option first.'}>
              <span>
                <IconButton aria-label="Check where these stream again" onClick={() => void refresh()} disabled={!checkedHere.length || !!progress || isOffline()}>
                  <RefreshRoundedIcon sx={progress?.kind === 'refresh' ? { animation: 'mm-spin 1s linear infinite', '@keyframes mm-spin': { to: { transform: 'rotate(360deg)' } } } : undefined} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          {progress && (
            <Box sx={{ mb: 1.5, maxWidth: 420 }} role="status">
              <Typography variant="body2" color="text.secondary">
                {progress.kind === 'refresh' ? `Refreshing ${progress.done} of ${progress.total}…` : `Checking where ${progress.done} of ${progress.total} stream…`}
              </Typography>
              <LinearProgress variant="determinate" value={progress.total ? (100 * progress.done) / progress.total : 0} sx={{ mt: 0.5, height: 3, borderRadius: '2px' }} />
            </Box>
          )}
          {on && !progress && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Showing {shown.length} of {typed.length} on {onName}. Checked {checkedHere.length} of {askable.length} released titles.{' '}
              {unchecked.length > 0 && (
                <Button size="small" onClick={() => checkMore(true)} sx={{ py: 0, verticalAlign: 'baseline' }}>
                  Check {Math.min(CHECK_BATCH, unchecked.length)} more
                </Button>
              )}
            </Typography>
          )}
          {shown.length ? (
            <PosterGrid>
              {shown.map((c) => (
                <PosterCard key={c.key} snap={c.snap} streaming="check" subtitle={[c.date ? c.date.slice(0, 4) : 'Upcoming', c.snap.type === 'tv' ? 'Series' : '', c.role].filter(Boolean).join(' · ')} />
              ))}
            </PosterGrid>
          ) : (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {progress
                ? 'Checking where these stream…'
                : unchecked.length
                  ? `None of the ${checkedHere.length} titles checked so far are on ${onName}. Tap “Check ${Math.min(CHECK_BATCH, unchecked.length)} more” to look further back.`
                  : `None of ${p.name}’s released titles here are on ${onName} right now.`}
            </Typography>
          )}
        </>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 3 }}>
          TMDB has no films or shows listed for {p.name} yet.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        Data from TMDB (not endorsed or certified by TMDB). Streaming availability by JustWatch.
      </Typography>
    </Box>
  );
}
