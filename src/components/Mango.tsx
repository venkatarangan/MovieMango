import { Box, Chip, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { MANGO_COLORS } from '../theme';
import type { MangoRating } from '../lib/types';

export const MANGO_RATINGS: { key: MangoRating; label: string; hint: string }[] = [
  { key: 'rotten', label: 'Rotten', hint: 'Skip it' },
  { key: 'raw', label: 'Raw', hint: 'Not quite there' },
  { key: 'ripe', label: 'Ripe', hint: 'Good, worth it' },
  { key: 'delicious', label: 'Delicious', hint: 'Loved it' },
];

export function MangoBadge({ rating, size = 'medium', label }: { rating: MangoRating; size?: 'small' | 'medium'; label?: string }) {
  const r = MANGO_RATINGS.find((m) => m.key === rating)!;
  return (
    <Chip
      size={size}
      label={`🥭 ${label ?? r.label}`}
      sx={{ bgcolor: MANGO_COLORS[rating], color: '#fff', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}
    />
  );
}

export function MangoRatingPicker({ value, onChange }: { value?: MangoRating; onChange: (r: MangoRating | undefined) => void }) {
  return (
    <ToggleButtonGroup exclusive size="small" value={value ?? null} onChange={(_, v) => onChange(v ?? undefined)} aria-label="Your mango rating" sx={{ flexWrap: 'wrap' }}>
      {MANGO_RATINGS.map((m) => (
        <Tooltip key={m.key} title={m.hint} describeChild>
          <ToggleButton
            value={m.key}
            sx={{
              px: 1.5,
              borderRadius: '999px !important',
              mr: 0.5,
              border: '1px solid !important',
              borderColor: 'divider',
              '&.Mui-selected, &.Mui-selected:hover': { bgcolor: MANGO_COLORS[m.key], color: '#fff' },
            }}
          >
            <Box component="span" sx={{ mr: 0.5 }}>
              🥭
            </Box>
            {m.label}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
