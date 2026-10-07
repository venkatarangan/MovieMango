import { Box, Card, CardContent, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { LogoMark } from '../components/Logo';
import { APP_VERSION, SOURCE_URL } from '../lib/appInfo';

const ext = (href: string, text: string) => (
  <Link href={href} target="_blank" rel="noopener noreferrer">
    {text}
  </Link>
);

const PILLARS = [
  { emoji: '🔒', title: 'Private', text: 'Your lists and ratings stay in your browser and, if you connect it, your own Google Drive. No MovieMango server, no account with us.' },
  { emoji: '💸', title: 'Free', text: 'No ads, no subscription. You use your own free TMDB key, and optionally a free Google AI key.' },
  { emoji: '🔓', title: 'Open', text: 'MIT-licensed source code on GitHub. Your data is a plain file you own, and every list exports as Markdown.' },
  { emoji: '🧠', title: 'Local AI by default', text: 'Picks are explained by an AI that runs on your device (Gemini Nano in Chrome, or Qwen). A cloud model is used only if you add your own Gemini key.' },
];

export default function About() {
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box sx={{ display: 'inline-block' }}>
          <LogoMark size={110} />
        </Box>
        <Typography variant="h3" component="h1" sx={{ mt: 1 }}>
          MovieMango
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
          Ripe picks for your mood and your moment.
        </Typography>
      </Box>

      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
        Why I built this
      </Typography>
      <Typography sx={{ mb: 1.5 }}>
        I love movies, and not just Indian and Hollywood ones; some of my favourites come from all over the world. For years, my watched list and watchlist were scattered across Google, IMDb, YouTube, JustWatch and Plex. I kept exporting and importing between them, and still couldn’t find the right thing to watch when I wanted it.
      </Typography>
      <Typography sx={{ mb: 1.5 }}>
        I didn’t want my movie life locked inside OTT apps or big tech, or to pay a subscription just to keep a list in the cloud. I’d meant to build my own app for years. With Claude’s help, I finally did: one place to track what’s good, discover what I’ll love next, and keep my data with me, ready for my own AI assistant to work with.
      </Typography>
      <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
        Venkatarangan Thirumalai,{' '}
        {ext('https://mangoidiots.com', 'Mangoidiots')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 4 }}>
        {PILLARS.map((p) => (
          <Card key={p.title} variant="outlined" sx={{ borderRadius: '20px', flex: 1 }}>
            <CardContent>
              <Typography variant="h6">
                {p.emoji} {p.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {p.text}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        How it works
      </Typography>
      <Box component="ol" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.75 } }}>
        <li>Tell it how much time you have and how you feel.</li>
        <li>It finds titles streaming on your services in India, in your languages, and an AI picks the best few for your taste, explaining why.</li>
        <li>Tap Play to open the title on Netflix, Prime Video, JioHotstar and more.</li>
      </Box>
      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        What else it does
      </Typography>
      <Box component="ul" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.75 } }}>
        <li><b>Home</b>: search, three “Feeling lucky?” picks, shows to continue, and watchlist titles that are now on your services.</li>
        <li><b>Lists</b>: Watchlist, Watched and up to 50 of your own, with 👎 👍 ❤️ ratings, TV episode progress, and sorting and filters.</li>
        <li><b>Discover</b>: browse any genre, see everything an actor or director made, and try world picks and a new language every week.</li>
        <li><b>Your own titles</b>: add films and shows that aren’t on TMDB, like old serials or home videos.</li>
        <li><b>Import and export</b>: bring lists in from Markdown, IMDb or Letterboxd, and take them out as Markdown any time.</li>
        <li><b>Sync</b>: back up to your own Google Drive and use it on your phone and computer.</li>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        The AI runs on your device where possible (Gemini Nano in Chrome, or Qwen), or uses your own Google AI key. You can also turn AI off.
      </Typography>

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }} id="credits">
        Credits
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box component="img" src="/tmdb-logo.svg" alt="TMDB" sx={{ height: 14 }} />
        <Typography variant="body2">This product uses the TMDB API but is not endorsed or certified by TMDB.</Typography>
      </Box>
      <Typography variant="body2" component="div" color="text.secondary">
        Streaming availability by {ext('https://www.justwatch.com/in', 'JustWatch')}. Reviews and mango ratings by {ext('https://mangoidiots.com', 'Mangoidiots')}. Summaries from {ext('https://www.wikipedia.org/', 'Wikipedia')} (CC BY-SA). AI by Google (Gemini) and the Qwen team (via {ext('https://github.com/mlc-ai/web-llm', 'WebLLM')}).
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        v{APP_VERSION} · MIT · {ext(SOURCE_URL, 'Source on GitHub')} · <Link component={RouterLink} to="/privacy">Privacy</Link>
      </Typography>
    </Box>
  );
}
