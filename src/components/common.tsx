import { Alert, Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { TmdbAuthError } from '../api/tmdb';

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5, mt: 3 }}>
      <Typography variant="h6" component="h2">
        {children}
      </Typography>
      {action}
    </Box>
  );
}

export function EmptyState({ emoji = '🥭', title, children }: { emoji?: string; title: string; children?: ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.secondary' }}>
      <Typography sx={{ fontSize: 48, lineHeight: 1 }}>{emoji}</Typography>
      <Typography variant="h6" color="text.primary" sx={{ mt: 1 }}>
        {title}
      </Typography>
      <Box sx={{ mt: 1, maxWidth: 420, mx: 'auto' }}>{children}</Box>
    </Box>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof TmdbAuthError)
    return (
      <Alert severity="warning" action={<Button component={RouterLink} to="/settings" color="inherit" size="small">Settings</Button>}>
        {error.message}
      </Alert>
    );
  return <Alert severity="error">{(error as Error).message || 'Something went wrong.'}</Alert>;
}
