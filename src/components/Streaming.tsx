import { Box, Chip, Tooltip } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, type ReactNode, type RefObject } from 'react';
import { img } from '../api/tmdb';
import { db } from '../db';
import { useSettings } from '../db/settings';
import { checkStreaming } from '../db/streaming';
import { serviceByKey } from '../lib/providers';
import { badgeServices, isNewRow, needsCheck, type FoundService, type StreamingRow } from '../lib/streaming';
import { isCustom, isSaved, itemKey, type TitleSnapshot } from '../lib/types';
import { useSavedItem } from './TitleActions';

interface StreamingState {
  rows: Map<string, StreamingRow>;
  mine: string[];
}
const EMPTY: StreamingState = { rows: new Map(), mine: [] };
const StreamingContext = createContext<StreamingState>(EMPTY);

/** One live query for every saved streaming row, so a grid of posters doesn't open a query per card. */
export function StreamingProvider({ children }: { children: ReactNode }) {
  const rows = useLiveQuery(() => db.streaming.toArray().catch(() => []));
  const settings = useSettings();
  const value = useMemo(() => ({ rows: new Map((rows ?? []).map((r) => [r.key, r])), mine: settings?.services ?? [] }), [rows, settings?.services]);
  return <StreamingContext.Provider value={value}>{children}</StreamingContext.Provider>;
}

export const useStreaming = () => useContext(StreamingContext);

/** How long a poster has to stay on screen before we ask TMDB about it (fast scrolling asks nothing). */
const DWELL_MS = 500;

/**
 * Checks where a title streams once its poster has been on screen for half a second.
 * Skipped when saved info is good enough; a poster that leaves before its turn drops its check.
 */
export function useCheckWhenVisible(ref: RefObject<HTMLElement | null>, snap: Pick<TitleSnapshot, 'type' | 'tmdbId'>, enabled: boolean) {
  const { rows } = useStreaming();
  const saved = isSaved(useSavedItem(snap));
  const key = itemKey(snap.type, snap.tmdbId);
  const want = enabled && !isCustom(snap) && needsCheck(rows.get(key), saved, Date.now());
  useEffect(() => {
    const el = ref.current;
    if (!want || !el || typeof IntersectionObserver === 'undefined') return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      if (e?.isIntersecting)
        timer = setTimeout(() => {
          io.disconnect();
          void checkStreaming(snap, { signal: ctrl.signal });
        }, DWELL_MS);
    });
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
      ctrl.abort();
    };
  }, [want, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

const logoSx = { width: 22, height: 22, borderRadius: '6px', boxShadow: '0 1px 4px rgba(0,0,0,.4)', display: 'block', bgcolor: '#fff' } as const;

/**
 * Service logos over a poster's bottom-left corner: the user's services first (up to two, then "+n"),
 * other services only when none of theirs carry it, and "New" for an arrival this week.
 * `hint` is a service we already know carries it (Browse filtered by that service).
 */
export function StreamingBadge({ snap, hint }: { snap: Pick<TitleSnapshot, 'type' | 'tmdbId'>; hint?: FoundService }) {
  const { rows, mine } = useStreaming();
  const row = rows.get(itemKey(snap.type, snap.tmdbId));
  const { shown, more } = badgeServices(row, mine);
  const list = shown.length ? shown : hint ? [{ ...hint, since: 0 }] : [];
  if (!list.length) return null;
  const isNew = isNewRow(row, mine, Date.now());
  const names = (row?.services.length ? row.services : list).map((s) => serviceByKey(s.key)?.name ?? s.key).join(', ');
  return (
    <Tooltip title={`On ${names}`} describeChild>
      <Box data-testid="streaming-badge" aria-label={`Streaming on ${names}`} role="img" sx={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 0.5, alignItems: 'center', zIndex: 1 }}>
        {isNew && <Chip size="small" color="secondary" label="New" sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />}
        {list.map((s) =>
          s.logo ? (
            <Box key={s.key} component="img" src={img(s.logo, 'w92')} alt="" sx={logoSx} />
          ) : (
            <Box key={s.key} sx={{ ...logoSx, bgcolor: serviceByKey(s.key)?.color ?? '#333', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
              {(serviceByKey(s.key)?.name ?? s.key)[0]}
            </Box>
          ),
        )}
        {more > 0 && <Chip size="small" label={`+${more}`} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,18,24,.7)', color: '#fff' }} />}
      </Box>
    </Tooltip>
  );
}
