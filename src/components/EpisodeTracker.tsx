import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Checkbox, IconButton, LinearProgress, Skeleton, Tooltip, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getSeason, type TmdbDetails, type TmdbEpisode } from '../api/tmdb';
import { markSeenUpTo, refreshNextEpisode, setSeasonSeen, toggleEpisode, toggleList, useItem } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { airedSeasons, computeNextEpisode, countProgress, episodeLabel, hasAired, mainSeasons, type SeasonInfo } from '../lib/episodes';
import type { TitleSnapshot } from '../lib/types';
import { ErrorNote, SectionTitle } from './common';
import { useToast } from './Toast';

/** "12 Oct", with the year when it isn't this year. */
function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

const seasonKey = (tvId: number, season: number) => ['season', tvId, season];

/** "Your progress" on a TV title page: overall progress, next episode, and per-season episode checklists. */
export default function EpisodeTracker({ snap, show }: { snap: TitleSnapshot; show: TmdbDetails }) {
  const item = useItem('tv', snap.tmdbId);
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<number | false>(false);
  const seasons = mainSeasons(show.seasons ?? []);
  const aired = airedSeasons(seasons, show.last_episode_to_air);
  const seen = item?.episodesSeen;

  // Episode names come from season lists already loaded (expanded, or the next episode's season).
  const withNames = (): SeasonInfo[] => aired.map((s) => ({ ...s, episodes: qc.getQueryData<{ episodes: TmdbEpisode[] }>(seasonKey(snap.tmdbId, s.season_number))?.episodes }));
  const next = computeNextEpisode(seen ?? {}, aired);
  const progress = countProgress(seen, aired);
  const nextSeason = useQuery({ queryKey: seasonKey(snap.tmdbId, next?.season ?? 0), queryFn: () => getSeason(snap.tmdbId, next!.season), enabled: !!next && !!seen });
  const nextName = next && nextSeason.data?.episodes.find((e) => e.episode_number === next.episode)?.name;

  useEffect(() => {
    // Keeps the saved next episode fresh when new episodes air or a name loads.
    if (item?.episodesSeen && seasons.length) refreshNextEpisode(snap, withNames());
  }, [item?.updatedAt, nextSeason.data, show]);

  if (!seasons.length) return null;

  const mark = (how: string, run: () => Promise<unknown>) => run().then(() => trackEvent('episode_mark', { how }));
  const markNext = () => next && mark('next', () => toggleEpisode(snap, next.season, next.episode, true, withNames()));
  const caughtUp = progress.total > 0 && progress.seen >= progress.total;
  const ended = show.status === 'Ended' || show.status === 'Canceled';
  const upcoming = show.next_episode_to_air;

  return (
    <>
      <SectionTitle>Your progress</SectionTitle>
      <Box sx={{ maxWidth: 760 }}>
        <Card variant="outlined" sx={{ borderRadius: '20px', mb: 1.5 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            {progress.total === 0 ? (
              <Typography>No episodes out yet.{upcoming?.air_date ? ` The first one airs ${shortDate(upcoming.air_date)}.` : ''}</Typography>
            ) : (
              <>
                <Typography data-testid="episode-progress">
                  <b>
                    {progress.seen} of {progress.total} episodes
                  </b>
                  {next && seen ? (
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {' · Next: '}
                      {episodeLabel(next)}
                      {nextName ? ` “${nextName}”` : ''}
                    </Box>
                  ) : null}
                </Typography>
                <LinearProgress variant="determinate" value={(progress.seen / progress.total) * 100} color={caughtUp ? 'success' : 'primary'} sx={{ height: 6, borderRadius: '6px', my: 1.5 }} aria-label="Episodes watched" />
                {caughtUp ? (
                  ended && !item?.lists.includes('watched') ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ flex: '1 1 160px' }}>
                        You’ve seen every episode.
                      </Typography>
                      <Button variant="contained" color="success" size="small" startIcon={<CheckCircleRoundedIcon />} onClick={() => toggleList(snap, 'watched', true).then(() => toast('Added to Watched'))}>
                        Mark the show as watched
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {ended ? 'Finished. Nice one!' : `You’re all caught up.${upcoming?.air_date ? ` Next episode airs ${shortDate(upcoming.air_date)}.` : ''}`}
                    </Typography>
                  )
                ) : (
                  <Button variant="contained" size="small" startIcon={<PlaylistAddCheckRoundedIcon />} onClick={markNext}>
                    {seen || !next ? 'Mark next as watched' : `Mark ${episodeLabel(next)} as watched`}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {seasons.map((s) => {
          const airedCount = aired.find((a) => a.season_number === s.season_number)?.episode_count ?? 0;
          return (
            <SeasonPanel
              key={s.season_number}
              tvId={snap.tmdbId}
              season={s}
              airedCount={airedCount}
              seen={seen?.[String(s.season_number)] ?? []}
              expanded={open === s.season_number}
              onExpand={(x) => setOpen(x ? s.season_number : false)}
              onEpisode={(e, on) => mark('toggle', () => toggleEpisode(snap, s.season_number, e, on, withNames()))}
              onSeason={(on) => mark('season', () => setSeasonSeen(snap, s.season_number, airedCount, on, withNames()))}
              onUpTo={(e) => mark('upto', () => markSeenUpTo(snap, s.season_number, e, withNames())).then(() => toast(`Marked everything up to ${episodeLabel({ season: s.season_number, episode: e })}`, 'info'))}
            />
          );
        })}
      </Box>
    </>
  );
}

function SeasonPanel(props: {
  tvId: number;
  season: SeasonInfo & { air_date?: string | null };
  airedCount: number;
  seen: number[];
  expanded: boolean;
  onExpand: (open: boolean) => void;
  onEpisode: (episode: number, on: boolean) => void;
  onSeason: (on: boolean) => void;
  onUpTo: (episode: number) => void;
}) {
  const { tvId, season, airedCount, seen, expanded } = props;
  const n = season.season_number;
  const episodes = useQuery({ queryKey: seasonKey(tvId, n), queryFn: () => getSeason(tvId, n), enabled: expanded });
  const done = seen.filter((e) => e <= airedCount).length;
  const complete = airedCount > 0 && done >= airedCount;
  const title = season.name || `Season ${n}`;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, x) => props.onExpand(x)}
      disableGutters
      elevation={0}
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ mb: 1, border: 1, borderColor: 'divider', '&, &:first-of-type, &:last-of-type': { borderRadius: '12px' }, '&:before': { display: 'none' }, overflow: 'hidden' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 48, '& .MuiAccordionSummary-content': { my: 1, alignItems: 'center', gap: 1 } }}>
        <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
          {title}
        </Typography>
        {complete && <CheckCircleRoundedIcon color="success" fontSize="small" />}
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          {airedCount === 0 ? (season.air_date && !hasAired(season.air_date) ? `Airs ${shortDate(season.air_date)}` : 'Coming soon') : `${done}/${airedCount}`}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, px: { xs: 1, sm: 2 } }}>
        {airedCount > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
            <Button size="small" color="inherit" startIcon={<DoneAllRoundedIcon />} onClick={() => props.onSeason(!complete)}>
              {complete ? 'Mark season unwatched' : 'Mark season watched'}
            </Button>
          </Box>
        )}
        {episodes.error ? (
          <ErrorNote error={episodes.error} />
        ) : !episodes.data ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={44} />)
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {episodes.data.episodes.map((e) => (
              <EpisodeRow key={e.episode_number} season={n} episode={e} aired={e.episode_number <= airedCount || hasAired(e.air_date)} checked={seen.includes(e.episode_number)} onChange={(on) => props.onEpisode(e.episode_number, on)} onUpTo={() => props.onUpTo(e.episode_number)} />
            ))}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function EpisodeRow({ season, episode: e, aired, checked, onChange, onUpTo }: { season: number; episode: TmdbEpisode; aired: boolean; checked: boolean; onChange: (on: boolean) => void; onUpTo: () => void }) {
  const label = `${episodeLabel({ season, episode: e.episode_number })} ${e.name}`;
  const when = e.air_date ? (aired ? shortDate(e.air_date) : `Airs ${shortDate(e.air_date)}`) : aired ? '' : 'Not aired yet';
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: aired ? 1 : 0.6 }}>
      <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0, cursor: aired ? 'pointer' : 'default' }}>
        <Checkbox size="small" checked={checked} disabled={!aired} onChange={(_, on) => onChange(on)} slotProps={{ input: { 'aria-label': label } }} />
        <Typography variant="body2" color="text.secondary" sx={{ width: 24, flexShrink: 0, textAlign: 'right', mr: 1 }}>
          {e.episode_number}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0, py: 0.5 }}>
          <Typography variant="body2" noWrap>
            {e.name}
          </Typography>
          {when && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
              {when}
              {aired && e.runtime ? ` · ${e.runtime}m` : ''}
            </Typography>
          )}
        </Box>
      </Box>
      {aired && (
        <Tooltip title="Watched up to here">
          <IconButton size="small" aria-label={`Watched up to ${episodeLabel({ season, episode: e.episode_number })}`} onClick={onUpTo}>
            <DoneAllRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
