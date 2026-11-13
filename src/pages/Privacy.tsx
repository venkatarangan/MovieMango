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
      {analyticsConfigured() ? (
        <>
          <Typography>
            This site uses Google Analytics to count how MovieMango is used, so the author can see what is worth improving. It is on by default; turn it off any time in Settings → Privacy (“Share anonymous usage stats”). Once it’s off, nothing more is sent, and if it’s off when you open the app, the Google Analytics script isn’t even loaded. No personal information is collected.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            <b>What is counted.</b> Page views: only the kind of page, with ids removed (for example “/title/movie”, never which title), and no search text. Feature use: the name of a feature plus a few small details, such as search was used (never what you searched for), which streaming service’s Play button was tapped, which rating button was used (never for which title), a title was added to or removed from Watchlist, Watched or a custom list (never the list’s name or titles), what kind of share and how, an import started or finished (counts), a Tonight run (AI engine, minutes, discovery on or off, and whether you typed something, never what you typed), onboarding finished (counts), Google Drive connected or failed, keys saved (the fact only, never the key), notes saved (which field, never the content), an episode marked, and a custom title added, edited or deleted.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            <b>What is never sent.</b> Titles, list names or contents, search words, moods or anything you type, your notes or links, ratings tied to titles, API keys, your Google account email, or anything from your Drive.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            <b>Advertising is off.</b> Ads storage, ad personalisation, ad user data and Google signals are all switched off, and the data is not used for ads.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            <b>Cookies and your IP address.</b> Google Analytics sets a first-party cookie holding a random ID, which tells one visit from another. It isn’t linked to your name or email. As with any website, Google sees your IP address briefly while serving the request, and uses it to estimate your country and city; Google Analytics doesn’t store it.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            <b>What the author sees.</b> Only aggregate reports: counts of pages and features, countries and device types. Never anything that identifies a person. There is no MovieMango server. An ad blocker may block Google Analytics; MovieMango works exactly the same.
          </Typography>
        </>
      ) : (
        <Typography>This build has no analytics.</Typography>
      )}

      <Typography variant="h6" component="h2">Contact</Typography>
      <Typography>Questions or concerns: open an issue on the project’s GitHub page.</Typography>
    </Box>
  );
}
