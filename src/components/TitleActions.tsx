import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import ThumbDownAltRoundedIcon from '@mui/icons-material/ThumbDownAltRounded';
import ThumbDownOffAltRoundedIcon from '@mui/icons-material/ThumbDownOffAltRounded';
import ThumbUpAltRoundedIcon from '@mui/icons-material/ThumbUpAltRounded';
import { Box, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db';
import { restoreItem, setRating, toggleList } from '../db/items';
import { trackEvent } from '../lib/analytics';
import { MY_RATINGS } from '../lib/ratings';
import { itemKey, type MyRating, type TitleSnapshot, type UserItem } from '../lib/types';
import { useToast } from './Toast';

/** One live query for every saved item, so a page of posters doesn't open one query per card. */
const ItemsContext = createContext<Map<string, UserItem> | undefined>(undefined);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const items = useLiveQuery(() => db.items.toArray());
  const map = useMemo(() => new Map((items ?? []).map((i) => [i.key, i])), [items]);
  return <ItemsContext.Provider value={map}>{children}</ItemsContext.Provider>;
}

export const useSavedItem = (snap: Pick<TitleSnapshot, 'type' | 'tmdbId'>) => useContext(ItemsContext)?.get(itemKey(snap.type, snap.tmdbId));

const RATED: Record<MyRating, string> = {
  dislike: '👎 Not for me. We won’t suggest it again.',
  like: '👍 Liked, and marked as watched.',
  love: '❤️ Loved, and marked as watched.',
};

/** Saving, rating and their toasts, each with an Undo. */
export function useTitleActions(snap: TitleSnapshot) {
  const toast = useToast();
  const before = () => db.items.get(itemKey(snap.type, snap.tmdbId));
  const undo = (prev: UserItem | undefined) => ({ label: 'Undo', onClick: () => void restoreItem(snap, prev) });
  return {
    rate: async (rating: MyRating | undefined) => {
      const prev = await before();
      await setRating(snap, rating);
      trackEvent('rate', { rating: rating ?? 'none' });
      toast(rating ? RATED[rating] : 'Rating removed', 'info', undo(prev));
    },
    toggle: async (list: string, label: string, on?: boolean) => {
      const prev = await before();
      const want = on ?? !prev?.lists.includes(list);
      await toggleList(snap, list, want);
      trackEvent('list_toggle', { list: list.startsWith('l_') ? 'custom' : list, on: want });
      toast(want ? `Added to ${label}` : `Removed from ${label}`, 'info', undo(prev));
    },
  };
}

const RATING_STYLE: Record<MyRating, { icon: ReactNode; color: string }> = {
  dislike: { icon: <ThumbDownAltRoundedIcon fontSize="small" />, color: '#6B7280' },
  like: { icon: <ThumbUpAltRoundedIcon fontSize="small" />, color: '#2E7D32' },
  love: { icon: <FavoriteRoundedIcon fontSize="small" />, color: '#D32F2F' },
};

