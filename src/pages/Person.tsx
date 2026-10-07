import { Avatar, Box, Button, Chip, Skeleton, Tab, Tabs, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { getPerson, img, snapshotFromList, type TmdbCredit } from '../api/tmdb';
import { ErrorNote } from '../components/common';
import PosterCard, { PosterGrid } from '../components/PosterCard';
import type { MediaType, TitleSnapshot } from '../lib/types';

/** Talk, news and reality shows, where actors mostly appear as themselves. */
const NOT_ACTING_GENRES = [10763, 10764, 10767];
const isSelf = (c: TmdbCredit) => /\b(self|himself|herself|themselves|host|narrator)\b/i.test(c.character ?? '');

const dateOf = (c: TmdbCredit) => c.release_date || c.first_air_date || '';

interface Credit {
  snap: TitleSnapshot;
  role: string;
  date: string;
}

/** One entry per title, newest first; titles with no date yet (announced) go first. */
function collect(credits: TmdbCredit[], role: (c: TmdbCredit) => string): Credit[] {
  const byKey = new Map<string, Credit>();
  for (const c of credits) {
    const key = `${c.media_type}:${c.id}`;
    const existing = byKey.get(key);
    const r = role(c);
    if (existing) {
      if (r && !existing.role.includes(r)) existing.role = [existing.role, r].filter(Boolean).join(', ');
      continue;
    }
    byKey.set(key, { snap: snapshotFromList(c, c.media_type), role: r, date: dateOf(c) });
  }
  return [...byKey.values()].sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));
}

type Filter = 'all' | MediaType;

export default function Person() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const [bioOpen, setBioOpen] = useState(false);
  const person = useQuery({ queryKey: ['person', id], queryFn: () => getPerson(id), enabled: id > 0 });
  const p = person.data;

  const { acting, directing } = useMemo(() => {
    const cast = (p?.combined_credits?.cast ?? []).filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && !isSelf(c) && !c.genre_ids?.some((g) => NOT_ACTING_GENRES.includes(g)));
    const crew = (p?.combined_credits?.crew ?? []).filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && (c.job === 'Director' || c.job === 'Creator'));
    return {
      acting: collect(cast, (c) => c.character ?? ''),
      directing: collect(crew, (c) => (c.job === 'Creator' ? 'Creator' : c.media_type === 'tv' ? `Director${c.episode_count ? `, ${c.episode_count} ep` : ''}` : '')),
    };
  }, [p]);

  const directorFirst = p?.known_for_department === 'Directing' || (directing.length > acting.length && directing.length > 0);
  const tabs = (directorFirst ? (['directing', 'acting'] as const) : (['acting', 'directing'] as const)).filter((t) => (t === 'acting' ? acting : directing).length > 0);
  const tab = tabs.find((t) => t === params.get('tab')) ?? tabs[0];
  const filter = (params.get('type') as Filter) || 'all';
  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
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

  const list = (tab === 'directing' ? directing : acting).filter((c) => filter === 'all' || c.snap.type === filter);
  const counts = (src: Credit[]) => ({ all: src.length, movie: src.filter((c) => c.snap.type === 'movie').length, tv: src.filter((c) => c.snap.type === 'tv').length });
  const n = counts(tab === 'directing' ? directing : acting);
  const life = [p.birthday && `Born ${new Date(p.birthday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, p.place_of_birth, p.deathday && `Died ${new Date(p.deathday).getFullYear()}`].filter(Boolean).join(' · ');

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
            {[p.known_for_department === 'Acting' ? 'Actor' : p.known_for_department === 'Directing' ? 'Director' : p.known_for_department, life].filter(Boolean).join(' · ')}
          </Typography>
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
              <Tab key={t} value={t} label={`${t === 'acting' ? 'Acting' : 'Directing'} (${(t === 'acting' ? acting : directing).length})`} />
            ))}
          </Tabs>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {(['all', 'movie', 'tv'] as const).map((k) => (
              <Chip key={k} label={`${k === 'all' ? 'All' : k === 'movie' ? 'Films' : 'Shows'} · ${n[k]}`} color={filter === k ? 'primary' : 'default'} variant={filter === k ? 'filled' : 'outlined'} onClick={() => set('type', k === 'all' ? undefined : k)} disabled={k !== 'all' && !n[k]} />
            ))}
          </Box>
          <PosterGrid>
            {list.map((c) => (
              <PosterCard key={`${c.snap.type}:${c.snap.tmdbId}`} snap={c.snap} subtitle={[c.date ? c.date.slice(0, 4) : 'Upcoming', c.snap.type === 'tv' ? 'Series' : '', c.role].filter(Boolean).join(' · ')} />
            ))}
          </PosterGrid>
        </>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 3 }}>
          TMDB has no films or shows listed for {p.name} yet.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        Data from TMDB (not endorsed or certified by TMDB).
      </Typography>
    </Box>
  );
}
