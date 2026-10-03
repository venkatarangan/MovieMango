import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Link, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { validateGeminiKey } from '../ai/gemini';
import { validateTmdbToken } from '../api/tmdb';
import { saveSettings, useSettings } from '../db/settings';
import { trackEvent } from '../lib/analytics';

function SecretField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      fullWidth
      label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.trim())}
      type={show ? 'text' : 'password'}
      autoComplete="off"
      slotProps={{
        htmlInput: { spellCheck: false, autoCapitalize: 'off' },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setShow(!show)} edge="end" aria-label={show ? 'Hide key' : 'Show key'}>
                {show ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <Box component="ol" sx={{ pl: 2.5, my: 1, '& li': { mb: 0.75 } }}>
      {steps.map((s, i) => (
        <Typography component="li" variant="body2" key={i}>
          {s}
        </Typography>
      ))}
    </Box>
  );
}

const ext = (href: string, text: string) => (
  <Link href={href} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
    {text}
    <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
  </Link>
);

export function TmdbKeyForm({ onSaved, compact }: { onSaved?: () => void; compact?: boolean }) {
  const settings = useSettings();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'bad' | 'error'>('idle');
  const saved = !!settings?.tmdbToken;

  const save = async () => {
    setState('checking');
    try {
      if (!(await validateTmdbToken(value))) return setState('bad');
      await saveSettings({ tmdbToken: value });
      trackEvent('tmdb_key_saved');
      setValue('');
      setState('idle');
      onSaved?.();
    } catch {
      setState('error');
    }
  };

  return (
    <Box>
      {!compact && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          MovieMango gets titles, posters and “where to watch” from The Movie Database (TMDB). TMDB gives a free key for personal, non-commercial use. It takes about two minutes, and the key stays in this browser.
        </Typography>
      )}
      <Steps
        steps={[
          <>Create a free TMDB account at {ext('https://www.themoviedb.org/signup', 'themoviedb.org/signup')} and confirm your email.</>,
          <>Open {ext('https://www.themoviedb.org/settings/api', 'Settings → API')} and choose <b>Create</b> (or “Request an API key”), then <b>Developer</b>, and accept the terms.</>,
          <>
            Fill in the form: type of use <b>Personal</b>, application name <b>MovieMango (personal use)</b>, URL <b>https://watch.mangoidiots.com</b>, and a one-line summary such as “Personal movie and TV recommendations for my own use.”
          </>,
          <>Copy the <b>API Read Access Token</b> (the long one; the shorter API Key also works) and paste it below.</>,
        ]}
      />
      {saved && state === 'idle' && (
        <Alert icon={<CheckCircleRoundedIcon />} severity="success" sx={{ mb: 1.5 }}>
          Your TMDB key is saved. Paste a new one to replace it.
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
        <SecretField label="TMDB API Read Access Token or API Key" value={value} onChange={(v) => { setValue(v); setState('idle'); }} />
        <Button variant="contained" onClick={save} disabled={value.length < 20 || state === 'checking'} sx={{ height: 56, px: 3, flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}>
          {state === 'checking' ? <CircularProgress size={22} /> : 'Verify & save'}
        </Button>
      </Box>
      {state === 'bad' && <Alert severity="error" sx={{ mt: 1.5 }}>TMDB didn’t accept that key. Copy it again from TMDB’s API settings page.</Alert>}
      {state === 'error' && <Alert severity="warning" sx={{ mt: 1.5 }}>Couldn’t reach TMDB. Check your connection and try again.</Alert>}
    </Box>
  );
}

export function GeminiKeyForm({ onSaved }: { onSaved?: () => void }) {
  const settings = useSettings();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'bad' | 'error'>('idle');

  const save = async () => {
    setState('checking');
    try {
      if (!(await validateGeminiKey(value))) return setState('bad');
      await saveSettings({ geminiKey: value });
      trackEvent('gemini_key_saved');
      setValue('');
      setState('idle');
      onSaved?.();
    } catch {
      setState('error');
    }
  };

  return (
    <Box>
      <Steps
        steps={[
          <>Open {ext('https://aistudio.google.com/apikey', 'Google AI Studio → API keys')} and sign in with your Google account.</>,
          <>Choose <b>Create API key</b>. The free tier needs no credit card.</>,
          <>Copy the key and paste it below. It stays in this browser and is only sent to Google.</>,
        ]}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        On Google’s free tier, prompts may be used to improve Google’s products. Your prompts include your mood and the titles you’ve saved, but never your keys.
      </Typography>
      {settings?.geminiKey && state === 'idle' && (
        <Alert severity="success" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" onClick={() => saveSettings({ geminiKey: '' })}>Remove</Button>}>
          Your Google AI Studio key is saved.
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
        <SecretField label="Google AI Studio API key" value={value} onChange={(v) => { setValue(v); setState('idle'); }} placeholder="AIza…" />
        <Button variant="contained" onClick={save} disabled={value.length < 20 || state === 'checking'} sx={{ height: 56, px: 3, flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}>
          {state === 'checking' ? <CircularProgress size={22} /> : 'Verify & save'}
        </Button>
      </Box>
      {state === 'bad' && <Alert severity="error" sx={{ mt: 1.5 }}>Google didn’t accept that key.</Alert>}
      {state === 'error' && <Alert severity="warning" sx={{ mt: 1.5 }}>Couldn’t reach Google. Check your connection and try again.</Alert>}
    </Box>
  );
}
