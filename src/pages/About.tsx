import { Box, Card, CardContent, Divider, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { LogoMark } from '../components/Logo';
import { APP_VERSION, SOURCE_URL } from '../lib/appInfo';

const ext = (href: string, text: string) => (
  <Link href={href} target="_blank" rel="noopener noreferrer">
    {text}
  </Link>
);

function Pillar({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: '20px', flex: 1 }}>
      <CardContent>
        <Typography sx={{ fontSize: 32 }}>{emoji}</Typography>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {children}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function About() {
  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box sx={{ display: 'inline-block' }}>
          <LogoMark size={120} />
        </Box>
        <Typography variant="h3" component="h1" sx={{ mt: 1 }}>
          MovieMango
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
          Ripe picks for your mood and your moment.
        </Typography>
        <Typography sx={{ mt: 1, fontWeight: 700, letterSpacing: 0.5 }}>🔒 Private · 💸 Free · 🔓 Open</Typography>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Pillar emoji="🔒" title="Private">
          Your lists, ratings and taste live only in your browser. There is no MovieMango server and no account with us. On-device AI keeps your prompts on your machine.
        </Pillar>
        <Pillar emoji="💸" title="Free">
          No ads, no subscriptions, no paywall. Ever. You bring your own free TMDB key, and optionally a free Google AI Studio key.
        </Pillar>
        <Pillar emoji="🔓" title="Open">
          The source code is on GitHub under the MIT license. Fork it, audit it, improve it.
        </Pillar>
      </Stack>

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        Why I built this
      </Typography>
      <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
        [Placeholder: the author’s note on why MovieMango exists will go here.]
      </Typography>

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        How it works
      </Typography>
      <Typography component="div">
        <ul>
          <li>Tell MovieMango how much time you have, how you feel and how you want to feel. It gathers real candidates from TMDB that are streaming on <b>your</b> services in India, in <b>your</b> languages.</li>
          <li>It scores them against your taste: your favourites, your mango ratings, your watchlist, plus the time of day.</li>
          <li>An AI movie buff then picks the best few and explains why. It can only choose from those real candidates, so it never invents titles.</li>
          <li>Tap Play to open the title on Netflix, Prime Video, JioHotstar and others. On a phone, the installed app usually opens.</li>
        </ul>
      </Typography>

      <Typography variant="h5" component="h2" sx={{ mt: 3, mb: 1 }}>
        AI engines
      </Typography>
      <Typography component="div">
        <ul>
          <li><b>Gemini Nano</b>: built into desktop Chrome. Runs on your computer; nothing leaves it.</li>
          <li><b>Qwen</b> (Alibaba Qwen team, Apache-2.0): downloaded once from Hugging Face and run on your GPU with WebLLM. Nothing leaves your device.</li>
          <li><b>Gemini</b> (Google): runs in the cloud with your own Google AI Studio key.</li>
          <li><b>Basic</b>: no AI, if you choose it. Picks are ranked by a transparent formula.</li>
        </ul>
      </Typography>

      <Typography variant="h5" component="h2" sx={{ mt: 3, mb: 1 }} id="credits">
        Acknowledgements
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: '20px' }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box component="img" src="/tmdb-logo.svg" alt="TMDB" sx={{ height: 18 }} />
            <Typography variant="body2">
              This product uses the TMDB API but is not endorsed or certified by TMDB. Titles, posters, credits and ratings come from {ext('https://www.themoviedb.org/', 'The Movie Database (TMDB)')}.
            </Typography>
          </Box>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2">
            Streaming availability (where to watch in India) is provided by {ext('https://www.justwatch.com/in', 'JustWatch')}, via TMDB.
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2">
            Reviews and mango ratings by {ext('https://mangoidiots.com', 'Mangoidiots')} (mangoidiots.com), © Venkatarangan Thirumalai.
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2">
            Summaries from {ext('https://www.wikipedia.org/', 'Wikipedia')} (CC BY-SA 4.0) and identifiers from {ext('https://www.wikidata.org/', 'Wikidata')} (CC0).
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2">
            AI: Gemini Nano and the Gemini API by Google; Qwen by the Alibaba Qwen team, run with {ext('https://github.com/mlc-ai/web-llm', 'WebLLM')} and hosted on {ext('https://huggingface.co/mlc-ai', 'Hugging Face')}.
          </Typography>
        </CardContent>
      </Card>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        MovieMango v{APP_VERSION} · MIT license · {ext(SOURCE_URL, 'Source code on GitHub')} · <Link component={RouterLink} to="/privacy">Privacy</Link>
        <br />
        Built with React, Material UI, Dexie, TanStack Query and WebLLM. A Mangoidiots project.
      </Typography>
    </Box>
  );
}
