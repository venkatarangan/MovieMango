import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ThumbDownOffAltRoundedIcon from '@mui/icons-material/ThumbDownOffAltRounded';
import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import NightsStayRoundedIcon from '@mui/icons-material/NightsStayRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Alert, Box, Button, Card, CardContent, Chip, Collapse, LinearProgress, Menu, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { ENGINE_LABELS } from '../ai/types';
import { ChipGroup } from '../components/ChipGroup';
import { EmptyState, ErrorNote } from '../components/common';
import EngineCard from '../components/EngineCard';
import { useEngine } from '../components/EngineContext';
import { MangoBadge } from '../components/Mango';
import { Poster } from '../components/PosterCard';
import { useToast } from '../components/Toast';
import { PlayButtons } from '../components/WhereToWatch';
import { db } from '../db';
import { markNotTonight, setRating, toggleList, useAllItems } from '../db/items';
import { saveSettings, useSettings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { formatRuntime } from '../lib/format';
import { genreName } from '../lib/genres';
import { languageName } from '../lib/languages';
import { AUDIENCES, DEFAULT_WANT, defaultMinutes, DISCOVERY, MINUTES, MOODS_NOW, partOfDay, WANTS, type MoodNow } from '../reco/moods';
import { planTonight, type Pick, type TonightInput, type TonightResult } from '../reco/tonight';

const STORE_KEY = 'mm.tonight';

function loadInput(): TonightInput {
  const fresh: TonightInput = { minutes: defaultMinutes(), discovery: 'new', audience: 'solo', type: 'either' };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null');
    return saved ? { ...fresh, ...saved, freeText: '' } : fresh;
  } catch {
    return fresh;
  }
}

function greeting() {
  const p = partOfDay();
  return p === 'late night' ? 'Burning the midnight oil?' : `Good ${p === 'night' ? 'evening' : p}!`;
}

