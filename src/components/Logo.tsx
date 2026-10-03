import { Box, Typography } from '@mui/material';

export function LogoMark({ size = 36 }: { size?: number }) {
  return <Box component="img" src="/moviemango-logo.svg" alt="" width={size} height={size} sx={{ display: 'block' }} />;
}

export function Wordmark({ size = 36, showByline = false }: { size?: number; showByline?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LogoMark size={size} />
      <Box>
        <Typography sx={{ fontFamily: 'Fredoka, sans-serif', fontWeight: 600, fontSize: size * 0.58, lineHeight: 1.1, letterSpacing: 0.2 }}>
          Movie<Box component="span" sx={{ color: 'primary.dark' }}>Mango</Box>
        </Typography>
        {showByline && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            Ripe picks for your mood and your moment.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
