import { Box, Card, CardActionArea, Chip, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { img } from '../api/tmdb';
import { titleHue } from '../lib/custom';
import { isCustom, type TitleSnapshot } from '../lib/types';
import { MangoBadge } from './Mango';
import type { MangoRating } from '../lib/types';

export function Poster({ path, title, width = '100%', original }: { path?: string | null; title: string; width?: number | string; original?: string }) {
  const hue = titleHue(title);
  return (
    <Box
      sx={{
        width,
        aspectRatio: '2 / 3',
        borderRadius: '12px',
        overflow: 'hidden',
        bgcolor: 'action.hover',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        containerType: 'inline-size',
        ...(!path && { background: `linear-gradient(160deg, hsl(${hue} 42% 46%), hsl(${(hue + 40) % 360} 35% 22%))` }),
      }}
    >
      {path ? (
        <Box component="img" src={img(path, 'w342')} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Box aria-hidden sx={{ p: '8cqi', textAlign: 'center', color: '#fff', overflow: 'hidden', maxHeight: '100%' }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.15, fontSize: 'clamp(9px, 11cqi, 30px)', overflowWrap: 'break-word', textShadow: '0 1px 3px rgba(0,0,0,.35)' }}>{title}</Typography>
          {original && original !== title && <Typography sx={{ mt: '4cqi', opacity: 0.85, lineHeight: 1.2, fontSize: 'clamp(8px, 8cqi, 22px)', overflowWrap: 'break-word' }}>{original}</Typography>}
        </Box>
      )}
    </Box>
  );
}

export default function PosterCard({ snap, subtitle, rating, onClick }: { snap: TitleSnapshot; subtitle?: string; rating?: MangoRating; onClick?: () => void }) {
  return (
    <Card sx={{ bgcolor: 'transparent', overflow: 'visible' }}>
      <CardActionArea
        component={onClick ? 'button' : RouterLink}
        {...(onClick ? { onClick } : { to: `/title/${snap.type}/${snap.tmdbId}` })}
        sx={{ borderRadius: '12px', textAlign: 'left', display: 'block' }}
      >
        <Box sx={{ position: 'relative' }}>
          <Poster path={snap.posterPath} title={snap.title} original={snap.custom?.originalTitle} />
          {rating && (
            <Box sx={{ position: 'absolute', top: 6, left: 6 }}>
              <MangoBadge rating={rating} size="small" />
            </Box>
          )}
          {isCustom(snap) && (
            <Chip label="Custom" size="small" sx={{ position: 'absolute', bottom: 6, right: 6, height: 20, fontSize: 11, fontWeight: 600, bgcolor: 'rgba(0,0,0,.45)', color: '#fff' }} />
          )}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.75, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {snap.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {subtitle ?? [snap.year, snap.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}
        </Typography>
      </CardActionArea>
    </Card>
  );
}

export function PosterGrid({ children, min = 130 }: { children: React.ReactNode; min?: number }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: { xs: 1.5, sm: 2 } }}>{children}</Box>;
}

export function PosterRow({ children }: { children: React.ReactNode }) {
  return (
    <Box className="no-scrollbar" sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '34%', sm: '22%', md: '15%' }, gap: 1.5, overflowX: 'auto', pb: 1, scrollSnapType: 'x mandatory', '& > *': { scrollSnapAlign: 'start' } }}>
      {children}
    </Box>
  );
}
