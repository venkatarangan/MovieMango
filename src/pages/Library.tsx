import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import { Box, Button, Card, CardActionArea, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';
import { EmptyState } from '../components/common';
import CustomTitleDialog from '../components/CustomTitleDialog';
import { NewListDialog } from '../components/ListActions';
import ListView from '../components/ListView';
import ShareButton from '../components/ShareButton';
import TastePortrait from '../components/TastePortrait';
import { inView, listLabel, useAllItems, useCustomLists, useListItems } from '../db/items';
import { everythingToText, listToText, safeFilename } from '../lib/exportText';
import { listsToMarkdown } from '../lib/markdown';
import { MAX_CUSTOM_LISTS, type UserItem } from '../lib/types';

const VIEWS = ['watchlist', 'watched', 'loved', 'notforme'] as const;
const EMPTY: Record<string, { emoji?: string; text: string }> = {
  watchlist: { text: 'Tap ＋ on any poster, or Watchlist on a title page, to save it for later. Tonight’s picks give your watchlist a nudge when it fits your mood.' },
  watched: { text: 'Mark what you’ve seen, and tap 👍 or ❤️ so MovieMango learns your taste.' },
  loved: { emoji: '❤️', text: 'Titles you ❤️ show up here. They shape your picks the most.' },
  notforme: { emoji: '👎', text: 'Tap 👎 on anything you don’t want suggested. It lands here, and you can take it back any time.' },
};
const NOTE: Record<string, string> = {
  notforme: 'These never show up in your picks or on Home. Tap 👎 on a poster again to bring it back.',
  loved: 'Your ❤️ titles count the most when MovieMango picks for you.',
};

/** Markdown and text export sections. 👎 titles you watched stay under Watched with their rating. */
export function exportSections(all: UserItem[], lists: { id: string; name: string; emoji?: string }[], prefix = '') {
  return [
    { name: `${prefix}${listLabel.watchlist}`, items: all.filter(inView('watchlist')) },
    { name: `${prefix}${listLabel.watched}`, items: all.filter(inView('watched')) },
    { name: `${prefix}${listLabel.notforme}`, items: all.filter((i) => i.rating === 'dislike' && !i.lists.includes('watched')) },
    ...lists.map((l) => ({ name: `${l.emoji ?? ''} ${l.name}`.trim(), items: all.filter((i) => i.lists.includes(l.id)) })),
  ];
}

function BuiltinList({ list }: { list: string }) {
  const items = useListItems(list);
  if (!items) return null;
  if (!items.length)
    return (
      <EmptyState emoji={EMPTY[list].emoji} title={`Nothing in ${listLabel[list]} yet`}>
        <Typography variant="body2">{EMPTY[list].text}</Typography>
      </EmptyState>
    );
  return (
    <>
      {NOTE[list] && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {NOTE[list]}
        </Typography>
      )}
      <ListView
        key={list}
        viewKey={list}
        items={items}
        defaultSort={list === 'watched' || list === 'loved' ? 'watched' : 'added'}
        actions={(shown) => <ShareButton title={listLabel[list]} filename={safeFilename(listLabel[list])} build={() => listToText(`My ${listLabel[list]}`, shown)} markdown={() => listsToMarkdown([{ name: listLabel[list], items: shown }])} what="list" />}
      />
    </>
  );
}

function CustomLists() {
  const lists = useCustomLists();
  const items = useAllItems();
  const [open, setOpen] = useState(false);
  if (!lists || !items) return null;
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography color="text.secondary">
          {lists.length} of {MAX_CUSTOM_LISTS} lists
        </Typography>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)} disabled={lists.length >= MAX_CUSTOM_LISTS}>
          New list
        </Button>
      </Box>
      {!lists.length && (
        <EmptyState emoji="📚" title="No custom lists yet">
          <Typography variant="body2">Make lists like “Rainy day comfort”, “Mani Ratnam marathon” or “Watch with Amma”.</Typography>
        </EmptyState>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {lists.map((l) => {
          const inList = items.filter((i) => i.lists.includes(l.id));
          return (
            <Card key={l.id} variant="outlined" sx={{ borderRadius: '20px' }}>
              <CardActionArea component={RouterLink} to={`/list/${l.id}`} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-start' }}>
                <Typography sx={{ fontSize: 28 }}>{l.emoji || '🎬'}</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {l.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {inList.length} title{inList.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
                <ChevronRightRoundedIcon color="action" />
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
      <NewListDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const TABS = [...VIEWS, 'lists'];

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = Math.max(0, TABS.indexOf(params.get('tab') ?? ''));
  const setTab = (i: number) => setParams(i ? { tab: TABS[i] } : {}, { replace: true });
  const [adding, setAdding] = useState(false);
  const items = useAllItems();
  const lists = useCustomLists();
  const navigate = useNavigate();

  const sections = (prefix: string) => exportSections(items ?? [], lists ?? [], prefix);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h1">
          Your library
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button color="inherit" startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>
            Add your own
          </Button>
          <Button color="inherit" startIcon={<FileUploadRoundedIcon />} component={RouterLink} to="/import">
            Import
          </Button>
          <ShareButton title="My MovieMango lists" filename={safeFilename('all-lists')} build={() => everythingToText(sections('My '))} markdown={() => listsToMarkdown(sections(''))} label="Export all" what="all" />
        </Box>
      </Box>
      <CustomTitleDialog open={adding} onClose={() => setAdding(false)} onSaved={(s) => navigate(`/title/${s.type}/${s.tmdbId}`)} />
      <Box sx={{ mt: 2 }}>
        <TastePortrait />
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mt: 2, mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Watchlist" />
        <Tab label="Watched" />
        <Tab label="❤️ Loved" />
        <Tab label="👎 Not for me" />
        <Tab label="My lists" />
      </Tabs>
      {tab < VIEWS.length ? <BuiltinList list={VIEWS[tab]} /> : <CustomLists />}
    </Box>
  );
}
