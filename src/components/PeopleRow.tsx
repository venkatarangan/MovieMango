import { Avatar, Box, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { img, titleOf, type TmdbListItem } from '../api/tmdb';
import { SectionTitle } from './common';

const role = (dept?: string) => (dept === 'Acting' ? 'Actor' : dept === 'Directing' ? 'Director' : dept === 'Writing' ? 'Writer' : (dept ?? ''));

/** Actors, directors and other crew that matched a search, as a scrollable row of avatars linking to their pages. */
export default function PeopleRow({ people }: { people: TmdbListItem[] }) {
  if (!people.length) return null;
  return (
    <Box component="section" aria-label="People">
      <SectionTitle>People</SectionTitle>
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1, scrollSnapType: 'x proximity' }}>
        {people.map((p) => {
          const name = titleOf(p);
          const known = p.known_for?.map((k) => k.title ?? k.name).find(Boolean);
          return (
            <Box
              key={p.id}
              component={RouterLink}
              to={`/person/${p.id}`}
              aria-label={`${name}, ${role(p.known_for_department) || 'person'}`}
              sx={{ flex: '0 0 auto', width: 104, textAlign: 'center', textDecoration: 'none', color: 'inherit', scrollSnapAlign: 'start', '&:hover .MuiAvatar-root': { boxShadow: 3 } }}
            >
              <Avatar src={img(p.profile_path, 'w185')} alt="" sx={{ width: 88, height: 88, mx: 'auto', fontSize: 32, transition: 'box-shadow .15s' }}>
                {name[0]}
              </Avatar>
              <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 600, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                {[role(p.known_for_department), known].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
