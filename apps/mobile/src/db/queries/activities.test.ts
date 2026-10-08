/**
 * The household's home zone, as its row holds it.
 *
 * This file used to test the first activity-read layer — `lastOf`, `totalsByType`,
 * `timelinePage`, `queuedActivityIds`, `activityById` and a local-day wrapper. Nothing in the app
 * ran those after Today and the Log moved to `today.ts`, and they went on 2026-09-26. What their
 * tests guarded is guarded on the reads that ship: the soft-delete filter, the child scope, the
 * keyset and the queued flag in `today.test.ts` (`todayActivities`, `lastActivities`,
 * `timelineRows`), and the household's own day — a 03:12 feed that is still yesterday evening at
 * home, a day a DST jump makes 23 hours long — in `@nibblecue/core`'s `today/day.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HOUSEHOLD, seedHousehold } from '../../testing/fixtures';
import { homeTimeZone } from './activities';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

describe('the household’s home zone', () => {
  it('reads the household’s home zone as its row holds it, and nothing before the row arrives', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    expect(await homeTimeZone(f.db, HOUSEHOLD)).toBe('America/Los_Angeles');
    // no guess at the device's zone: "away" is measured from home, and a guessed home is never away
    expect(await homeTimeZone(f.db, '00000000-0000-4000-8000-00000000dead')).toBeNull();
  });
});
