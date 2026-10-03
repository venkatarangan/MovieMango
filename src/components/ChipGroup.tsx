import { Box, Chip, Typography } from '@mui/material';

interface Option<T> {
  key: T;
  label: string;
  emoji?: string;
}

/** A row of choice chips. Single-select by default; `multi` turns it into a multi-select. */
export function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  multi,
  allowNone,
}: {
  label?: string;
  options: Option<T>[];
  value: T | T[] | undefined;
  onChange: (v: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  multi?: boolean;
  allowNone?: boolean;
}) {
  const selected = (k: T) => (Array.isArray(value) ? value.includes(k) : value === k);
  const toggle = (k: T) => {
    if (multi) {
      const arr = (value as T[]) ?? [];
      onChange(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
    } else onChange(value === k && allowNone ? undefined : k);
  };
  return (
    <Box>
      {label && (
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 2, letterSpacing: 1 }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} role={multi ? 'group' : 'radiogroup'} aria-label={label}>
        {options.map((o) => (
          <Chip
            key={String(o.key)}
            label={o.emoji ? `${o.emoji} ${o.label}` : o.label}
            onClick={() => toggle(o.key)}
            color={selected(o.key) ? 'primary' : 'default'}
            variant={selected(o.key) ? 'filled' : 'outlined'}
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={selected(o.key)}
            sx={{ height: 36, borderRadius: '999px', fontSize: '0.92rem' }}
          />
        ))}
      </Box>
    </Box>
  );
}
