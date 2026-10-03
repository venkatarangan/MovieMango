import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { Box, Button, Link, Typography } from '@mui/material';
import { img } from '../api/tmdb';
import { trackEvent } from '../lib/analytics';
import { playUrl, type Availability } from '../lib/providers';

const ACCESS = { subscription: 'Subscription', free: 'Free', ads: 'Free with ads' } as const;

export function PlayButtons({ availability, title, myServices, compact }: { availability: Availability[]; title: string; myServices: string[]; compact?: boolean }) {
  const mine = availability.filter((a) => myServices.includes(a.service.key));
  const shown = compact ? (mine.length ? mine : availability).slice(0, 2) : availability;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {shown.map((a) => (
        <Button
          key={a.service.key}
          href={playUrl(a.service, title)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('play_click', { service: a.service.key })}
          variant={myServices.includes(a.service.key) ? 'contained' : 'outlined'}
          color={myServices.includes(a.service.key) ? 'secondary' : 'inherit'}
          size={compact ? 'small' : 'medium'}
          startIcon={
            a.logoPath ? (
              <Box component="img" src={img(a.logoPath, 'w92')} alt="" sx={{ width: 20, height: 20, borderRadius: '6px' }} />
            ) : (
              <PlayArrowRoundedIcon />
            )
          }
          endIcon={<PlayArrowRoundedIcon />}
        >
          {a.service.name}
          {!compact && (
            <Typography component="span" variant="caption" sx={{ ml: 0.75, opacity: 0.8 }}>
              {ACCESS[a.access]}
            </Typography>
          )}
        </Button>
      ))}
    </Box>
  );
}

export function WhereToWatch({ availability, title, myServices, justWatchLink }: { availability: Availability[]; title: string; myServices: string[]; justWatchLink?: string }) {
  return (
    <Box>
      {availability.length ? (
        <PlayButtons availability={availability} title={title} myServices={myServices} />
      ) : (
        <Typography color="text.secondary">Not streaming on the major services in India right now (subscription or free).</Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Streaming availability by{' '}
        <Link href={justWatchLink || 'https://www.justwatch.com/in'} target="_blank" rel="noopener noreferrer" color="inherit">
          JustWatch
        </Link>
        . Play opens the service’s site or app; sign in there to watch.
      </Typography>
    </Box>
  );
}
