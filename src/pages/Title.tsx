import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PlayCircleRoundedIcon from '@mui/icons-material/PlayCircleRounded';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { findReview, getReview } from '../api/mangoidiots';
import { certificationOf, getDetails, img, mediaTypeOf, snapshotFromDetails, snapshotFromList, titleOf } from '../api/tmdb';
import { wikiSummaryForWikidata } from '../api/wiki';
import { summariseReview } from '../ai/tasks';
import { ErrorNote, SectionTitle } from '../components/common';
import CustomTitleView from '../components/CustomTitleView';
import { useEngine } from '../components/EngineContext';
import ListActions from '../components/ListActions';
import { MangoBadge, MangoRatingPicker } from '../components/Mango';
import PosterCard, { Poster, PosterRow } from '../components/PosterCard';
import ReviewReader from '../components/ReviewReader';
import ShareButton from '../components/ShareButton';
import { WhereToWatch } from '../components/WhereToWatch';
import { setRating, useItem } from '../db/items';
import { useSettings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { safeFilename, titleToText } from '../lib/exportText';
import { formatRuntime } from '../lib/format';
import { languageName } from '../lib/languages';
import { availabilityFrom } from '../lib/providers';
import type { MediaType } from '../lib/types';

const stripTags = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, (m) => ({ '&nbsp;': ' ', '&amp;': '&', '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&#8230;': '…', '&hellip;': '…' })[m] ?? ' ').replace(/\s+/g, ' ').trim();

/** Custom titles (negative ids) never touch TMDB. */
export default function Title() {
  const { type, id } = useParams();
  return Number(id) < 0 ? <CustomTitleView type={type === 'tv' ? 'tv' : 'movie'} id={Number(id)} /> : <TmdbTitle />;
}

