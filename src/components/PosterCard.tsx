import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, Card, CardActionArea, Chip, IconButton, Typography, type SxProps, type Theme } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { img } from '../api/tmdb';
import { titleHue } from '../lib/custom';
import { isCustom, type TitleSnapshot } from '../lib/types';
import { QuickActions, useSavedItem } from './TitleActions';

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

/** A poster linking to the title, with ＋ and 👎 on its corner. `onClick` cards (pickers) get no corner buttons. */
export default function PosterCard({ snap, subtitle, onClick, actions = !onClick }: { snap: TitleSnapshot; subtitle?: string; onClick?: () => void; actions?: boolean }) {
  const disliked = useSavedItem(snap)?.rating === 'dislike';
  return (
    <Card sx={{ bgcolor: 'transparent', overflow: 'visible', position: 'relative' }}>
      <CardActionArea
        component={onClick ? 'button' : RouterLink}
        {...(onClick ? { onClick } : { to: `/title/${snap.type}/${snap.tmdbId}` })}
        sx={{ borderRadius: '12px', textAlign: 'left', display: 'block' }}
      >
        <Box sx={{ position: 'relative', opacity: disliked ? 0.45 : 1, transition: 'opacity .2s' }}>
          <Poster path={snap.posterPath} title={snap.title} original={snap.custom?.originalTitle} />
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
      {actions && <QuickActions snap={snap} />}
    </Card>
  );
}

export function PosterGrid({ children, min = 130 }: { children: React.ReactNode; min?: number }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: { xs: 1.5, sm: 2 } }}>{children}</Box>;
}

const arrowSx = {
  position: 'absolute',
  top: '38%',
  transform: 'translateY(-50%)',
  zIndex: 3,
  width: 40,
  height: 40,
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  boxShadow: 3,
  '&:hover': { bgcolor: 'background.paper', boxShadow: 6 },
  // Touch screens swipe; arrows are for mouse and trackpad users.
  display: 'none',
  '@media (hover: hover) and (pointer: fine)': { display: 'inline-flex' },
} as const;

/** A horizontally scrolling row with ‹ › buttons for mouse users. */
export function ScrollRow({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft <= 4;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  useEffect(update); // content can change size after any render (posters load, items arrive)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <Box sx={{ position: 'relative' }}>
      <Box ref={ref} onScroll={update} className="no-scrollbar" sx={[{ overflowX: 'auto' }, ...(Array.isArray(sx) ? sx : [sx])]}>
        {children}
      </Box>
      {!edges.start && (
        <IconButton aria-label="Scroll left" onClick={() => scroll(-1)} sx={{ ...arrowSx, left: -12 }}>
          <ChevronLeftRoundedIcon />
        </IconButton>
      )}
      {!edges.end && (
        <IconButton aria-label="Scroll right" onClick={() => scroll(1)} sx={{ ...arrowSx, right: -12 }}>
          <ChevronRightRoundedIcon />
        </IconButton>
      )}
    </Box>
  );
}

export function PosterRow({ children }: { children: React.ReactNode }) {
  return <ScrollRow sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '34%', sm: '22%', md: '15%' }, gap: 1.5, pb: 1, scrollSnapType: 'x mandatory', '& > *': { scrollSnapAlign: 'start' } }}>{children}</ScrollRow>;
}
