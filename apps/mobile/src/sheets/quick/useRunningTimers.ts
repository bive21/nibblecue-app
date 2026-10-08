/**
 * The timers running right now, for the NOW card and the timer sheets, re-read whenever a
 * timer write invalidates `keys.timers(household)`. Elapsed is never in here: the card
 * computes it from `startedAtMs` on every tick (CLAUDE.md rule 12).
 *
 * THE HOUSEHOLD'S TIMERS ARE READ, AND THE CHILD IS APPLIED IN MEMORY. This used to pass
 * `childId` into the query with only `keys.timers(household)` to watch — and `useLocalQuery`
 * captures its loader at the last key change, so the child was frozen at whatever it was when
 * the household id first resolved. `ChildContext` hydrates the remembered child from
 * AsyncStorage asynchronously, so in practice that was `children[0]`: a twin household's second
 * baby could start a breastfeed and see nothing on Today — no NOW card, no timer bar, no running
 * tile — while the FIRST baby's timer showed on the second baby's screen, and `todayTotals` added
 * the first baby's running minutes to the second baby's day. It also made the clash check in
 * `useTimerActions.start` read the wrong list, so a second "start" wrote a duplicate row.
 *
 * Filtering in a `useMemo` instead of in SQL is the shape `useForesight`, `useNapOutlook` and
 * `useVaccines` already use, and it cannot go stale: the read has no child in it to freeze.
 * `childScopedTimers` keeps the same rule the query had — a household timer (`child_id is null`,
 * a pump) belongs to every view.
 *
 * ONE READ FOR ALL OF THEM (2026-09-28). A dozen readers hold this list at once — Today, the timer
 * sheets, the nap outlook, the link router, the capture sheets' host, the celebration and trial
 * watchers — and each read it again on every timer write, so a tap on Start ran the same `select`
 * a dozen times while the card was appearing. They share one read now (`useSharedLocalQuery`),
 * and a sheet that mounts starts on the list already read instead of on "not read yet".
 */
import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { keys } from '../../data/store';
import { useSharedLocalQuery } from '../../data/useSharedLocalQuery';
import { timersNow, type TimerNow } from '../../db/queries/today';
import { childScopedTimers } from '../../household/childScope';
import { useChild } from '../../household/ChildContext';

/**
 * THE LIST BEFORE IT HAS BEEN READ — and only then: every read that comes back is a fresh array,
 * even an empty one, so this exact array means "not read yet" (`timersRead`).
 */
const NONE: TimerNow[] = [];

/** A read of the household's timers, labelled with the household it was read for. */
interface TimersRead {
  householdId: string | null;
  timers: TimerNow[];
}

/**
 * EVERY running timer in the household, AND WHETHER THAT LIST HAS BEEN READ YET.
 *
 * The list starts empty and is filled by an async read of the local database, so for the first
 * frames after launch — and after a sign-in, when the household id first arrives — "no timers"
 * and "not read yet" look the same. For a screen that is a blank card for a moment. For the link
 * router it was a wrong action (the audit of 2026-09-24, care N1): a widget Stop that launched the
 * app found no timer and was dropped, and a coin tap meant to END a sleep STARTED a second one.
 * `loaded` is true only once a read for the CURRENT household has come back.
 */
export function useAllRunningTimersLoaded(): { timers: TimerNow[]; loaded: boolean } {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const storeKeys = useMemo(
    () => (householdId === null ? [] : [keys.timers(householdId)]),
    [householdId],
  );
  const read = useSharedLocalQuery<TimersRead | null>(
    `timers/${householdId ?? ''}`,
    storeKeys,
    async db => ({
      householdId,
      // a read that fails is still a read that came back: the empty list it has always meant,
      // rather than a router that waits for ever on a query that will not answer — a FRESH empty
      // list, because `NONE` itself means "not read yet"
      timers:
        householdId === null
          ? NONE
          : await timersNow(db, householdId, null).catch((): TimerNow[] => []),
    }),
    null,
  );
  return useMemo(() => {
    const current = read !== null && read.householdId === householdId;
    return {
      timers: current ? read.timers : NONE,
      loaded: current && householdId !== null,
    };
  }, [read, householdId]);
}

/**
 * EVERY running timer in the household, whatever the child chip says.
 *
 * For the callers that must not be scoped by the chip: a widget or notification "Stop" names
 * its own child, and that child is often not the one on screen; a timer sheet writes for the
 * child under "Logging for", which need not be the chip's either. Screens want `useRunningTimers`.
 */
export function useAllRunningTimers(): TimerNow[] {
  return useAllRunningTimersLoaded().timers;
}

/**
 * Whether a list from `useAllRunningTimers` is a real read of the current household's timers, or
 * the empty stand-in from before the read came back (N1). An empty list that WAS read is `true`.
 */
export const timersRead = (list: readonly TimerNow[]): boolean => list !== NONE;

export function useRunningTimers(): TimerNow[] {
  const { child, isAll } = useChild();
  const childId = isAll ? null : (child?.id ?? null);
  const all = useAllRunningTimers();
  return useMemo(() => childScopedTimers(all, childId), [all, childId]);
}