/** 👎 Not for me · 👍 Liked it · ❤️ Loved it. Tapping the chosen one clears it. */
export function MyRatingButtons({ value, onChange }: { value?: MyRating; onChange: (r: MyRating | undefined) => void }) {
  return (
    <ToggleButtonGroup exclusive size="small" value={value ?? null} onChange={(_, v) => onChange(v ?? undefined)} aria-label="Your rating" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
      {MY_RATINGS.map((m) => (
        <ToggleButton
          key={m.key}
          value={m.key}
          sx={{
            px: 1.5,
            gap: 0.75,
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: '999px !important',
            border: '1px solid !important',
            borderColor: 'divider',
            '&.Mui-selected, &.Mui-selected:hover': { bgcolor: RATING_STYLE[m.key].color, color: '#fff' },
          }}
        >
          {RATING_STYLE[m.key].icon}
          {m.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/** The icon that sums up where a saved title stands: ❤️ / 👍 / watched / watchlist / ＋. */
function stateIcon(item?: UserItem) {
  if (item?.rating === 'love') return <FavoriteRoundedIcon sx={{ fontSize: 18, color: '#ff6b6b' }} />;
  if (item?.rating === 'like') return <ThumbUpAltRoundedIcon sx={{ fontSize: 18, color: '#7ee08a' }} />;
  if (item?.lists.includes('watched')) return <CheckCircleRoundedIcon sx={{ fontSize: 18, color: '#7ee08a' }} />;
  if (item?.lists.includes('watchlist')) return <BookmarkAddedRoundedIcon sx={{ fontSize: 18, color: '#ffd166' }} />;
  return <AddRoundedIcon sx={{ fontSize: 20 }} />;
}

const roundButton = {
  width: 32,
  height: 32,
  bgcolor: 'rgba(15,18,24,.62)',
  color: '#fff',
  backdropFilter: 'blur(4px)',
  boxShadow: '0 1px 4px rgba(0,0,0,.35)',
  '&:hover': { bgcolor: 'rgba(15,18,24,.85)' },
};

/** ＋ (watchlist, watched, liked, loved) and 👎 over a poster's top-right corner, or `inline` in a row of other controls. */
export function QuickActions({ snap, inline }: { snap: TitleSnapshot; inline?: boolean }) {
  const item = useSavedItem(snap);
  const { rate, toggle } = useTitleActions(snap);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const disliked = item?.rating === 'dislike';
  const has = (l: string) => !!item?.lists.includes(l);
  const close = () => setAnchor(null);
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Box sx={inline ? { display: 'flex', gap: 0.5 } : { position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.5, zIndex: 2 }}>
      <Tooltip describeChild title={item?.lists.length || item?.rating === 'like' || item?.rating === 'love' ? 'Saved: change' : 'Add to Watchlist or Watched'}>
        <IconButton
          size="small"
          aria-label={`Add ${snap.title} to a list`}
          aria-haspopup="menu"
          onClick={(e) => {
            stop(e);
            setAnchor(e.currentTarget);
          }}
          sx={roundButton}
        >
          {stateIcon(item)}
        </IconButton>
      </Tooltip>
      <Tooltip describeChild title={disliked ? 'Undo “Not for me”' : 'Not for me: hide it from suggestions'}>
        <IconButton
          size="small"
          aria-label={disliked ? `Undo not for me: ${snap.title}` : `Not for me: ${snap.title}`}
          aria-pressed={disliked}
          onClick={(e) => {
            stop(e);
            void rate(disliked ? undefined : 'dislike');
          }}
          sx={{ ...roundButton, ...(disliked && { bgcolor: '#6B7280', '&:hover': { bgcolor: '#4B5563' } }) }}
        >
          {disliked ? <ThumbDownAltRoundedIcon sx={{ fontSize: 17 }} /> : <ThumbDownOffAltRoundedIcon sx={{ fontSize: 17 }} />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} onClick={(e) => e.stopPropagation()} slotProps={{ paper: { sx: { minWidth: 210 } } }}>
        <MenuItem
          selected={has('watchlist')}
          onClick={() => {
            close();
            void toggle('watchlist', 'Watchlist');
          }}
        >
          <ListItemIcon>{has('watchlist') ? <BookmarkAddedRoundedIcon fontSize="small" /> : <BookmarkAddRoundedIcon fontSize="small" />}</ListItemIcon>
          <ListItemText primary={has('watchlist') ? 'On your watchlist' : 'Watchlist'} secondary={has('watchlist') ? 'Tap to remove' : 'Save for later'} />
        </MenuItem>
        <MenuItem
          selected={has('watched') && !item?.rating}
          onClick={() => {
            close();
            void toggle('watched', 'Watched');
          }}
        >
          <ListItemIcon>{has('watched') ? <CheckCircleRoundedIcon fontSize="small" /> : <CheckCircleOutlineRoundedIcon fontSize="small" />}</ListItemIcon>
          <ListItemText primary="Watched" secondary={has('watched') ? 'Tap to remove' : 'No rating'} />
        </MenuItem>
        {(['like', 'love'] as const).map((r) => (
          <MenuItem
            key={r}
            selected={item?.rating === r}
            onClick={() => {
              close();
              void rate(item?.rating === r ? undefined : r);
            }}
          >
            <ListItemIcon sx={{ color: RATING_STYLE[r].color }}>{RATING_STYLE[r].icon}</ListItemIcon>
            <ListItemText primary={MY_RATINGS.find((m) => m.key === r)!.label} secondary={item?.rating === r ? 'Tap to clear' : 'Marks it watched'} />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
