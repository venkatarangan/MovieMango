import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { Box, Button, Card, CardContent, CircularProgress, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { writePortrait } from '../ai/tasks';
import { db } from '../db';
import { saveSettings, useSettings } from '../db/settings';
import { tasteSummaryForPortrait } from '../reco/tonight';
import { useEngine } from './EngineContext';

/** The AI's short description of the user's taste. Editable; it steers every recommendation. */
export default function TastePortrait() {
  const settings = useSettings();
  const { engine } = useEngine();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  if (!settings) return null;

  const generate = async () => {
    if (!engine) return;
    setBusy(true);
    setError('');
    try {
      const portrait = await writePortrait(engine, tasteSummaryForPortrait(await db.items.toArray()));
      await saveSettings({ portrait });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: '20px', bgcolor: 'action.hover' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <AutoAwesomeRoundedIcon color="primary" />
          <Typography variant="h6" sx={{ flex: 1 }}>
            Your taste portrait
          </Typography>
          {!editing && (
            <Button size="small" startIcon={<EditRoundedIcon />} color="inherit" onClick={() => { setDraft(settings.portrait); setEditing(true); }}>
              Edit
            </Button>
          )}
        </Box>
        {editing ? (
          <>
            <TextField fullWidth multiline minRows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="You love slow-burn thrillers, 90s Tamil comedies and anything by Mani Ratnam…" />
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button variant="contained" onClick={async () => { await saveSettings({ portrait: draft.trim() }); setEditing(false); }}>Save</Button>
              <Button color="inherit" onClick={() => setEditing(false)}>Cancel</Button>
            </Box>
          </>
        ) : (
          <Typography color={settings.portrait ? 'text.primary' : 'text.secondary'}>
            {settings.portrait || 'Not written yet. Save some favourites and rate what you’ve watched, then let the AI describe your taste, or write it yourself.'}
          </Typography>
        )}
        {!editing && (
          <Button sx={{ mt: 1.5 }} size="small" variant="outlined" color="inherit" onClick={generate} disabled={!engine || busy} startIcon={busy ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />}>
            {settings.portrait ? 'Rewrite with AI' : 'Write it with AI'}
          </Button>
        )}
        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            {error}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