function PickCard({ pick, myServices, onHide }: { pick: Pick; myServices: string[]; onHide: () => void }) {
  const toast = useToast();
  const s = pick.snap;
  const meta = [s.year, s.type === 'tv' ? 'Series' : 'Movie', s.runtime ? formatRuntime(s.runtime) + (s.type === 'tv' ? '/ep' : '') : '', languageName(s.originalLanguage), pick.certification]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card variant="outlined" sx={{ borderRadius: '20px', borderColor: pick.wildcard ? 'primary.main' : 'divider', borderWidth: pick.wildcard ? 2 : 1 }}>
      <CardContent sx={{ display: 'flex', gap: { xs: 1.5, sm: 2.5 }, p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Box component={RouterLink} to={`/title/${s.type}/${s.tmdbId}`} sx={{ width: { xs: 96, sm: 130 }, flexShrink: 0 }}>
          <Poster path={s.posterPath} title={s.title} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box>
            {pick.wildcard && <Chip size="small" color="primary" label="🎲 Wild card" sx={{ mb: 0.5 }} />}
            <Typography component={RouterLink} to={`/title/${s.type}/${s.tmdbId}`} variant="h6" sx={{ color: 'inherit', textDecoration: 'none', display: 'block', lineHeight: 1.25 }}>
              {s.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {meta}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {s.genreIds.slice(0, 3).map(genreName).join(' · ')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <AutoAwesomeRoundedIcon sx={{ fontSize: 18, color: 'primary.dark', mt: 0.25 }} />
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              {pick.why}
            </Typography>
          </Box>
          {pick.mango && (
            <Box>
              <MangoBadge rating={pick.mango} size="small" label={`Mangoidiots: ${pick.mango[0].toUpperCase() + pick.mango.slice(1)}`} />
            </Box>
          )}
          <PlayButtons availability={pick.availability} title={s.title} myServices={myServices} compact />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 'auto' }}>
            <Button size="small" startIcon={<BookmarkAddRoundedIcon />} color="inherit" onClick={async () => { await toggleList(s, 'watchlist', true); toast('Added to Watchlist', 'info'); }}>
              Later
            </Button>
            <Button size="small" startIcon={<NightsStayRoundedIcon />} color="inherit" onClick={async () => { await markNotTonight(s); trackEvent('feedback', { kind: 'not_tonight' }); onHide(); }}>
              Not tonight
            </Button>
            <Button size="small" startIcon={<ThumbDownOffAltRoundedIcon />} color="inherit" onClick={async () => { await setRating(s, 'dislike'); trackEvent('feedback', { kind: 'dislike' }); toast('Got it, we won’t suggest it again. It’s in Library → Not for me.', 'info'); onHide(); }}>
              Not for me
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function Tonight() {
  const settings = useSettings();
  const items = useAllItems();
  const { engine, choice, progress, setPreferred } = useEngine();
  const [input, setInput] = useState<TonightInput>(loadInput);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<TonightResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [engineAnchor, setEngineAnchor] = useState<HTMLElement | null>(null);

  const update = (patch: Partial<TonightInput>) => {
    const next = { ...input, ...patch };
    setInput(next);
    try {
      const { freeText: _, ...rest } = next;
      sessionStorage.setItem(STORE_KEY, JSON.stringify(rest));
    } catch {
      /* storage unavailable */
    }
  };

  const signal = useMemo(() => (items ?? []).filter((i) => i.lists.some((l) => l !== 'watchlist') || i.rating).length, [items]);

  const run = async () => {
    if (!settings) return;
    setRunning(true);
    setError(null);
    setHidden(new Set());
    try {
      const all = await db.items.toArray();
      const r = await planTonight(input, settings, all, engine, setStage);
      setResult(r);
      trackEvent('tonight', { engine: r.engineUsed, minutes: String(input.minutes), discovery: input.discovery, typed: !!input.freeText });
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
      setStage('');
    }
  };

  if (!settings) return null;
  const noAi = !choice?.id && settings.aiEngine !== 'basic';
  const picks = result?.picks.filter((p) => !hidden.has(p.snap.tmdbId)) ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" component="h1">
            {greeting()}
          </Typography>
          <Typography color="text.secondary">Pick your time and mood. We’ll find something on your services.</Typography>
        </Box>
        <Chip
          icon={<AutoAwesomeRoundedIcon />}
          label={choice?.id ? ENGINE_LABELS[choice.id] : 'AI not set up'}
          onClick={(e) => setEngineAnchor(e.currentTarget)}
          variant="outlined"
          sx={{ mt: 1 }}
        />
        <Menu anchorEl={engineAnchor} open={!!engineAnchor} onClose={() => setEngineAnchor(null)}>
          {(choice?.ready ?? []).map((id) => (
            <MenuItem key={id} selected={choice?.id === id} onClick={() => { void setPreferred(id); setEngineAnchor(null); }}>
              {ENGINE_LABELS[id]}
            </MenuItem>
          ))}
          <MenuItem selected={choice?.id === 'basic'} onClick={() => { void setPreferred('basic'); setEngineAnchor(null); }}>
            {ENGINE_LABELS.basic}
          </MenuItem>
          {settings.aiEngine !== 'auto' && (
            <MenuItem onClick={() => { void setPreferred('auto'); setEngineAnchor(null); }}>Auto (best available)</MenuItem>
          )}
          <MenuItem component={RouterLink} to="/settings" onClick={() => setEngineAnchor(null)}>
            AI settings…
          </MenuItem>
        </Menu>
      </Box>

      {noAi && (
        <Box sx={{ mt: 2 }}>
          <EngineCard showChooser={false} />
          <Button size="small" sx={{ mt: 1 }} color="inherit" onClick={() => saveSettings({ aiEngine: 'basic' })}>
            Use Basic mode (no AI) for now
          </Button>
        </Box>
      )}

      <Card variant="outlined" sx={{ mt: 2.5, borderRadius: '20px' }}>
        <CardContent>
          <Stack spacing={2}>
            <ChipGroup label="Time I have" options={MINUTES} value={input.minutes} onChange={(minutes) => update({ minutes })} />
            <ChipGroup
              label="I’m feeling"
              options={MOODS_NOW}
              value={input.moodNow}
              allowNone
              onChange={(moodNow?: MoodNow) => update({ moodNow, want: moodNow ? DEFAULT_WANT[moodNow] : input.want })}
            />
            <ChipGroup label="I want to" options={WANTS} value={input.want} allowNone onChange={(want) => update({ want })} />
            <Box>
              <Button size="small" color="inherit" startIcon={<TuneRoundedIcon />} onClick={() => setMoreOpen(!moreOpen)}>
                {moreOpen ? 'Fewer options' : 'More options'} · {DISCOVERY.find((d) => d.key === input.discovery)?.label} · {AUDIENCES.find((a) => a.key === input.audience)?.label}{input.anyLanguage ? ' · Any language' : ''}
              </Button>
              <Collapse in={moreOpen}>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <ChipGroup label="Discovery" options={DISCOVERY} value={input.discovery} onChange={(discovery) => update({ discovery })} />
                  <ChipGroup label="Watching with" options={AUDIENCES} value={input.audience} onChange={(audience) => update({ audience })} />
                  <ChipGroup
                    label="Languages"
                    options={[
                      { key: 'mine', label: 'My languages' },
                      { key: 'any', label: 'Any language (subtitles OK)' },
                    ]}
                    value={input.anyLanguage ? 'any' : 'mine'}
                    onChange={(v) => update({ anyLanguage: v === 'any' })}
                  />
                  <ChipGroup
                    label="Type"
                    options={[
                      { key: 'either', label: 'Either' },
                      { key: 'movie', label: 'Movie' },
                      { key: 'tv', label: 'Series' },
                    ]}
                    value={input.type}
                    onChange={(type) => update({ type })}
                  />
                  {(input.audience === 'kids' || input.audience === 'family') && (
                    <Typography variant="caption" color="text.secondary">
                      {settings.showAllRatings ? 'Showing all certifications (changed in Settings).' : `Limited to ${input.audience === 'kids' ? 'U' : 'U and UA'} certificates.`}{' '}
                      <Button size="small" onClick={() => saveSettings({ showAllRatings: !settings.showAllRatings })}>
                        {settings.showAllRatings ? 'Apply limits' : 'Show all ratings'}
                      </Button>
                    </Typography>
                  )}
                </Stack>
              </Collapse>
            </Box>
            <TextField
              fullWidth
              multiline
              maxRows={3}
              label={choice?.id && choice.id !== 'basic' ? 'Or just say what you’re after' : 'Say what you’re after (needs AI)'}
              placeholder="A light Tamil film, under 2 hours, no romance"
              value={input.freeText ?? ''}
              disabled={!choice?.id || choice.id === 'basic'}
              onChange={(e) => update({ freeText: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
            />
            <Button variant="contained" size="large" onClick={run} disabled={running || !settings.tmdbToken} startIcon={<AutoAwesomeRoundedIcon />} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, px: 4, py: 1.25 }}>
              {running ? 'Finding…' : result ? 'Find new picks' : 'Find my picks'}
            </Button>
            {running && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {progress?.text ?? stage}
                </Typography>
                <LinearProgress
                  variant={progress?.progress !== undefined ? 'determinate' : 'indeterminate'}
                  value={(progress?.progress ?? 0) * 100}
                  sx={{ mt: 0.5, borderRadius: '6px' }}
                />
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      {signal < 3 && !result && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Tip: <RouterLink to="/search">search</RouterLink> for films you love and tap ❤️ Loved it. Picks get better the more MovieMango knows you.
        </Alert>
      )}

      <Box sx={{ mt: 2 }}>
        <ErrorNote error={error} />
      </Box>

      {result && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            <Typography variant="h5" component="h2">
              Your picks
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {result.engineUsed === 'ai' ? `Chosen by ${choice?.id ? ENGINE_LABELS[choice.id] : 'AI'}` : 'Ranked without AI'} from {result.considered} titles
            </Typography>
          </Box>
          {result.aiError && settings.aiEngine !== 'basic' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              The AI step didn’t work this time ({result.aiError}), so these are ranked without AI.
            </Alert>
          )}
          {picks.length ? (
            <Stack spacing={2}>
              {picks.map((p) => (
                <PickCard key={`${p.snap.type}:${p.snap.tmdbId}`} pick={p} myServices={settings.services} onHide={() => setHidden(new Set([...hidden, p.snap.tmdbId]))} />
              ))}
            </Stack>
          ) : (
            <EmptyState emoji="🍿" title="Nothing fits all of that tonight">
              Try more time or another mood, or add services and languages in Settings.
            </EmptyState>
          )}
        </Box>
      )}
    </Box>
  );
}
