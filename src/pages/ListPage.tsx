import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/common';
import ListView from '../components/ListView';
import ShareButton from '../components/ShareButton';
import { deleteList, renameList, useCustomLists, useListItems } from '../db/items';
import { listToText, safeFilename } from '../lib/exportText';
import { listsToMarkdown } from '../lib/markdown';

export default function ListPage() {
  const { listId = '' } = useParams();
  const lists = useCustomLists();
  const items = useListItems(listId);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const list = lists?.find((l) => l.id === listId);
  if (!lists || !items) return null;
  if (!list) return <EmptyState title="This list doesn’t exist any more" />;
  const label = `${list.emoji ?? ''} ${list.name}`.trim();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h1" sx={{ flex: 1 }}>
          {label}
        </Typography>
        <ShareButton title={list.name} filename={safeFilename(list.name)} build={() => listToText(label, items)} markdown={() => listsToMarkdown([{ name: label, items }])} what="list" />
        <Button color="inherit" startIcon={<EditRoundedIcon />} onClick={() => { setName(list.name); setEmoji(list.emoji ?? ''); setEditing(true); }}>
          Rename
        </Button>
        <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {items.length} title{items.length === 1 ? '' : 's'}
      </Typography>
      {items.length ? (
        <ListView key={list.id} viewKey={list.id} items={items} />
      ) : (
        <EmptyState emoji="📭" title="Empty list">
          <Typography variant="body2">Add titles from any title page with the “Lists” button.</Typography>
        </EmptyState>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="xs">
        <DialogTitle>Rename list</DialogTitle>
        <DialogContent sx={{ display: 'flex', gap: 1, pt: '8px !important' }}>
          <TextField label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} sx={{ width: 80 }} />
          <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={async () => { await renameList(list.id, name, emoji || undefined); setEditing(false); }}>Save</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Delete “{list.name}”?</DialogTitle>
        <DialogContent>
          <Typography>The titles stay in your other lists; only this list is removed.</Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => { await deleteList(list.id); navigate('/library'); }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
