import { Chip } from '@mui/material';
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
