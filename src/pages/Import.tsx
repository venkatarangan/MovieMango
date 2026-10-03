import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import { Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, LinearProgress, Link, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { titleOf, yearOf } from '../api/tmdb';
import { ErrorNote } from '../components/common';
import { Poster } from '../components/PosterCard';
import { useToast } from '../components/Toast';
import { listLabel, useCustomLists } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { applyImport, type ImportSummary } from '../lib/importApply';
import { mapPool, matchRow, type Confidence, type RowMatch } from '../lib/importMatch';
import { AI_PROMPT, MARKDOWN_SAMPLE, MAX_IMPORT_ROWS, parseMarkdown, type MdRow } from '../lib/markdown';
import { copyText } from '../lib/share';
import { BUILTIN_LISTS } from '../lib/types';

type Choice = number | 'custom' | 'skip';
interface Entry {
  row: MdRow;
  match: RowMatch;
  choice: Choice;
  picked?: boolean;
}

const CONFIDENCE: Record<Confidence, { label: string; color: 'success' | 'warning' | 'default' }> = {
  exact: { label: 'Exact match', color: 'success' },
  good: { label: 'Good match', color: 'success' },
  check: { label: 'Check this', color: 'warning' },
  none: { label: 'Not found', color: 'default' },
};

const listTitle = (l: string) => listLabel[l] ?? l;
const typeLabel = (t?: string) => (t === 'tv' ? 'Series' : 'Movie');

function Code({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <Box sx={{ position: 'relative' }}>
      <Box component="pre" sx={{ m: 0, p: 1.5, pr: 6, bgcolor: 'action.hover', borderRadius: '12px', fontSize: 13, lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {text}
      </Box>
      <Button
        size="small"
        color="inherit"
        aria-label={`Copy ${label}`}
        onClick={async () => toast((await copyText(text)) ? 'Copied' : 'Couldn’t copy', 'info')}
        sx={{ position: 'absolute', top: 4, right: 4, minWidth: 0 }}
      >
        <ContentCopyRoundedIcon fontSize="small" />
      </Button>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: '20px' }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function Help() {
  const tips: [string, string][] = [
    ['IMDb', 'On Your ratings or Your watchlist, use Export to get a CSV file. You can also pick that CSV here directly.'],
    ['Letterboxd', 'Settings → Data → Export your data. The zip has watched.csv, ratings.csv and watchlist.csv.'],
    ['JustWatch, Plex, Google, YouTube and others', 'Open your list, select all and copy it, or take screenshots, and give that to the AI.'],
  ];
  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Section title="The format">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          One title per line, under a heading for its list. Everything after the title is optional, and plain lists, numbered lists and tables work too.
        </Typography>
        <Code text={MARKDOWN_SAMPLE} label="sample" />
        <Box component="ul" sx={{ pl: 2.5, mb: 0, '& li': { mb: 0.5 }, '& code': { fontSize: 13 } }}>
          <Typography component="li" variant="body2">
            <code># Favourites</code>, <code># Watchlist</code> and <code># Watched</code> fill those lists. Any other heading becomes your own list, made if it’s new.
          </Typography>
          <Typography component="li" variant="body2">
            <code>(2019)</code> and <code>· movie</code> or <code>· tv</code> help find the right title. <code>· tmdb: 550776</code> or <code>· imdb: tt0111161</code> match exactly.
          </Typography>
          <Typography component="li" variant="body2">
            <code>· rating: rotten</code>, <code>raw</code>, <code>ripe</code> or <code>delicious</code> adds your mango rating.
          </Typography>
          <Typography component="li" variant="body2">
            <code>· custom</code> adds it as your own title, with an optional <code>· url: …</code> and a <code>&gt; description</code> line under it.
          </Typography>
        </Box>
      </Section>
      <Section title="Coming from another app?">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Export your list there, then ask any AI assistant (Gemini, ChatGPT, Claude, Copilot…) to convert it with this prompt. Paste its answer above.
        </Typography>
        <Box component="ul" sx={{ pl: 2.5, mt: 0, '& li': { mb: 0.5 } }}>
          {tips.map(([app, tip]) => (
            <Typography key={app} component="li" variant="body2">
              <b>{app}:</b> {tip}
            </Typography>
          ))}
        </Box>
        <Code text={`${AI_PROMPT}<paste your list here>`} label="AI prompt" />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          You’ll review every match before anything is saved. MovieMango only adds titles it finds on TMDB, or ones you choose to add as your own.
        </Typography>
      </Section>
    </Stack>
  );
}

function ReviewRow({ entry, onChoose }: { entry: Entry; onChoose: (c: Choice) => void }) {
  const { row, match, choice } = entry;
  const cand = typeof choice === 'number' ? match.candidates[choice] : undefined;
  const chip: { label: string; color: 'success' | 'warning' | 'secondary' | 'default' } =
    choice === 'custom'
      ? { label: 'Your own title', color: 'secondary' }
      : choice === 'skip'
        ? match.candidates.length ? { label: 'Skipped', color: 'default' } : CONFIDENCE.none
        : entry.picked
          ? { label: 'Your pick', color: 'default' }
          : CONFIDENCE[match.confidence];
  const title = cand ? titleOf(cand.item) : row.title;
  const meta = cand ? [yearOf(cand.item), typeLabel(cand.type)] : [row.year, typeLabel(row.type)];
  return (
    <Card variant="outlined" data-row={row.line} sx={{ borderRadius: '16px', opacity: choice === 'skip' ? 0.65 : 1 }}>
      <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ width: 56, flexShrink: 0 }}>
          <Poster path={cand?.item.poster_path} title={choice === 'skip' ? '–' : title} original={choice === 'custom' ? row.originalTitle : undefined} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 600, lineHeight: 1.25 }}>{choice === 'skip' ? <s>{row.title}</s> : title}</Typography>
            {chip && <Chip size="small" label={chip.label} color={chip.color} variant={chip.color === 'warning' ? 'filled' : 'outlined'} />}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {[...meta.filter(Boolean), `→ ${listTitle(row.list)}`, row.rating && `🥭 ${row.rating}`].filter(Boolean).join(' · ')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.raw}>
            Line {row.line}: {row.raw}
          </Typography>
          {match.error && (
            <Typography variant="caption" color="error" sx={{ display: 'block' }}>
              Couldn’t search: {match.error}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField select size="small" label="Match" value={String(choice)} onChange={(e) => onChoose(/^\d+$/.test(e.target.value) ? Number(e.target.value) : (e.target.value as Choice))} sx={{ minWidth: 220, maxWidth: '100%' }}>
              {match.candidates.map((c, i) => (
                <MenuItem key={`${c.type}:${c.item.id}`} value={String(i)}>
                  {titleOf(c.item)} {yearOf(c.item) ? `(${yearOf(c.item)})` : ''} · {typeLabel(c.type)}
                </MenuItem>
              ))}
              <MenuItem value="custom">Add as my own title</MenuItem>
              <MenuItem value="skip">Skip this one</MenuItem>
            </TextField>
            {!match.candidates.length && choice === 'skip' && (
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => onChoose('custom')}>
                Add as my own title
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

export default function Import() {
  const [text, setText] = useState('');
  const [defaultList, setDefaultList] = useState('watchlist');
  const [step, setStep] = useState<'input' | 'matching' | 'review' | 'done'>('input');
  const [progress, setProgress] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lists = useCustomLists() ?? [];
  const toast = useToast();

  const parsed = useMemo(() => parseMarkdown(text, MAX_IMPORT_ROWS, defaultList), [text, defaultList]);
  const listCount = new Set(parsed.rows.map((r) => r.list)).size;

  const readFile = async (file: File) => {
    if (file.size > 2_000_000) return toast('That file is too big. Try one under 2 MB.', 'error');
    setText(await file.text());
  };

  const findMatches = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setProgress(0);
    setStep('matching');
    trackEvent('import_start', { rows: parsed.rows.length });
    try {
      const matches = await mapPool(parsed.rows, 3, matchRow, setProgress, ctrl.signal);
      if (ctrl.signal.aborted) return setStep('input');
      setEntries(
        parsed.rows.map((row, i) => {
          const match = matches[i];
          return { row, match, choice: row.custom ? 'custom' : match.candidates.length ? 0 : 'skip' };
        }),
      );
      setOnlyCheck(false);
      setStep('review');
    } catch (e) {
      setError(e);
      setStep('input');
    }
  };

  const toImport = entries.filter((e) => e.choice !== 'skip').length;
  const counts = {
    good: entries.filter((e) => typeof e.choice === 'number' && e.match.confidence !== 'check').length,
    check: entries.filter((e) => typeof e.choice === 'number' && e.match.confidence === 'check' && !e.picked).length,
    none: entries.filter((e) => !e.match.candidates.length && !e.row.custom).length,
  };
  const needsLook = (e: Entry) => (e.match.confidence === 'check' && !e.picked) || (!e.match.candidates.length && !e.row.custom);
  const shown = onlyCheck ? entries.filter(needsLook) : entries;

  const save = async () => {
    setSaving(true);
    try {
      const s = await applyImport(entries.map((e) => ({ row: e.row, pick: typeof e.choice === 'number' ? e.match.candidates[e.choice] : e.choice })));
      setSummary(s);
      setStep('done');
      trackEvent('import_done', { titles: s.titles, custom: s.custom });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const choose = (line: number, choice: Choice) => setEntries((all) => all.map((e) => (e.row.line === line ? { ...e, choice, picked: true } : e)));

  return (
    <Box>
      <Typography variant="h4" component="h1">
        Import a list
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
        Bring in titles from Markdown, a plain list or a CSV: from another app, your notes or an AI assistant. Your list stays in this browser; MovieMango only sends each title to TMDB to look it up.
      </Typography>

      {step === 'input' && (
        <>
          <Card variant="outlined" sx={{ borderRadius: '20px', mt: 2 }}>
            <CardContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                maxRows={20}
                label="Paste your list"
                placeholder={MARKDOWN_SAMPLE}
                value={text}
                onChange={(e) => setText(e.target.value)}
                slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 14 } } }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="outlined" color="inherit" startIcon={<FolderOpenRoundedIcon />} onClick={() => fileRef.current?.click()}>
                  Choose a file
                </Button>
                <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.csv,text/plain,text/markdown,text/csv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
                <Button color="inherit" onClick={() => setText(MARKDOWN_SAMPLE)}>
                  Try the sample
                </Button>
                <TextField select size="small" label="Titles without a heading go to" value={defaultList} onChange={(e) => setDefaultList(e.target.value)} sx={{ minWidth: 240, ml: { sm: 'auto' } }}>
                  {BUILTIN_LISTS.map((l) => (
                    <MenuItem key={l} value={l}>
                      {listLabel[l]}
                    </MenuItem>
                  ))}
                  {lists.map((l) => (
                    <MenuItem key={l.id} value={l.name}>
                      {`${l.emoji ?? ''} ${l.name}`.trim()}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              {parsed.truncated && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  That’s {parsed.total} titles. Only the first {MAX_IMPORT_ROWS} are imported at a time; import the rest afterwards.
                </Alert>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="contained" size="large" disabled={!parsed.rows.length} onClick={findMatches}>
                  Find matches
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {text.trim() ? (parsed.rows.length ? `Found ${parsed.rows.length} title${parsed.rows.length === 1 ? '' : 's'} for ${listCount} list${listCount === 1 ? '' : 's'}.` : 'No titles found yet. Put one title on each line.') : 'Nothing is saved until you review the matches.'}
                </Typography>
              </Box>
              {error ? (
                <Box sx={{ mt: 2 }}>
                  <ErrorNote error={error} />
                </Box>
              ) : null}
            </CardContent>
          </Card>
          <Help />
        </>
      )}

      {step === 'matching' && (
        <Card variant="outlined" sx={{ borderRadius: '20px', mt: 2 }}>
          <CardContent>
            <Typography sx={{ mb: 1.5 }}>
              Looking up {progress} of {parsed.rows.length} on TMDB…
            </Typography>
            <LinearProgress variant="determinate" value={(100 * progress) / Math.max(1, parsed.rows.length)} sx={{ height: 8, borderRadius: '999px' }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              We go gently to stay within TMDB’s limits, so long lists take a minute or two.
            </Typography>
            <Button color="inherit" sx={{ mt: 1.5 }} onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'review' && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <Typography variant="h6" component="h2" sx={{ mr: 1 }}>
              Review matches
            </Typography>
            <Chip size="small" color="success" variant="outlined" label={`${counts.good} matched`} />
            {counts.check > 0 && <Chip size="small" color="warning" label={`${counts.check} to check`} />}
            {counts.none > 0 && <Chip size="small" label={`${counts.none} not found`} />}
            <FormControlLabel sx={{ ml: { sm: 'auto' } }} control={<Switch checked={onlyCheck} onChange={(e) => setOnlyCheck(e.target.checked)} />} label="Only ones that need a look" />
          </Box>
          <Stack spacing={1.5}>
            {shown.map((e) => (
              <ReviewRow key={e.row.line} entry={e} onChoose={(c) => choose(e.row.line, c)} />
            ))}
            {!shown.length && <Typography color="text.secondary">All good here. Nothing needs a look.</Typography>}
          </Stack>
          <Box sx={{ position: 'sticky', bottom: { xs: 56, md: 0 }, zIndex: 2, mt: 2, py: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', bgcolor: 'background.default' }}>
            <Button variant="contained" size="large" disabled={!toImport || saving} onClick={save}>
              Import {toImport} title{toImport === 1 ? '' : 's'}
            </Button>
            <Button color="inherit" onClick={() => setStep('input')}>
              Back
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ flexBasis: { xs: '100%', sm: 'auto' } }}>
              Adds to your lists and sets ratings. Nothing is removed.
            </Typography>
          </Box>
        </Box>
      )}

      {step === 'done' && summary && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="success">
            Imported {summary.titles} title{summary.titles === 1 ? '' : 's'}: {summary.matched} from TMDB, {summary.custom} of your own. {summary.skipped ? `Skipped ${summary.skipped}.` : ''}
            {summary.listsCreated.length > 0 && ` New list${summary.listsCreated.length === 1 ? '' : 's'}: ${summary.listsCreated.join(', ')}.`}
          </Alert>
          {summary.listsFull.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              You’ve reached 50 lists, so titles for {summary.listsFull.join(', ')} went to your Watchlist.
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Button variant="contained" component={RouterLink} to="/library">
              Open your library
            </Button>
            <Button
              color="inherit"
              onClick={() => {
                setText('');
                setEntries([]);
                setSummary(null);
                setStep('input');
              }}
            >
              Import more
            </Button>
          </Box>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
        Matches come from{' '}
        <Link component={RouterLink} to="/about" color="inherit">
          TMDB
        </Link>{' '}
        (not endorsed or certified by TMDB).
      </Typography>
    </Box>
  );
}
