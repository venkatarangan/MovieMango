import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Box, Button, Card, CardActionArea, CardContent, CircularProgress, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { latestReviews, parseReviewTitle, type ReviewSummary } from '../api/mangoidiots';
import { ChipGroup } from '../components/ChipGroup';
import { EmptyState, ErrorNote } from '../components/common';
import { MangoBadge } from '../components/Mango';
import ReviewReader from '../components/ReviewReader';
import { useSettings } from '../db/settings';
import type { MangoRating } from '../lib/types';

const FILTERS: { key: MangoRating | 'all'; label: string; emoji?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'delicious', label: 'Delicious', emoji: '🥭' },
  { key: 'ripe', label: 'Ripe', emoji: '🥭' },
  { key: 'raw', label: 'Raw', emoji: '🥭' },
  { key: 'rotten', label: 'Rotten', emoji: '🥭' },
];

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#8217;/g, '’').replace(/&#8230;|&hellip;/g, '…').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

export default function Reviews() {
  const settings = useSettings();
  const [filter, setFilter] = useState<MangoRating | 'all'>('all');
  const [open, setOpen] = useState<ReviewSummary | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['mango-latest', filter],
    queryFn: ({ pageParam }) => latestReviews(filter === 'all' ? undefined : filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.length === 20 ? pages.length + 1 : undefined),
  });
  const reviews = q.data?.pages.flat() ?? [];

  if (settings && !settings.useMangoidiots)
    return (
      <EmptyState title="Mangoidiots reviews are turned off">
        <Button component={RouterLink} to="/settings">Turn them on in Settings</Button>
      </EmptyState>
    );

  return (
    <Box>
      <Typography variant="h4" component="h1">
        Mangoidiots reviews
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Unpaid, unsponsored, unapologetically mango: honest reviews from{' '}
        <a href="https://mangoidiots.com" target="_blank" rel="noopener noreferrer">mangoidiots.com</a>.
      </Typography>
      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
      <Box sx={{ mt: 2 }}>
        <ErrorNote error={q.error} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2, mt: 2 }}>
        {reviews.map((r) => {
          const { name } = parseReviewTitle(r.title);
          return (
            <Card key={r.id} variant="outlined" sx={{ borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
              <CardActionArea onClick={() => setOpen(r)} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
                {r.poster && <Box component="img" src={r.poster} alt="" loading="lazy" sx={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />}
                <CardContent>
                  {r.rating && <MangoBadge rating={r.rating} size="small" />}
                  <Typography sx={{ fontWeight: 600, mt: 1, lineHeight: 1.3 }}>{r.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {plain(r.excerptHtml)}
                  </Typography>
                </CardContent>
              </CardActionArea>
              <Box sx={{ px: 1, pb: 1 }}>
                <Button size="small" startIcon={<SearchRoundedIcon />} component={RouterLink} to={`/search?q=${encodeURIComponent(name)}`} color="inherit">
                  Find “{name}”
                </Button>
              </Box>
            </Card>
          );
        })}
      </Box>
      {q.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {q.hasNextPage && (
        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Button variant="outlined" color="inherit" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? 'Loading…' : 'More reviews'}
          </Button>
        </Box>
      )}
      {open && <ReviewReader review={open} open onClose={() => setOpen(null)} />}
    </Box>
  );
}
