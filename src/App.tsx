import { CssBaseline, ThemeProvider, useMediaQuery, Box, CircularProgress } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { EngineProvider } from './components/EngineContext';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import { useSettings } from './db/settings';
import { setAnalytics, trackPage } from './lib/analytics';
import Home from './pages/Home';

const About = lazy(() => import('./pages/About'));
const Library = lazy(() => import('./pages/Library'));
const ListPage = lazy(() => import('./pages/ListPage'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Reviews = lazy(() => import('./pages/Reviews'));
const Search = lazy(() => import('./pages/Search'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Title = lazy(() => import('./pages/Title'));
const Tonight = lazy(() => import('./pages/Tonight'));
const Welcome = lazy(() => import('./pages/Welcome'));
import { createAppTheme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } },
});

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPage(location.pathname);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

function RequireSetup({ children }: { children: ReactNode }) {
  const settings = useSettings();
  if (!settings) return null;
  if (!settings.onboarded) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export default function App() {
  const settings = useSettings();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const mode = settings?.theme === 'system' || !settings ? (prefersDark ? 'dark' : 'light') : settings.theme;
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  useEffect(() => {
    if (settings) setAnalytics(settings.analytics);
  }, [settings?.analytics]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#12151A' : '#27323F');
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <EngineProvider>
            <HashRouter>
              <PageTracker />
              {!settings ? (
                <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Suspense fallback={<Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}><CircularProgress /></Box>}>
                <Routes>
                  <Route path="/welcome" element={<Welcome />} />
                  <Route element={<Layout />}>
                    <Route path="/" element={<RequireSetup><Home /></RequireSetup>} />
                    <Route path="/tonight" element={<RequireSetup><Tonight /></RequireSetup>} />
                    <Route path="/search" element={<RequireSetup><Search /></RequireSetup>} />
                    <Route path="/title/:type/:id" element={<RequireSetup><Title /></RequireSetup>} />
                    <Route path="/library" element={<RequireSetup><Library /></RequireSetup>} />
                    <Route path="/list/:listId" element={<RequireSetup><ListPage /></RequireSetup>} />
                    <Route path="/reviews" element={<RequireSetup><Reviews /></RequireSetup>} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
                </Suspense>
              )}
            </HashRouter>
          </EngineProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
