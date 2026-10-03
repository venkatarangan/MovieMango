import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { Alert, Box, Button, Card, CardContent, Chip, Collapse, LinearProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { QWEN_MODELS } from '../ai/qwen';
import { ENGINE_LABELS, type EngineId } from '../ai/types';
import { saveSettings, useSettings, type AiEngineChoice } from '../db/settings';
import { useEngine } from './EngineContext';
import { GeminiKeyForm } from './KeyForms';

/** Shows which AI engine is in use, and lets the user enable or switch engines. */
export default function EngineCard({ showChooser = true }: { showChooser?: boolean }) {
  const settings = useSettings();
  const { status, choice, progress, busy, error, enableNano, enableQwen } = useEngine();
  const [showKey, setShowKey] = useState(false);
  if (!settings || !status || !choice) return <LinearProgress />;

  const qwenInfo = QWEN_MODELS.find((m) => settings.qwenModel.startsWith(m.id));
  const nanoState: Record<LanguageModelAvailability, string> = {
    available: 'Ready',
    downloadable: 'Needs a one-time download (managed by Chrome)',
    downloading: 'Downloading…',
    unavailable: 'Not available here (needs desktop Chrome 148+ with 22 GB free disk)',
  };
  const rows: { id: EngineId; title: string; detail: string; ready: boolean; action?: React.ReactNode }[] = [
    {
      id: 'nano',
      title: ENGINE_LABELS.nano,
      detail: `Private, free, works offline. ${nanoState[status.nano]}`,
      ready: status.nano === 'available',
      action:
        status.nano === 'downloadable' || status.nano === 'downloading' ? (
          <Button size="small" variant="outlined" onClick={enableNano} disabled={busy}>
            Enable
          </Button>
        ) : undefined,
    },
    {
      id: 'qwen',
      title: ENGINE_LABELS.qwen,
      detail: status.qwen.supported
        ? status.qwen.cached
          ? `Private, works offline. ${qwenInfo?.label ?? settings.qwenModel} is downloaded.`
          : `Private; runs on your GPU. One-time download of about ${((qwenInfo?.approxMB ?? 2000) / 1000).toFixed(1)} GB from Hugging Face.`
        : (status.qwen.reason ?? 'Not supported on this device.'),
      ready: status.qwen.supported && status.qwen.cached,
      action:
        status.qwen.supported && !status.qwen.cached ? (
          <Button size="small" variant="outlined" onClick={enableQwen} disabled={busy}>
            Download
          </Button>
        ) : undefined,
    },
    {
      id: 'gemini',
      title: ENGINE_LABELS.gemini,
      detail: status.gemini.hasKey ? `Using your Google AI Studio key (${settings.geminiModel}).` : 'Fast and smart. Needs your free Google AI Studio key.',
      ready: status.gemini.hasKey,
      action: (
        <Button size="small" variant="outlined" onClick={() => setShowKey(!showKey)}>
          {status.gemini.hasKey ? 'Change key' : 'Add key'}
        </Button>
      ),
    },
  ];

  const prefOptions: { key: AiEngineChoice; label: string }[] = [
    { key: 'auto', label: 'Auto' },
    { key: 'nano', label: 'Gemini Nano' },
    { key: 'qwen', label: 'Qwen' },
    { key: 'gemini', label: 'Gemini cloud' },
    { key: 'basic', label: 'Basic (no AI)' },
  ];

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AutoAwesomeRoundedIcon color="primary" />
          <Typography variant="h6" sx={{ flex: 1 }}>
            AI movie buff
          </Typography>
          <Chip
            size="small"
            color={choice.id ? 'primary' : 'default'}
            label={choice.id ? `Using ${ENGINE_LABELS[choice.id]}` : 'Not set up'}
          />
        </Box>
        <Stack spacing={1.25}>
          {rows.map((r) => (
            <Box key={r.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1.25, borderRadius: '12px', bgcolor: choice.id === r.id ? 'action.selected' : 'action.hover' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: r.ready ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {r.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                  {r.detail}
                </Typography>
              </Box>
              {r.action}
            </Box>
          ))}
        </Stack>
        {progress && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {progress.text}
            </Typography>
            <LinearProgress variant={progress.progress !== undefined ? 'determinate' : 'indeterminate'} value={(progress.progress ?? 0) * 100} sx={{ mt: 0.5, borderRadius: '6px' }} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
        {!choice.id && choice.message && settings.aiEngine !== 'basic' && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            {choice.message} Add a Google AI Studio key, download Qwen, or switch to Basic mode.
          </Alert>
        )}
        <Collapse in={showKey} unmountOnExit>
          <Box sx={{ mt: 2 }}>
            <GeminiKeyForm onSaved={() => setShowKey(false)} />
          </Box>
        </Collapse>
        {showChooser && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Engine to use
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {prefOptions.map((o) => (
                <Chip
                  key={o.key}
                  label={o.label}
                  onClick={() => saveSettings({ aiEngine: o.key })}
                  color={settings.aiEngine === o.key ? 'primary' : 'default'}
                  variant={settings.aiEngine === o.key ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Auto uses Gemini Nano, then Qwen, then Gemini cloud, whichever is ready. Basic mode ranks picks without AI.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