function TmdbTitle() {
  const { type: rawType, id: rawId } = useParams();
  const type = (rawType === 'tv' ? 'tv' : 'movie') as MediaType;
  const id = Number(rawId);
  const settings = useSettings();
  const item = useItem(type, id);
  const { engine } = useEngine();
  const [readerOpen, setReaderOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string[] | null>(null);
  const [summarising, setSummarising] = useState(false);
  const [showWiki, setShowWiki] = useState(false);

  const details = useQuery({ queryKey: ['details', type, id], queryFn: () => getDetails(type, id), enabled: !!id });
  const d = details.data;
  const snap = useMemo(() => (d ? snapshotFromDetails(d, type) : null), [d, type]);
  const year = snap?.year;
  const titles = d ? [...new Set([titleOf(d), d.original_title ?? d.original_name ?? ''].filter(Boolean))] : [];

  const review = useQuery({ queryKey: ['mango', type, id], queryFn: () => findReview(titles, year), enabled: !!d && !!settings?.useMangoidiots });
  const wiki = useQuery({ queryKey: ['wiki', d?.external_ids?.wikidata_id], queryFn: () => wikiSummaryForWikidata(d!.external_ids!.wikidata_id!), enabled: !!d?.external_ids?.wikidata_id });

  if (details.error) return <ErrorNote error={details.error} />;
  if (!d || !snap || !settings)
    return (
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Skeleton variant="rounded" width={200} height={300} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="60%" height={48} />
          <Skeleton width="40%" />
          <Skeleton height={120} />
        </Box>
      </Box>
    );

  const region = d['watch/providers']?.results?.[settings.region];
  const availability = availabilityFrom(region);
  const cert = certificationOf(d, settings.region);
  const director = d.credits?.crew.find((c) => c.job === 'Director')?.name ?? d.created_by?.[0]?.name;
  const cast = d.credits?.cast.slice(0, 12) ?? [];
  const trailer = d.videos?.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ?? d.videos?.results.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  const recs = (d.recommendations?.results ?? []).filter((r) => r.poster_path).slice(0, 18);
  const meta = [
    snap.year,
    type === 'tv' ? `${d.number_of_seasons ?? '?'} season${d.number_of_seasons === 1 ? '' : 's'}` : null,
    snap.runtime ? formatRuntime(snap.runtime) + (type === 'tv' ? ' per episode' : '') : null,
    languageName(snap.originalLanguage),
    cert,
  ].filter(Boolean);

  const exportText = () =>
    titleToText({
      snap,
      overview: d.overview,
      genres: d.genres.map((g) => g.name),
      director,
      cast: cast.map((c) => c.name),
      seasons: d.number_of_seasons,
      availability,
      myRating: item?.rating,
      mangoidiots: review.data ? { rating: review.data.rating, link: review.data.link } : undefined,
    });

  const summarise = async () => {
    if (!engine || !review.data) return;
    setSummarising(true);
    try {
      const full = await getReview(review.data.id);
      setAiSummary(await summariseReview(engine, snap.title, stripTags(full.html)));
      trackEvent('review_ai_summary');
    } catch (e) {
      setAiSummary([`Couldn’t summarise: ${(e as Error).message}`]);
    } finally {
      setSummarising(false);
    }
  };

  return (
    <Box>
      {d.backdrop_path && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 64,
            height: { xs: 260, md: 380 },
            backgroundImage: `url(${img(d.backdrop_path, 'w1280')})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 20%',
            opacity: 0.22,
            maskImage: 'linear-gradient(to bottom, black 30%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', gap: { xs: 2, md: 4 }, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'center', sm: 'flex-start' } }}>
        <Box sx={{ width: { xs: 180, sm: 220, md: 260 }, flexShrink: 0, boxShadow: 6, borderRadius: '12px' }}>
          <Poster path={snap.posterPath} title={snap.title} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          <Typography variant="h4" component="h1" sx={{ lineHeight: 1.15 }}>
            {snap.title}
          </Typography>
          {d.original_title && d.original_title !== snap.title && (
            <Typography color="text.secondary">{d.original_title}</Typography>
          )}
          {d.original_name && d.original_name !== snap.title && <Typography color="text.secondary">{d.original_name}</Typography>}
          {d.tagline && (
            <Typography sx={{ fontStyle: 'italic', mt: 0.5 }} color="text.secondary">
              “{d.tagline}”
            </Typography>
          )}
          <Typography sx={{ mt: 1 }} color="text.secondary">
            {meta.join(' · ')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5, alignItems: 'center' }}>
            {snap.voteAverage ? <Chip size="small" label={`TMDB ${snap.voteAverage.toFixed(1)}`} color="secondary" /> : null}
            {review.data?.rating && <MangoBadge rating={review.data.rating} size="small" label={`Mangoidiots: ${review.data.rating[0].toUpperCase()}${review.data.rating.slice(1)}`} />}
            {d.genres.map((g) => (
              <Chip key={g.id} size="small" label={g.name} variant="outlined" />
            ))}
          </Box>
          {director && (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {type === 'tv' ? 'Created by' : 'Directed by'} <b>{director}</b>
            </Typography>
          )}

          <Box sx={{ mt: 2 }}>
            <ListActions snap={snap} />
          </Box>
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            {trailer && (
              <Button href={`https://www.youtube.com/watch?v=${trailer.key}`} target="_blank" rel="noopener noreferrer" startIcon={<PlayCircleRoundedIcon />} variant="outlined" color="inherit">
                Trailer
              </Button>
            )}
            <ShareButton title={snap.title} filename={safeFilename(`${snap.title}${snap.year ? `-${snap.year}` : ''}`)} build={exportText} what="title" />
          </Box>
        </Box>
      </Box>

      <SectionTitle>Where to watch in India</SectionTitle>
      <WhereToWatch availability={availability} title={snap.title} myServices={settings.services} justWatchLink={region?.link} />

      <SectionTitle>Your rating</SectionTitle>
      <MangoRatingPicker value={item?.rating} onChange={(r) => setRating(snap, r).then(() => trackEvent('rate', { rating: r ?? 'none' }))} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        Rating a title also marks it as watched, and teaches MovieMango your taste.
      </Typography>

      {settings.useMangoidiots && review.data && (
        <>
          <SectionTitle>Mangoidiots review</SectionTitle>
          <Card variant="outlined" sx={{ borderRadius: '20px' }}>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                {review.data.rating && <MangoBadge rating={review.data.rating} />}
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {review.data.title}
                </Typography>
              </Box>
              {aiSummary ? (
                <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
                  {aiSummary.map((p, i) => (
                    <Typography component="li" key={i} variant="body2" sx={{ mb: 0.5 }}>
                      {p}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {stripTags(review.data.excerptHtml)}
                </Typography>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <Button variant="contained" color="secondary" startIcon={<MenuBookRoundedIcon />} onClick={() => { setReaderOpen(true); trackEvent('review_read'); }}>
                  Read full review
                </Button>
                {engine && !aiSummary && (
                  <Button variant="outlined" color="inherit" startIcon={summarising ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />} onClick={summarise} disabled={summarising}>
                    AI summary
                  </Button>
                )}
                <Button href={review.data.link} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon />} color="inherit">
                  On Mangoidiots
                </Button>
              </Box>
            </CardContent>
          </Card>
          <ReviewReader review={review.data} open={readerOpen} onClose={() => setReaderOpen(false)} />
        </>
      )}

      <SectionTitle>Story</SectionTitle>
      <Typography sx={{ maxWidth: 760 }}>{d.overview || 'No overview yet.'}</Typography>
      {wiki.data && (
        <Box sx={{ mt: 1.5, maxWidth: 760 }}>
          {showWiki ? (
            <Alert icon={false} severity="info" sx={{ bgcolor: 'action.hover', color: 'text.primary' }}>
              <Typography variant="body2">{wiki.data.extract}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                From{' '}
                <Link href={wiki.data.url} target="_blank" rel="noopener noreferrer" color="inherit">
                  Wikipedia
                </Link>
                , CC BY-SA 4.0.
              </Typography>
            </Alert>
          ) : (
            <Button size="small" onClick={() => setShowWiki(true)}>
              More from Wikipedia
            </Button>
          )}
        </Box>
      )}

      {cast.length > 0 && (
        <>
          <SectionTitle>Cast</SectionTitle>
          <Box className="no-scrollbar" sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            {cast.map((c) => (
              <Stack key={c.id} sx={{ width: 84, flexShrink: 0, textAlign: 'center', alignItems: 'center' }}>
                <Avatar src={img(c.profile_path, 'w185')} alt="" sx={{ width: 64, height: 64 }}>
                  {c.name[0]}
                </Avatar>
                <Typography variant="caption" sx={{ fontWeight: 600, mt: 0.5, lineHeight: 1.2 }}>
                  {c.name}
                </Typography>
                {c.character && (
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                    {c.character}
                  </Typography>
                )}
              </Stack>
            ))}
          </Box>
        </>
      )}

      {recs.length > 0 && (
        <>
          <SectionTitle>More like this</SectionTitle>
          <PosterRow>
            {recs.map((r) => {
              const t = mediaTypeOf(r, type);
              return <PosterCard key={`${t}:${r.id}`} snap={snapshotFromList(r, t)} />;
            })}
          </PosterRow>
        </>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        Data from{' '}
        <Link component={RouterLink} to="/about" color="inherit">
          TMDB
        </Link>{' '}
        (not endorsed or certified by TMDB). Streaming availability by JustWatch.
      </Typography>
    </Box>
  );
}
