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

/** Reassures users that a key is free, with links to the provider's own pages. */
function CostNote({ children, links }: { children: React.ReactNode; links: [string, string][] }) {
  return (
    <Alert icon={false} severity="success" sx={{ mb: 1.5, '& .MuiAlert-message': { width: '100%' } }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        💸 Free. No cost for normal use.
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {children}
      </Typography>
      <Typography variant="caption" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.75 }}>
        {links.map(([href, label]) => (
          <span key={href}>{ext(href, label)}</span>
        ))}
      </Typography>
    </Alert>
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          MovieMango gets titles, posters and “where to watch” from The Movie Database (TMDB), a free, community-built film database. You need your own key; it takes about two minutes and stays in this browser.
        </Typography>
      )}
      <CostNote
        links={[
          ['https://www.themoviedb.org/api-terms-of-use', 'TMDB API terms'],
          ['https://developer.themoviedb.org/docs/faq', 'TMDB API FAQ'],
        ]}
      >
        TMDB’s API is free for personal, non-commercial use, which is exactly what MovieMango is. No credit card or payment details are asked for.
      </CostNote>
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Optional. A Google AI Studio key lets MovieMango use Google’s Gemini AI on any device, including phones.
      </Typography>
      <CostNote
        links={[
          ['https://ai.google.dev/gemini-api/docs/pricing', 'Gemini API pricing (see “Free tier”)'],
          ['https://ai.google.dev/gemini-api/docs/rate-limits', 'Free-tier limits'],
        ]}
      >
        Google AI Studio has a free tier. You don’t add a credit card or billing account, so you can’t be charged. If you ever hit the daily free limit, Google just pauses requests until the next day. A normal evening of MovieMango uses only a few requests. No Google Cloud setup is needed.
      </CostNote>
      <Steps
        steps={[
          <>Open {ext('https://aistudio.google.com/apikey', 'Google AI Studio → API keys')} and sign in with your Google account.</>,
          <>Choose <b>Create API key</b>. If it asks about a project, let it create one for you.</>,
          <>Copy the key and paste it below. It stays in this browser and is only sent to Google.</>,
        ]}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        On the free tier, Google may use prompts to improve its products. Prompts include your mood and the titles you’ve saved, never your keys.
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
