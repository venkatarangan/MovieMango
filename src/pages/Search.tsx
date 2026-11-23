import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Box, Button, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { mediaTypeOf, searchMulti, snapshotFromList, trending } from '../api/tmdb';
import { EmptyState, ErrorNote, SectionTitle } from '../components/common';
import CustomTitleDialog from '../components/CustomTitleDialog';
import PeopleRow from '../components/PeopleRow';
import PosterCard, { PosterGrid } from '../components/PosterCard';
import { trackEvent } from '../lib/analytics';
import { languageName } from '../lib/languages';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const query = useDebounced(text.trim(), 350);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  // "Search the clipboard text" while already on this page: put the copied text in the box.
  const paste = (useLocation().state as { paste?: { text: string; at: number } } | null)?.paste;
  useEffect(() => {
    if (paste) setText(paste.text);
  }, [paste?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true });
    if (query) trackEvent('search');
  }, [query, setParams]);

  const results = useQuery({ queryKey: ['search', query], queryFn: () => searchMulti(query), enabled: query.length > 1 });
  const popular = useQuery({ queryKey: ['trending'], queryFn: () => trending('week'), enabled: !query });

  const raw = query ? results.data?.results : popular.data?.results;
  const list = raw?.filter((r) => r.media_type !== 'person' && (r.poster_path || r.vote_count)) ?? [];
  // Actors, directors and crew that match the text (TMDB ranks them with the titles). Shown above the titles when a person is the
  // best match (searching a name), below them when a title is (searching a title that happens to share a name).
  const people = query ? (raw?.filter((r) => r.media_type === 'person' && (r.profile_path || r.known_for?.length)).slice(0, 12) ?? []) : [];
  const peopleFirst = people.length > 0 && raw?.[0]?.media_type === 'person';

  return (
    <Box>
      <TextField
        fullWidth
        autoFocus
        placeholder="Search movies, TV shows and people"
        value={text}
        onChange={(e) => setText(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon />
              </InputAdornment>
            ),
            endAdornment: results.isFetching ? <CircularProgress size={20} /> : undefined,
            sx: { borderRadius: '999px', bgcolor: 'background.paper' },
          },
          htmlInput: { 'aria-label': 'Search movies and TV shows', enterKeyHint: 'search' },
        }}
      />
      <ErrorNote error={results.error ?? popular.error} />
      <SectionTitle>{query ? `Results for “${query}”` : 'Trending this week'}</SectionTitle>
      {query && results.isSuccess && list.length === 0 && people.length === 0 ? (
        <EmptyState emoji="🔍" title="No matches">
          Try the original title, or check the spelling.
          <Box sx={{ mt: 2 }}>
            <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>
              Add your own title
            </Button>
          </Box>
        </EmptyState>
      ) : (
        <>
          {peopleFirst && <PeopleRow people={people} />}
          {people.length > 0 && list.length > 0 && <SectionTitle>Films and shows</SectionTitle>}
          <PosterGrid>
            {list.map((r) => {
              const type = mediaTypeOf(r);
              const snap = snapshotFromList(r, type);
              return <PosterCard key={`${type}:${r.id}`} snap={snap} subtitle={[snap.year, type === 'tv' ? 'Series' : 'Movie', languageName(r.original_language)].filter(Boolean).join(' · ')} />;
            })}
          </PosterGrid>
          {!peopleFirst && <PeopleRow people={people} />}
        </>
      )}
      {(results.isLoading || popular.isLoading) && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {!query && !popular.isLoading && list.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Trending data from TMDB.
        </Typography>
      )}
      {query && results.isSuccess && (list.length > 0 || people.length > 0) && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Button startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>
            Can’t find it? Add your own title
          </Button>
        </Box>
      )}
      <CustomTitleDialog open={adding} onClose={() => setAdding(false)} initialTitle={query} onSaved={(s) => navigate(`/title/${s.type}/${s.tmdbId}`)} />
    </Box>
  );
}
