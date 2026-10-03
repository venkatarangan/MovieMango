import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import { Box, Button, Card, CardActionArea, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { EmptyState } from '../components/common';
import CustomTitleDialog from '../components/CustomTitleDialog';
import { NewListDialog } from '../components/ListActions';
import PosterCard, { PosterGrid } from '../components/PosterCard';
import ShareButton from '../components/ShareButton';
import TastePortrait from '../components/TastePortrait';
import { listLabel, useAllItems, useCustomLists, useListItems } from '../db/items';
import { everythingToText, listToText, safeFilename } from '../lib/exportText';
import { listsToMarkdown } from '../lib/markdown';
import { MAX_CUSTOM_LISTS } from '../lib/types';

const BUILTIN = ['favourite', 'watchlist', 'watched'] as const;
const EMPTY: Record<string, string> = {
  favourite: 'Tap ♥ Favourite on any title you love. Favourites shape your picks the most.',
  watchlist: 'Save titles for later. Tonight’s picks give your watchlist a nudge when it fits your mood.',
  watched: 'Mark what you’ve seen and give it a mango rating.',
};

function BuiltinList({ list }: { list: string }) {
  const items = useListItems(list);
  if (!items) return null;
  if (!items.length)
    return (
      <EmptyState title={`No ${listLabel[list].toLowerCase()} yet`}>
        <Typography variant="body2">{EMPTY[list]}</Typography>
      </EmptyState>
    );
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography color="text.secondary">
          {items.length} title{items.length === 1 ? '' : 's'}
        </Typography>
        <ShareButton title={listLabel[list]} filename={safeFilename(listLabel[list])} build={() => listToText(`My ${listLabel[list]}`, items)} markdown={() => listsToMarkdown([{ name: listLabel[list], items }])} what="list" />
      </Box>
      <PosterGrid>
        {items.map((i) => (
          <PosterCard key={i.key} snap={i} rating={i.rating} />
        ))}
      </PosterGrid>
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

export default function Library() {
  const [tab, setTab] = useState(0);
  const [adding, setAdding] = useState(false);
  const items = useAllItems();
  const lists = useCustomLists();
  const navigate = useNavigate();

  const sections = (prefix: string) => {
    const all = items ?? [];
    return [
      ...BUILTIN.map((b) => ({ name: `${prefix}${listLabel[b]}`, items: all.filter((i) => i.lists.includes(b)) })),
      ...(lists ?? []).map((l) => ({ name: `${l.emoji ?? ''} ${l.name}`.trim(), items: all.filter((i) => i.lists.includes(l.id)) })),
    ];
  };

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
        <Tab label="Favourites" />
        <Tab label="Watchlist" />
        <Tab label="Watched" />
        <Tab label="My lists" />
      </Tabs>
      {tab < 3 ? <BuiltinList list={BUILTIN[tab]} /> : <CustomLists />}
    </Box>
  );
}
