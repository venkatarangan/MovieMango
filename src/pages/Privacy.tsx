import { Box, Typography } from '@mui/material';
import { analyticsConfigured } from '../lib/analytics';

export default function Privacy() {
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', '& h2': { mt: 3 } }}>
      <Typography variant="h4" component="h1">
        Privacy
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        Short version: your data stays with you. MovieMango has no server and no accounts.
      </Typography>

      <Typography variant="h6" component="h2">What stays in your browser</Typography>
      <Typography>
        Your lists, ratings, taste portrait, settings and API keys are stored in your browser (IndexedDB), and in your own Google Drive if you connect it (you can keep keys out of Drive in Settings). Clearing the site’s data, or “Erase everything” in Settings, removes them. Backup files you download never include your keys.
      </Typography>

      <Typography variant="h6" component="h2">Who MovieMango talks to</Typography>
      <Typography component="div">
        <ul>
          <li><b>TMDB</b>: searches, title details, episode lists and the titles you import, using your own key. Titles you looked at recently are kept in your browser, so MovieMango asks TMDB less often.</li>
          <li><b>Wikipedia and Wikidata</b>: background summaries and, if you turn it on, today’s headlines.</li>
          <li><b>WordPress.com</b>: Mangoidiots reviews, if turned on.</li>
          <li><b>Google Gemini API</b>: only if you add your own key and use the cloud engine. Your prompt (mood, time, saved titles and candidates) goes to Google. On Google’s free tier, prompts may be used to improve Google’s products.</li>
          <li><b>Google Drive</b>: only if you sign in with Google. Your lists, ratings, synced settings and (unless you switch it off) API keys are saved to one file in a hidden app folder in <b>your own</b> Drive. MovieMango asks only for that folder (the drive.appdata permission) plus your email address to show which account is connected. It can’t see any of your other files. Disconnect in Settings; to delete the Drive copy, remove MovieMango under Drive → Settings → Manage apps.</li>
          <li><b>Hugging Face</b>: a one-time model download if you choose the Qwen engine.</li>
          <li><b>Streaming services</b>: only when you tap Play, which opens their site or app.</li>
        </ul>
      </Typography>

      <Typography variant="h6" component="h2">On-device AI</Typography>
      <Typography>Gemini Nano (Chrome) and Qwen (WebGPU) run entirely on your device. Nothing you type is sent anywhere.</Typography>

      <Typography variant="h6" component="h2">Analytics</Typography>
      <Typography>
        {analyticsConfigured()
          ? 'This site uses Google Analytics to count anonymous page views and which features are used. It never sends titles, lists, moods, ratings, review reads or keys. Advertising features are off. You can turn analytics off in Settings → Privacy.'
          : 'This build has no analytics.'}
      </Typography>

      <Typography variant="h6" component="h2">Contact</Typography>
      <Typography>Questions or concerns: open an issue on the project’s GitHub page.</Typography>
    </Box>
  );
}
