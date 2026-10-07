import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, ListItemIcon, ListItemText, Menu, MenuItem, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { createList, toggleList, useCustomLists, useItem } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { MAX_CUSTOM_LISTS, type TitleSnapshot } from '../lib/types';
import { MyRatingButtons, useTitleActions } from './TitleActions';
import { useToast } from './Toast';

export function NewListDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎬');
  const toast = useToast();
  const submit = async () => {
    try {
      const list = await createList(name, emoji || undefined);
      trackEvent('list_create');
      onCreated?.(list.id);
      setName('');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New list</DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 1, pt: '8px !important' }}>
        <TextField label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} sx={{ width: 80 }} />
        <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} slotProps={{ htmlInput: { maxLength: 60 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button onClick={submit} disabled={!name.trim()} variant="contained">Create</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ListActions({ snap, dense }: { snap: TitleSnapshot; dense?: boolean }) {
  const item = useItem(snap.type, snap.tmdbId);
  const custom = useCustomLists() ?? [];
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const toast = useToast();
  const { rate, toggle } = useTitleActions(snap);
  const has = (l: string) => !!item?.lists.includes(l);
  const flip = (list: string, label: string) => toggle(list, label, !has(list));

  const size = dense ? 'small' : 'medium';
  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button size={size} variant={has('watchlist') ? 'contained' : 'outlined'} color={has('watchlist') ? 'primary' : 'inherit'} startIcon={has('watchlist') ? <BookmarkAddedRoundedIcon /> : <BookmarkAddRoundedIcon />} onClick={() => flip('watchlist', 'Watchlist')}>
          Watchlist
        </Button>
        <Button size={size} variant={has('watched') ? 'contained' : 'outlined'} color={has('watched') ? 'success' : 'inherit'} startIcon={has('watched') ? <CheckCircleRoundedIcon /> : <CheckCircleOutlineRoundedIcon />} onClick={() => flip('watched', 'Watched')}>
          Watched
        </Button>
        <Button size={size} variant="outlined" color="inherit" startIcon={<PlaylistAddRoundedIcon />} onClick={(e) => setAnchor(e.currentTarget)}>
          Lists
        </Button>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { maxHeight: 420, minWidth: 240 } } }}>
          {custom.map((l) => (
            <MenuItem key={l.id} onClick={() => flip(l.id, l.name)} dense>
              <ListItemIcon>
                <Checkbox edge="start" checked={has(l.id)} size="small" tabIndex={-1} disableRipple />
              </ListItemIcon>
              <ListItemText primary={`${l.emoji ?? ''} ${l.name}`.trim()} />
            </MenuItem>
          ))}
          {custom.length > 0 && <Divider />}
          <MenuItem
            disabled={custom.length >= MAX_CUSTOM_LISTS}
            onClick={() => {
              setAnchor(null);
              setNewOpen(true);
            }}
          >
            <ListItemIcon>
              <PlaylistAddRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={custom.length >= MAX_CUSTOM_LISTS ? `Limit of ${MAX_CUSTOM_LISTS} lists reached` : 'New list…'} />
          </MenuItem>
        </Menu>
        <NewListDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => toggleList(snap, id, true).then(() => toast('Added to your new list', 'info'))} />
      </Box>
      <Box sx={{ mt: 1.5 }}>
        <MyRatingButtons value={item?.rating} onChange={rate} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          👍 and ❤️ mark it watched and teach MovieMango your taste. 👎 keeps it out of your suggestions.
        </Typography>
      </Box>
    </Box>
  );
}
