/**
 * "When logging a pump that's already finished, it is not recorded in the activity or in the
 * schedule or next interval time" — the owner, 2026-09-16.
 *
 * It WAS recorded, every time. What was broken was the clock the engine read it against:
 * `scheduleDay` and `intervalOccurrences` ignore a session whose start is after `ctx.nowMs`,
 * correctly, and `ctx.nowMs` came from a tick that only moved once a minute — so for up to sixty
 * seconds a just-logged session was in the database and invisible to the schedule. Same cause as
 * "the brown border takes 30 seconds to go".
 *
 * This walks the whole path the phone walks — the sheet's own arithmetic, the write, the two
 * reads, the engine — and asserts the two things the owner could not see: the row exists, and
 * the next slot moved. The last case is the regression itself: an engine whose clock is a minute
 * behind the write still has to count the write, which is what `Math.max(tick, readAt)` in
 * `useScheduleDay` guarantees.
 */
import { intervalOccurrences, ruleFrom, type Session } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { scheduleSessions } from '../db/queries/schedule';
import { todayActivities } from '../db/queries/today';
import { pumpSession } from '../sheets/quick/modules/pumpForm';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { storePumpSession } from './stash';

const H = 3_600_000;
/** 2026-09-14 20:00 UTC — the instant the sheet was opened. */
const OPENED = Date.parse('2026-09-14T20:00:00.000Z');
const DAY_START = Date.parse('2026-09-14T00:00:00.000Z');

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const fixture = async () => {
  const f = await seedHousehold();
  restore = f.restoreIds;
  return f;
};

const asSession = (r: { id: string; type: string; start_at: string; end_at: string | null }) => ({
  id: r.id,
  type: r.type as Session['type'],
  childId: null,
  startMs: Date.parse(r.start_at),
  endMs: r.end_at === null ? null : Date.parse(r.end_at),
  running: false,
});

describe('a pump entered as “already finished” lands everywhere it should', () => {
  it('writes the activity, and the sheet’s own arithmetic decides the start', async () => {
    const { db, clock } = await fixture();
    // the sheet: opened at 20:00, its End time on Now, saved 40 seconds later, the default
    // 18-minute length kept — a session that ended as the sheet opened (`pumpSession`)
    const savedAt = OPENED + 40_000;
    const { startMs, endMs } = pumpSession(OPENED, 18, savedAt);
    expect(endMs).toBe(OPENED);
    expect(startMs).toBe(OPENED - 18 * 60_000);

    const result = await storePumpSession(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      leftMl: 90,
      rightMl: 105,
      store: false,
    });
    expect(result.committed).toBe(true);

    // it is in the timeline the child's own view reads — a pump is a household row, and a view
    // scoped to one baby must still show it
    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, DAY_START);
    expect(rows.map(r => r.type)).toContain('pump');
    expect(rows.find(r => r.type === 'pump')?.startMs).toBe(startMs);
    expect(rows.find(r => r.type === 'pump')?.totalMl).toBe(195);
  });

  it('moves the next pump — measured from the START, and read by an engine whose clock lags', async () => {
    const { db, clock } = await fixture();
    const savedAt = OPENED + 40_000;
    const { startMs, endMs } = pumpSession(OPENED, 18, savedAt);
    await storePumpSession(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      leftMl: 90,
      rightMl: 105,
      store: false,
    });

    const sessions = (
      await scheduleSessions(db, HOUSEHOLD, ['pump'], new Date(DAY_START).toISOString())
    ).map(asSession);
    expect(sessions).toHaveLength(1);

    const rule = ruleFrom({
      id: 'pump-rule',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      effectiveFromMs: DAY_START,
    });
    const ctx = { nowMs: savedAt, timeZone: 'UTC', dayStartMs: DAY_START };
    const res = intervalOccurrences(rule, sessions, ctx);
    // three hours from when the session BEGAN, not from when it was entered or when it ended
    expect(res.next?.atMs).toBe(startMs + 3 * H);
    expect(res.next?.status).toBe('UPCOMING');
    // the day before the session is a run of slots that passed with nothing logged, and each is
    // its own row now rather than one collapsed count (the owner, 2026-09-16). What matters for
    // this round trip is that they all sit BEFORE the session, and the one open slot after it.
    expect(res.occurrences.filter(o => o.status === 'MISSED').every(o => o.atMs < startMs)).toBe(
      true,
    );
    expect(res.occurrences.filter(o => o.status === 'DUE')).toHaveLength(0);
  });

  it('an engine clock behind the write cannot see it — which is the bug that was fixed', async () => {
    // The owner's bottle: logged at 20:00:40, with the minute tick still reading 20:00:00. The
    // session's start is AFTER the engine's now, so `intervalOccurrences` drops it, the chain
    // never restarts, and the tile keeps its amber ring until the minute turns over. Nothing to
    // do with the server — the row was local and committed (the test above proves that much).
    const loggedAt = OPENED + 40_000;
    const justNow: Session = {
      id: 'logged-now',
      type: 'pump',
      childId: null,
      startMs: loggedAt,
      endMs: loggedAt,
      running: false,
    };
    const rule = ruleFrom({
      id: 'pump-rule',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      effectiveFromMs: DAY_START,
    });
    const ctx = { timeZone: 'UTC', dayStartMs: DAY_START };

    const stale = OPENED;
    const behind = intervalOccurrences(rule, [justNow], { ...ctx, nowMs: stale });
    expect(behind.next?.atMs, 'a stale clock cannot see it').not.toBe(loggedAt + 3 * H);

    // `useMinuteTick` re-stamps on every commit and `useScheduleDay` takes the later of the tick
    // and the moment the rows were read, so the engine's now is never older than its data.
    const guarded = intervalOccurrences(rule, [justNow], {
      ...ctx,
      nowMs: Math.max(stale, loggedAt),
    });
    expect(guarded.next?.atMs).toBe(loggedAt + 3 * H);
    expect(guarded.next?.status).toBe('UPCOMING');
  });
});
