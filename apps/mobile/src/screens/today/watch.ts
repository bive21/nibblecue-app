/**
 * WHICH STORE KEYS TODAY'S ACTIVITY READS LISTEN TO — the rows, the newest of each type and the
 * last bottle (`useTodayData`), all three on the same keys. Pure, like the Log's own
 * (`screens/timeline/watch.ts`), so `data/store.test.ts` can hold one logged entry to one read of
 * each without a renderer.
 *
 * The local day is a key of its own so the reads re-run at midnight: `useLocalQuery` reads its
 * loader through the closure of the last key change, so a moved window needs a moved key.
 */
import { keys } from '../../data/store';

export function todayReadKeys(
  householdId: string | null,
  childId: string | null,
  dayKey: string,
): string[] {
  return householdId === null
    ? []
    : [
        keys.todayTotals(childId),
        keys.timeline(childId, 'all'),
        keys.household(householdId),
        `today/day/${dayKey}`,
      ];
}

/**
 * THE KEYS THAT RE-STAMP A MINUTE TICK besides the minute (`useMinuteTick`): the one every local
 * commit bumps, or none — for a reader whose own read moves its clock when it lands. Here, pure,
 * so `data/store.test.ts` can count what one save costs the schedule without a renderer.
 */
export const tickStampKeys = (onWrite: boolean): string[] => (onWrite ? [keys.outbox()] : []);
