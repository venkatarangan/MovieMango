import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CollectionsBookmarkRoundedIcon from '@mui/icons-material/CollectionsBookmarkRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import RateReviewRoundedIcon from '@mui/icons-material/RateReviewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { AppBar, BottomNavigation, BottomNavigationAction, Box, Button, Container, Link, Paper, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router';
import { APP_VERSION, BUILD_ID, SOURCE_URL } from '../lib/appInfo';
import { SyncIndicator } from './Drive';
import { Wordmark } from './Logo';

const NAV = [
  { to: '/', label: 'Home', icon: <HomeRoundedIcon /> },
  { to: '/tonight', label: 'Tonight', icon: <AutoAwesomeRoundedIcon /> },
  { to: '/library', label: 'Library', icon: <CollectionsBookmarkRoundedIcon /> },
  { to: '/reviews', label: 'Reviews', icon: <RateReviewRoundedIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsRoundedIcon /> },
];

const CHANGELOG_URL = `${SOURCE_URL}/blob/main/CHANGELOG.md`;

/** A short footer: on phones it ends each page's content (the tab bar replaces the page footer); also on Welcome. */
export function SmallFooter() {
  return (
    <Box component="footer" sx={{ mt: 5, pt: 2, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        🔒 Private · 💸 Free · 🔓 Open · 🧠 Local AI by default
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        <Link component={RouterLink} to="/about" color="inherit">About</Link> · <Link component={RouterLink} to="/privacy" color="inherit">Privacy</Link> ·{' '}
        <Link href="https://mangoidiots.com" target="_blank" rel="noopener noreferrer" color="inherit">Mangoidiots</Link> ·{' '}
        <Link href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" color="inherit" title={`What’s new · build ${BUILD_ID}`}>v{APP_VERSION}</Link>
      </Typography>
    </Box>
  );
}

function activeIndex(path: string) {
  if (path === '/' || path.startsWith('/search')) return 0;
  const i = NAV.findIndex((n) => n.to !== '/' && path.startsWith(n.to));
  if (path.startsWith('/list')) return 2;
  return i;
}

export default function Layout() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const active = activeIndex(location.pathname);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="sticky" sx={{ bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider', backdropFilter: 'blur(8px)' }}>
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ gap: 1, px: { xs: 2, sm: 3 } }}>
            <Box component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', mr: 'auto' }} aria-label="MovieMango home">
              <Wordmark size={34} />
            </Box>
            <SyncIndicator />
            {location.pathname !== '/' && location.pathname !== '/search' && (
              <Button component={RouterLink} to="/search" color="inherit" aria-label="Search" sx={{ minWidth: 0, p: 1 }}>
                <SearchRoundedIcon />
              </Button>
            )}
            {desktop &&
              NAV.map((n, i) => (
                <Button
                  key={n.to}
                  component={RouterLink}
                  to={n.to}
                  startIcon={n.icon}
                  color={i === active ? 'primary' : 'inherit'}
                  variant={i === active ? 'contained' : 'text'}
                  sx={{ px: 2 }}
                >
                  {n.label}
                </Button>
              ))}
          </Toolbar>
        </Container>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ flex: 1, py: { xs: 2, md: 4 }, px: { xs: 2, sm: 3 }, pb: { xs: 12, md: 4 } }}>
        <Outlet />
        {!desktop && <SmallFooter />}
      </Container>

      {desktop && (
        <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', py: 3 }}>
          <Container maxWidth="lg" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              🔒 Private · 💸 Free · 🔓 Open · 🧠 Local AI by default — <Link component={RouterLink} to="/about" color="inherit">About</Link> ·{' '}
              <Link component={RouterLink} to="/privacy" color="inherit">Privacy</Link> ·{' '}
              <Link href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" color="inherit" title={`What’s new · build ${BUILD_ID}`}>
                v{APP_VERSION}
              </Link>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Data from TMDB (not endorsed or certified by TMDB) · Streaming availability by JustWatch · Reviews by{' '}
              <Link href="https://mangoidiots.com" target="_blank" rel="noopener noreferrer" color="inherit">
                Mangoidiots
              </Link>
            </Typography>
          </Container>
        </Box>
      )}

      {!desktop && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10, borderTop: 1, borderColor: 'divider', pb: 'env(safe-area-inset-bottom)' }} square>
          <BottomNavigation showLabels value={active} onChange={(_, i) => navigate(NAV[i].to)} sx={{ bgcolor: 'background.paper' }}>
            {NAV.map((n) => (
              <BottomNavigationAction key={n.to} label={n.label} icon={n.icon} sx={{ minWidth: 0, '&.Mui-selected': { color: 'secondary.main' } }} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
