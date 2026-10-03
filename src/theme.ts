import { createTheme, type Theme } from '@mui/material/styles';

export const BRAND = {
  mango: '#FED201',
  mangoDeep: '#F2B705',
  leaf: '#8CC63F',
  navy: '#27323F',
  cream: '#FFF8E1',
  lensRed: '#EF5350',
  lensCyan: '#26C6DA',
};

export const MANGO_COLORS = { rotten: '#795548', raw: '#7CB342', ripe: '#F9A825', delicious: '#EF6C00' } as const;

export function createAppTheme(mode: 'light' | 'dark'): Theme {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: BRAND.mango, dark: BRAND.mangoDeep, contrastText: BRAND.navy },
      secondary: { main: dark ? '#9FB3C8' : BRAND.navy, contrastText: dark ? BRAND.navy : '#fff' },
      success: { main: BRAND.leaf },
      background: dark ? { default: '#12151A', paper: '#1B2027' } : { default: '#FFFBF0', paper: '#FFFFFF' },
      text: dark ? { primary: '#EEF1F5', secondary: '#A9B4C2' } : { primary: '#1D2530', secondary: '#5B6573' },
      divider: dark ? 'rgba(255,255,255,0.10)' : 'rgba(39,50,63,0.12)',
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Tamil", "Noto Sans Devanagari", sans-serif',
      h1: { fontFamily: 'Fredoka, "Inter Variable", sans-serif', fontWeight: 600 },
      h2: { fontFamily: 'Fredoka, "Inter Variable", sans-serif', fontWeight: 600 },
      h3: { fontFamily: 'Fredoka, "Inter Variable", sans-serif', fontWeight: 600 },
      h4: { fontFamily: 'Fredoka, "Inter Variable", sans-serif', fontWeight: 600, fontSize: '1.75rem' },
      h5: { fontFamily: 'Fredoka, "Inter Variable", sans-serif', fontWeight: 600 },
      h6: { fontWeight: 650, fontSize: '1.05rem' },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        // Mango text on a light background is too faint; text and outlined primary buttons use navy in light mode.
        styleOverrides: { root: { borderRadius: 999 } },
        variants: dark
          ? []
          : [
              { props: { variant: 'text', color: 'primary' }, style: { color: BRAND.navy } },
              { props: { variant: 'outlined', color: 'primary' }, style: { color: BRAND.navy, borderColor: BRAND.mangoDeep } },
            ],
      },
      MuiLink: { defaultProps: { color: dark ? 'primary' : 'secondary' } },
      MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } }, defaultProps: { elevation: 0 } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
      MuiTextField: { defaultProps: { variant: 'outlined' } },
    },
  });
}
