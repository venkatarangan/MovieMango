import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { listGeminiModels } from '../ai/gemini';
import { deleteQwen, QWEN_MODELS } from '../ai/qwen';
import { ChipGroup } from '../components/ChipGroup';
import { DriveCard } from '../components/Drive';
import EngineCard from '../components/EngineCard';
import { useEngine } from '../components/EngineContext';
import { TmdbKeyForm } from '../components/KeyForms';
import { useToast } from '../components/Toast';
import { db } from '../db';
import { saveSettings, useSettings } from '../db/settings';
import { analyticsConfigured } from '../lib/analytics';
import { APP_VERSION, SOURCE_URL } from '../lib/appInfo';
import { createBackup, restoreBackup } from '../lib/backup';
import { LANGUAGES } from '../lib/languages';
import { SERVICES } from '../lib/providers';
import { downloadText } from '../lib/share';

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: '20px' }} id={id}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <Box>
      <FormControlLabel control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />} label={label} />
      {help && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 6, mt: -0.5 }}>
          {help}
        </Typography>
      )}
    </Box>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const { status, refresh } = useEngine();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const models = useQuery({ queryKey: ['gemini-models', settings?.geminiKey], queryFn: () => listGeminiModels(settings!.geminiKey), enabled: !!settings?.geminiKey, staleTime: 3600_000 });

  if (!settings) return null;

  const exportBackup = async () => {
    downloadText(JSON.stringify(await createBackup(), null, 2), `MovieMango-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };
  const importBackup = async (file: File) => {
    try {
      const r = await restoreBackup(JSON.parse(await file.text()));
      toast(`Restored ${r.items} titles and ${r.lists} lists`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
        Settings
      </Typography>
      <Stack spacing={2}>
        <Section title="Your services and languages">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Region: India. More countries are coming later.
          </Typography>
          <ChipGroup label="Streaming services you have" options={SERVICES.map((s) => ({ key: s.key, label: s.name }))} value={settings.services} multi onChange={(services: string[]) => saveSettings({ services })} />
          <Box sx={{ mt: 2 }}>
            <ChipGroup
              label="Languages you watch"
              options={LANGUAGES.map((l) => ({ key: l.code, label: l.native ? `${l.name} · ${l.native}` : l.name }))}
              value={settings.languages}
              multi
              onChange={(languages: string[]) => languages.length && saveSettings({ languages })}
            />
          </Box>
        </Section>

        <Section title="AI movie buff" id="ai">
          <EngineCard />
          {settings.geminiKey && (
            <TextField select fullWidth sx={{ mt: 2 }} label="Gemini model" value={settings.geminiModel} onChange={(e) => saveSettings({ geminiModel: e.target.value })} helperText="Flash and Flash-Lite models are on Google’s free tier.">
              {[...new Map([{ id: settings.geminiModel, label: settings.geminiModel }, { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' }, { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite (latest)' }, ...(models.data ?? [])].map((m) => [m.id, m])).values()].map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {status?.qwen.supported && (
            <Box sx={{ mt: 2 }}>
              <TextField select fullWidth label="Qwen model (on-device)" value={QWEN_MODELS.find((m) => settings.qwenModel.startsWith(m.id))?.id ?? 'Qwen3-1.7B'} onChange={(e) => saveSettings({ qwenModel: e.target.value })}>
                {QWEN_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.label} (~{(m.approxMB / 1000).toFixed(1)} GB)
                  </MenuItem>
                ))}
              </TextField>
              {status.qwen.cached && (
                <Button size="small" color="inherit" sx={{ mt: 1 }} onClick={async () => { await deleteQwen(status.qwen.modelId); await refresh(); toast('Qwen model removed from this browser', 'info'); }}>
                  Remove downloaded Qwen model
                </Button>
              )}
            </Box>
          )}
        </Section>

        <Section title="Personalisation">
          <Toggle checked={settings.useMangoidiots} onChange={(v) => saveSettings({ useMangoidiots: v })} label="Use Mangoidiots reviews" help="Show Mangoidiots ratings and reviews, and give titles rated Ripe or Delicious a small boost." />
          <Toggle checked={settings.useNews} onChange={(v) => saveSettings({ useNews: v })} label="Consider today’s news mood" help="Reads Wikipedia’s “In the news” headlines so the AI can lean lighter on heavy days." />
          <Toggle checked={settings.showAllRatings} onChange={(v) => saveSettings({ showAllRatings: v })} label="Show all certifications" help="When off, “Kids” shows U and “Family” shows U and UA titles only." />
          <Box sx={{ mt: 1 }}>
            <ChipGroup label="Theme" options={[{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} value={settings.theme} onChange={(theme) => saveSettings({ theme })} />
          </Box>
        </Section>

        <Section title="TMDB key">
          <TmdbKeyForm compact />
        </Section>

        <Section title="Google Drive backup and sync">
          <DriveCard />
        </Section>

        <Section title="Your data">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Everything lives in this browser (and in your Drive, if connected). You can also back up to a file. Backup files never include your API keys.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="outlined" color="inherit" startIcon={<DownloadRoundedIcon />} onClick={exportBackup}>
              Back up to file
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<UploadRoundedIcon />} onClick={() => fileRef.current?.click()}>
              Restore from file
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
            <Button variant="outlined" color="inherit" startIcon={<PlaylistAddRoundedIcon />} component={RouterLink} to="/import">
              Import a list
            </Button>
            <Button color="inherit" onClick={async () => { await db.cache.clear(); toast('Cache cleared', 'info'); }}>
              Clear cached data
            </Button>
            <Button color="error" onClick={() => setConfirmReset(true)}>
              Erase everything
            </Button>
          </Box>
        </Section>

        <Section title="Privacy">
          {analyticsConfigured() ? (
            <Toggle checked={settings.analytics} onChange={(v) => saveSettings({ analytics: v })} label="Share anonymous usage stats" help="Page views and feature use only, never titles, lists, moods, ratings or keys." />
          ) : (
            <Typography variant="body2" color="text.secondary">
              This build has no analytics.
            </Typography>
          )}
          <Box sx={{ mt: 1 }}>
            <Button component={RouterLink} to="/privacy" size="small">
              Privacy details
            </Button>
            <Button component={RouterLink} to="/about" size="small">
              About MovieMango
            </Button>
          </Box>
        </Section>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3 }}>
        MovieMango v{APP_VERSION} ·{' '}
        <Link href={`${SOURCE_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" color="inherit">
          What’s new
        </Link>
      </Typography>

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)}>
        <DialogTitle>Erase everything?</DialogTitle>
        <DialogContent>
          <Typography>This removes your lists, ratings, keys and settings from this browser. It can’t be undone. Back up first if you might want them back.</Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              await db.delete();
              location.hash = '#/welcome';
              location.reload();
            }}
          >
            Erase
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
