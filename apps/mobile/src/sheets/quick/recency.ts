/**
 * EACH BABY'S LAST ENTRIES, READ BEFORE ANY SHEET IS ASKED FOR — what the Logging-for row starts on
 * when the top bar is on Both (`loggingForStart.ts`; the owner, 2026-09-25).
 *
 * WHY IT IS READ HERE, AHEAD OF TIME. The row's first value has to be decided before the sheet's
 * first paint: a row that opened on Emma and moved to Liam a frame later would be a jump a parent
 * can catch mid-tap, and a tap on the wrong chip is a wrong record. Nothing already on screen has
 * the answer — Today on Both reads the household's newest row of each type (`lastActivities` with
 * no child), not each baby's — and the only source is the local database, which answers
 * asynchronously. So the read is made before the sheet exists, not after: the capture sheet's host
 * (`app/QuickEntrySheet.tsx`) is mounted for the life of the shell, holds this read, and re-reads
 * it on every write and every pulled row (`keys.household` — both bump it) and on every timer
 * change (`useAllRunningTimers`). A sheet reads the context once, synchronously, as it mounts, and
 * its row starts where the rule says. Nothing moves it afterwards.
 *
 * The re-read is a handful of index probes (`lastStartByChild`), and the shell does not present
 * the next sheet until the closing one has finished leaving (`ShellProvider`'s hand-over, a few
 * hundred milliseconds), so a feed saved for Emma is in this read well before the sheet can be
 * opened again for Liam. The one window it cannot cover is the first moments after a cold start —
 * a sheet opened by a reminder or a link before the first read has come back. There the rule has
 * nothing to read and starts on the first child: one baby, named on the row, never Both, and never
 * a jump.
 *
 * Read only for a household with two babies or more: with one there is no row to start.
 */
import { createContext, useContext, useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { keys } from '../../data/store';
import { useLocalQuery } from '../../data/useLocalQuery';
import { lastStartByChild } from '../../db/queries/today';
import { useChild } from '../../household/ChildContext';
import { BABY_TYPES, NO_RECENCY, type Recency } from './loggingForStart';
import { useAllRunningTimers } from './useRunningTimers';

type LastAt = Recency['lastAt'];
const NONE: LastAt = {};

/** The read a capture sheet's Logging-for row starts from; empty outside a sheet host. */
export const RecencyContext = createContext<Recency>(NO_RECENCY);

/** A sheet's synchronous look at what the host already read. */
export const useRecency = (): Recency => useContext(RecencyContext);

/** The host's read: every baby's newest start per type, and the household's running timers. */
export function useRecencyRead(): Recency {
  const { account, session } = useAuth();
  const { children } = useChild();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const viewerId = session?.user.id ?? null;
  const childIds = useMemo(() => children.map(c => c.id), [children]);
  const wanted = householdId !== null && viewerId !== null && childIds.length > 1;
  // the viewer and the babies are in the key as well as the household: `useLocalQuery` keeps the
  // loader of the last key change, a private row is read for the person who logged it, and a baby
  // added on another phone is read from the moment they arrive
  const babies = childIds.join(',');
  const storeKeys = useMemo(
    () =>
      wanted && householdId !== null
        ? [keys.household(householdId), `recency/${householdId}/${viewerId ?? ''}/${babies}`]
        : [],
    [wanted, householdId, viewerId, babies],
  );
  const lastAt = useLocalQuery<LastAt>(
    storeKeys,
    async db =>
      wanted && householdId !== null && viewerId !== null
        ? // a read that fails starts every sheet on the first child, as an empty log would
          await lastStartByChild(db, householdId, viewerId, childIds, BABY_TYPES).catch(
            (): LastAt => NONE,
          )
        : NONE,
    NONE,
  );
  const running = useAllRunningTimers();
  return useMemo<Recency>(() => ({ lastAt, running }), [lastAt, running]);
}
