import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Alert, Box, Button, CircularProgress, Container, LinearProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { discover, getWatchProviderCatalogue, snapshotFromList, type TmdbListItem } from '../api/tmdb';
import { ChipGroup } from '../components/ChipGroup';
import { ErrorNote } from '../components/common';
import EngineCard from '../components/EngineCard';
import { GoogleSignInButton } from '../components/Drive';
import { SmallFooter } from '../components/Layout';
import { TmdbKeyForm } from '../components/KeyForms';
import { db } from '../db';
import { driveConfigured } from '../sync/google';
import { connectDrive } from '../sync/sync';
import { Wordmark } from '../components/Logo';
import { Poster } from '../components/PosterCard';
import { setRating } from '../db/items';
import { saveSettings, useSettings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { detectLocale, LANGUAGES, languageName } from '../lib/languages';
import { resolveProviderIds, SERVICES } from '../lib/providers';
import { dailyJitter } from '../reco/score';
import type { MediaType } from '../lib/types';

const STEPS = ['Welcome', 'Google Drive', 'TMDB key', 'You', 'Loved', 'AI'];
const STEP = { welcome: 0, drive: 1, tmdb: 2, you: 3, loved: 4, ai: 5 };
const TARGET = 10;

type Tile = TmdbListItem & { type: MediaType };

/** ~36 popular titles across the chosen languages, streamable on the chosen services in India, mixing eras and movies/TV. */
async function loadTiles(languages: string[], services: string[]): Promise<Tile[]> {
  const catalogue = await getWatchProviderCatalogue('movie', 'IN').catch(() => ({ results: [] }));
  const ids = resolveProviderIds(catalogue.results);
  const providers = [...new Set(services.flatMap((s) => ids[s] ?? []))].join('|');
  const langs = languages.slice(0, 5);
  const per = Math.max(8, Math.round(48 / langs.length));
  const base = { watch_region: 'IN', with_watch_providers: providers, with_watch_monetization_types: 'flatrate|free|ads' };
  const groups = await Promise.all(
    langs.map(async (lang) => {
      const [recent, classic, tv] = await Promise.all([
        discover('movie', { ...base, with_original_language: lang, sort_by: 'popularity.desc', 'vote_count.gte': 100 }),
        discover('movie', { ...base, with_original_language: lang, sort_by: 'vote_count.desc', 'primary_release_date.lte': '2012-12-31' }),
        discover('tv', { ...base, with_original_language: lang, sort_by: 'popularity.desc', 'vote_count.gte': 30 }),
      ]).catch(() => [{ results: [] }, { results: [] }, { results: [] }] as { results: TmdbListItem[] }[]);
      const take = (list: TmdbListItem[], type: MediaType, n: number) => list.filter((t) => t.poster_path).slice(0, n).map((t) => ({ ...t, type }));
      return [...take(recent.results, 'movie', Math.ceil(per * 0.6)), ...take(classic.results, 'movie', Math.ceil(per * 0.3)), ...take(tv.results, 'tv', Math.ceil(per * 0.3))];
    }),
  );
  // Interleave languages so the grid isn't one block per language.
  const out: Tile[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < 48 && groups.some((g) => g[i]); i++)
    for (const g of groups) {
      const t = g[i];
      if (t && !seen.has(`${t.type}:${t.id}`)) {
        seen.add(`${t.type}:${t.id}`);
        out.push(t);
      }
    }
  return out.sort((a, b) => dailyJitter(a.id) - dailyJitter(b.id));
}


/**
 * First-run, interactive Google Drive sign-in. On a returning user's new device this also restores
 * their lists and keys, so the rest of setup can be skipped.
 */
function DriveStep({ onDone }: { onDone: (r: { full: boolean; hasKey: boolean }) => void }) {
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ email: string; restoredItems: number; restoredLists: number; hadRemote: boolean } | null>(null);
  const [skipping, setSkipping] = useState(false);
  if (!settings) return null;

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await connectDrive({ fresh: true }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    const count = await db.items.count();
    onDone({ full: !!settings.tmdbToken && count >= 5, hasKey: !!settings.tmdbToken });
  };

  return (
    <Box>
      <Typography variant="h4" component="h1">
        Keep your picks safe
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 640 }}>
        Sign in with Google to back up your lists, ratings and settings to <b>your own Google Drive</b>, and keep them in sync between your phone and computer. Already use MovieMango on another device? Sign in to bring everything over.
      </Typography>
      <Box component="ul" sx={{ pl: 2.5, mt: 2, color: 'text.secondary', '& li': { mb: 0.5 } }}>
        <Typography component="li" variant="body2">MovieMango keeps one file in a hidden app folder in your Drive. It can’t see, open or change any of your other files.</Typography>
        <Typography component="li" variant="body2">Your data goes straight from this browser to Google. There is no MovieMango server.</Typography>
        <Typography component="li" variant="body2">You can disconnect any time in Settings, or from your Google Account’s security page.</Typography>
      </Box>

      {!driveConfigured() ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Google Drive sync isn’t configured in this build, so we’ll skip this step. (Developers: set <code>VITE_GOOGLE_CLIENT_ID</code>.)
        </Alert>
      ) : result ? (
        <Alert severity="success" icon={<CheckCircleRoundedIcon />} sx={{ mt: 2 }}>
          Connected as <b>{result.email || 'your Google account'}</b>.{' '}
          {result.hadRemote
            ? result.restoredItems || result.restoredLists
              ? `Welcome back! We brought over ${result.restoredItems} title${result.restoredItems === 1 ? '' : 's'} and ${result.restoredLists} list${result.restoredLists === 1 ? '' : 's'} from your Drive.`
              : 'Your Drive backup is up to date.'
            : 'Your first backup is saved, and we’ll keep it in sync from now on.'}
        </Alert>
      ) : (
        <Box sx={{ mt: 3 }}>
          <GoogleSignInButton onClick={signIn} busy={busy} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            A Google window opens. Choose your account and allow access to MovieMango’s app folder.
          </Typography>
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" size="small" onClick={signIn}>Try again</Button>}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 4, flexWrap: 'wrap' }}>
        {result || !driveConfigured() ? (
          <Button variant="contained" size="large" onClick={next}>
            Continue
          </Button>
        ) : skipping ? (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={next}>Skip anyway</Button>}>
            Without Drive, your lists live only in this browser. Clearing browser data would erase them. You can connect later in Settings.
          </Alert>
        ) : (
          <Button color="inherit" onClick={() => setSkipping(true)}>
            Not now
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default function Welcome() {
  const settings = useSettings();
  const navigate = useNavigate();
  const detected = useMemo(() => detectLocale(), []);
  const [step, setStep] = useState(0);
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [services, setServices] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Map<string, Tile>>(new Map());
  const [saving, setSaving] = useState(false);

  const langs = languages ?? (settings?.onboarded ? settings.languages : detected.languages);
  const svcs = services ?? settings?.services ?? [];
  const tiles = useQuery({ queryKey: ['onboarding-tiles', langs, svcs], queryFn: () => loadTiles(langs, svcs), enabled: step === STEP.loved });

  if (!settings) return null;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const finish = async () => {
    setSaving(true);
    for (const t of picked.values()) await setRating(snapshotFromList(t, t.type), 'love');
    await saveSettings({ onboarded: true });
    trackEvent('onboarding_done', { loved: picked.size, languages: langs.length });
    navigate('/tonight', { replace: true });
  };

  const togglePick = (t: Tile) => {
    const key = `${t.type}:${t.id}`;
    const m = new Map(picked);
    if (m.has(key)) m.delete(key);
    else m.set(key, t);
    setPicked(m);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 2, md: 5 } }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Wordmark size={36} />
          <Typography variant="caption" color="text.secondary">
            Step {step + 1} of {STEPS.length}
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={((step + 1) / STEPS.length) * 100} sx={{ borderRadius: '6px', mb: 4 }} />

        {step === 0 && (
          <Box sx={{ textAlign: 'center', py: { xs: 2, md: 6 } }}>
            <Box component="img" src="/moviemango-logo.svg" alt="" sx={{ width: { xs: 140, md: 180 } }} />
            <Typography variant="h3" component="h1" sx={{ mt: 2, fontSize: { xs: '2.2rem', md: '3rem' } }}>
              Ripe picks for your mood and your moment.
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 560, mx: 'auto' }}>
              Tell MovieMango how much time you have and how you feel. Your AI movie buff picks what to watch from what’s streaming on your services, in your languages.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4, justifyContent: 'center' }}>
              {[
                ['🔒 Private', 'Your data stays in your browser'],
                ['💸 Free', 'No ads, no subscriptions'],
                ['🔓 Open', 'MIT-licensed source code'],
                ['🧠 Local AI', 'Runs on your device by default'],
              ].map(([t, d]) => (
                <Box key={t} sx={{ px: 2 }}>
                  <Typography sx={{ fontWeight: 700 }}>{t}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {d}
                  </Typography>
                </Box>
              ))}
            </Stack>
            <Button variant="contained" size="large" sx={{ mt: 5, px: 5 }} onClick={() => setStep(STEP.drive)}>
              Get started · about a minute
            </Button>
          </Box>
        )}

        {step === STEP.drive && <DriveStep onDone={(restored) => setStep(restored.full ? STEP.ai : restored.hasKey ? STEP.you : STEP.tmdb)} />}

        {step === 2 && (
          <Box>
            <Typography variant="h4" component="h1">
              Connect to TMDB
            </Typography>
            <Box sx={{ mt: 2 }}>
              <TmdbKeyForm onSaved={next} />
            </Box>
            {settings.tmdbToken && (
              <Button variant="contained" sx={{ mt: 3 }} onClick={next}>
                Continue
              </Button>
            )}
          </Box>
        )}

        {step === 3 && (
          <Box>
            <Typography variant="h4" component="h1">
              Where and what you watch
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {detected.regionSupported
                ? 'You’re in India, going by your device’s time zone. We’ve picked languages from your browser settings; change anything below.'
                : 'MovieMango covers India for now, so streaming availability is for India. More countries are coming.'}
            </Typography>
            <Stack spacing={3} sx={{ mt: 3 }}>
              <ChipGroup
                label="Languages you watch"
                multi
                options={LANGUAGES.map((l) => ({ key: l.code, label: l.native ? `${l.name} · ${l.native}` : l.name }))}
                value={langs}
                onChange={(v: string[]) => v.length && setLanguages(v)}
              />
              <ChipGroup label="Streaming services you have" multi options={SERVICES.map((s) => ({ key: s.key, label: s.name }))} value={svcs} onChange={(v: string[]) => v.length && setServices(v)} />
            </Stack>
            <Button
              variant="contained"
              size="large"
              sx={{ mt: 4 }}
              onClick={async () => {
                await saveSettings({ languages: langs, services: svcs, region: 'IN' });
                next();
              }}
            >
              Continue
            </Button>
          </Box>
        )}

        {step === 4 && (
          <Box>
            <Typography variant="h4" component="h1">
              Tap {TARGET} you love
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Popular {langs.map(languageName).join(', ')} titles on your services. Tap the ones you’ve enjoyed; they’re saved as ❤️ Loved and start your taste profile.
            </Typography>
            <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', py: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
              <LinearProgress variant="determinate" value={Math.min(100, (picked.size / TARGET) * 100)} sx={{ flex: 1, height: 8, borderRadius: '4px' }} />
              <Typography sx={{ fontWeight: 700, minWidth: 56 }}>
                {picked.size}/{TARGET}
              </Typography>
              <Button variant={picked.size >= TARGET ? 'contained' : 'text'} color={picked.size >= TARGET ? 'primary' : 'inherit'} onClick={next}>
                {picked.size >= TARGET ? 'Continue' : 'Skip'}
              </Button>
            </Box>
            <ErrorNote error={tiles.error} />
            {tiles.isLoading && (
              <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(6, 1fr)' }, gap: 1.5, mt: 1 }}>
              {tiles.data?.map((t) => {
                const on = picked.has(`${t.type}:${t.id}`);
                const snap = snapshotFromList(t, t.type);
                return (
                  <Box
                    key={`${t.type}:${t.id}`}
                    component="button"
                    onClick={() => togglePick(t)}
                    aria-pressed={on}
                    aria-label={snap.title}
                    sx={{ p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', position: 'relative', borderRadius: '12px', outline: on ? '3px solid' : 'none', outlineColor: 'primary.main', outlineOffset: 2, transition: 'transform .15s', transform: on ? 'scale(0.96)' : 'none', color: 'inherit', textAlign: 'left' }}
                  >
                    <Poster path={t.poster_path} title={snap.title} />
                    {on && <CheckCircleRoundedIcon sx={{ position: 'absolute', top: 6, right: 6, color: 'primary.main', bgcolor: 'background.paper', borderRadius: '50%' }} />}
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, lineHeight: 1.2, fontWeight: 600 }} noWrap>
                      {snap.title}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {step === 5 && (
          <Box>
            <Typography variant="h4" component="h1">
              Meet your AI movie buff
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              AI turns your mood, your time and your taste into picks, and explains each one. Use whichever engine works on this device; you can change it any time in Settings.
            </Typography>
            <EngineCard />
            <Button variant="contained" size="large" sx={{ mt: 4 }} onClick={finish} disabled={saving}>
              {saving ? 'Saving…' : 'Show me tonight’s picks'}
            </Button>
          </Box>
        )}

        {step > 0 && (
          <Button color="inherit" sx={{ mt: 2 }} onClick={() => setStep(step === STEP.you && settings.tmdbToken ? STEP.drive : step - 1)}>
            Back
          </Button>
        )}
        <SmallFooter />
      </Container>
    </Box>
  );
}
