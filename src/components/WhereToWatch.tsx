import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { Box, Button, Link, Typography } from '@mui/material';
import { img } from '../api/tmdb';
import { trackEvent } from '../lib/analytics';
import { linkHost } from '../lib/notes';
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

/** The user's own watch link: always shows where it goes, opens in a new tab without telling the site where you came from. */
export function MyLinkButton({ url }: { url: string }) {
  return (
    <Button href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" variant="outlined" color="inherit" startIcon={<LinkRoundedIcon />} endIcon={<OpenInNewRoundedIcon />} onClick={() => trackEvent('my_link_click')} sx={{ textTransform: 'none' }}>
      Your link
      <Typography component="span" variant="caption" sx={{ ml: 0.75, opacity: 0.8 }}>
        {linkHost(url)}
      </Typography>
    </Button>
  );
}

export function WhereToWatch({ availability, title, myServices, justWatchLink, myLink }: { availability: Availability[]; title: string; myServices: string[]; justWatchLink?: string; myLink?: string }) {
  return (
    <Box>
      {availability.length ? (
        <PlayButtons availability={availability} title={title} myServices={myServices} />
      ) : (
        <Typography color="text.secondary">Not streaming on the major services in India right now (subscription or free).</Typography>
      )}
      {myLink && (
        <Box sx={{ mt: 1 }}>
          <MyLinkButton url={myLink} />
        </Box>
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
