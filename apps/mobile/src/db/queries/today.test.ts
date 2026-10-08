/**
 * The reads that fill the Today models (WP5.1).
 *
 * The assertions that matter here are the ones that would silently show a parent the wrong
 * thing: a soft-deleted entry still on Today, a private pump session leaking into another
 * caregiver's totals, a detail row that has not arrived yet taking its activity down with
 * it, and a timeline page that shifts under a concurrent insert.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../driver';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../../testing/fixtures';
import { lastBath, lastBreastfeed, lastDiaper, pumpSummary } from './details';
import { logActivity } from '../../data/activities';
import { deleteEntry } from '../../data/entries';
import {
  catchupRows,
  entryById,
  lastActivities,
  lastStartByChild,
  olderThanFloorCount,
  timelineRows,
  timersNow,
  todayActivities,
  typesPresent,
  __internal,
} from './today';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture(): Promise<Db> {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f.db;
}

const OTHER_USER = 'bbbbbbbb-0000-4000-8000-0000000000ff';
const iso = (s: string): string => new Date(s).toISOString();
const ms = (s: string): number => Date.parse(s);

let seq = 0;
async function addActivity(
  db: Db,
  over: {
    type: string;
    startAt: string;
    endAt?: string | null;
    childId?: string | null;
    isPrivate?: boolean;
    createdBy?: string;
    deletedAt?: string | null;
    /** When the row was written; the start when absent, as for an entry logged as it happened. */
    createdAt?: string;
  },
): Promise<string> {
  seq += 1;
  const id = `11111111-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  await db.run(
    `insert into activities
       (id, client_op_id, household_id, child_id, type, start_at, end_at, is_private,
        created_by, created_at, updated_at, deleted_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      id,
      HOUSEHOLD,
      over.childId === undefined ? CHILD_A : over.childId,
      over.type,
      iso(over.startAt),
      over.endAt ? iso(over.endAt) : null,
      over.isPrivate ? 1 : 0,
      over.createdBy ?? USER,
      iso(over.createdAt ?? over.startAt),
      iso(over.createdAt ?? over.startAt),
      over.deletedAt ? iso(over.deletedAt) : null,
    ],
  );
  return id;
}

const FAR_BACK = ms('2026-01-01T00:00:00Z');

describe('the ISO-to-ms boundary', () => {
  it('converts the mirror’s text timestamps to unix ms', () => {
    expect(__internal.ms('2026-09-14T08:00:00.000Z')).toBe(ms('2026-09-14T08:00:00Z'));
  });

  it('returns null for absent and for unparseable, never NaN', () => {
    expect(__internal.ms(null)).toBeNull();
    expect(__internal.ms(undefined)).toBeNull();
    expect(__internal.ms('')).toBeNull();
    expect(__internal.ms('not a date')).toBeNull();
    // NaN would poison every comparison downstream without throwing
    expect(Number.isNaN(__internal.ms('not a date') as number)).toBe(false);
  });
});

describe('todayActivities', () => {
  it('reads a bottle back with its detail field', async () => {
    const db = await fixture();
    const id = await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z' });
    await db.run('insert into bottle_details (activity_id, kind, consumed_ml) values (?, ?, ?)', [
      id,
      'EBM',
      120,
    ]);

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'bottle', consumedMl: 120, childId: CHILD_A });
    expect(rows[0]?.startMs).toBe(ms('2026-09-14T08:00:00Z'));
  });

  it('keeps an activity whose detail row has not arrived yet', async () => {
    // a delta pull applies pages per table in whatever order they arrive, and the mirror
    // declares no foreign keys precisely so this row is not lost
    const db = await fixture();
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z' });

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consumedMl).toBeNull();
  });

  /**
   * THE RASH TICK REACHES THE PROJECTION. The sheet has written `diaper_details.rash` since the
   * first release and this select did not carry it, so the visit sheet, the activity log and the
   * diapers card had nothing to show (the owner, 2026-09-19). A column that is stored and never
   * selected is invisible in exactly this way, which is why the assertion is on the read and not
   * on the write.
   */
  it('carries the diaper rash tick, true, false and not-yet-arrived kept apart', async () => {
    const db = await fixture();
    const ticked = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T08:00:00Z' });
    const clear = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T09:00:00Z' });
    // no detail row at all: the delta pull has not brought it yet
    await addActivity(db, { type: 'diaper', startAt: '2026-09-14T10:00:00Z' });
    await db.run('insert into diaper_details (activity_id, kind, rash) values (?, ?, 1)', [
      ticked,
      'WET',
    ]);
    await db.run('insert into diaper_details (activity_id, kind, rash) values (?, ?, 0)', [
      clear,
      'DIRTY',
    ]);

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    const rash = new Map(rows.map(r => [r.startMs, r.diaperRash]));
    expect(rash.get(ms('2026-09-14T08:00:00Z'))).toBe(true);
    expect(rash.get(ms('2026-09-14T09:00:00Z'))).toBe(false);
    // null, not false: "no detail row yet" is not "the parent said no"
    expect(rash.get(ms('2026-09-14T10:00:00Z'))).toBeNull();
  });

  it('reads the mirror’s 0/1 and a pulled JSON boolean the same way', () => {
    // `Boolean(0)` would be right and `v !== 0` would call `false` true; both encodings are named
    expect(__internal.bool(1)).toBe(true);
    expect(__internal.bool(0)).toBe(false);
    expect(__internal.bool(true)).toBe(true);
    expect(__internal.bool(false)).toBe(false);
    expect(__internal.bool(null)).toBeNull();
    expect(__internal.bool(undefined)).toBeNull();
  });

  it('excludes a soft-deleted entry', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'diaper', startAt: '2026-09-14T08:00:00Z' });
    await addActivity(db, {
      type: 'diaper',
      startAt: '2026-09-14T09:00:00Z',
      deletedAt: '2026-09-14T09:05:00Z',
    });

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.startMs).toBe(ms('2026-09-14T08:00:00Z'));
  });

  it('includes household-scoped rows alongside the selected child', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z', childId: CHILD_A });
    await addActivity(db, { type: 'pump', startAt: '2026-09-14T09:00:00Z', childId: null });

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows.map(r => r.type).sort()).toEqual(['bottle', 'pump']);
  });

  it('excludes the other twin’s entries when one child is selected', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z', childId: CHILD_A });
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T09:00:00Z', childId: CHILD_B });

    expect(await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK)).toHaveLength(1);
    expect(await todayActivities(db, HOUSEHOLD, CHILD_B, FAR_BACK)).toHaveLength(1);
    // null means the whole household — what the Both view reads
    expect(await todayActivities(db, HOUSEHOLD, null, FAR_BACK)).toHaveLength(2);
  });

  it('honors the sinceMs floor so Today never reads the whole history', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bottle', startAt: '2026-06-01T08:00:00Z' });
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z' });

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, ms('2026-09-10T00:00:00Z'));
    expect(rows).toHaveLength(1);
  });

  it('returns newest first', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'note', startAt: '2026-09-14T08:00:00Z' });
    await addActivity(db, { type: 'note', startAt: '2026-09-14T11:00:00Z' });

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows.map(r => r.startMs)).toEqual([
      ms('2026-09-14T11:00:00Z'),
      ms('2026-09-14T08:00:00Z'),
    ]);
  });

  it('reports privacy so the caller can filter it — the query does not decide who is looking', async () => {
    const db = await fixture();
    await addActivity(db, {
      type: 'pump',
      startAt: '2026-09-14T06:00:00Z',
      childId: null,
      isPrivate: true,
      createdBy: OTHER_USER,
    });

    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows[0]).toMatchObject({ isPrivate: true, createdBy: OTHER_USER });
  });
});

describe('lastActivities — the newest row of every type, whatever its age (WP5.7)', () => {
  it('returns one row per type, the newest, even from months back', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bath', startAt: '2026-06-01T08:00:00Z' });
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z' });
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T11:00:00Z' });

    const rows = await lastActivities(db, HOUSEHOLD, CHILD_A);
    expect(rows.map(r => [r.type, r.startMs])).toEqual([
      ['bottle', ms('2026-09-14T11:00:00Z')],
      ['bath', ms('2026-06-01T08:00:00Z')],
    ]);
  });

  it('skips a soft-deleted newest and falls back to the one before it', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'diaper', startAt: '2026-09-14T08:00:00Z' });
    await addActivity(db, {
      type: 'diaper',
      startAt: '2026-09-14T11:00:00Z',
      deletedAt: '2026-09-14T11:05:00Z',
    });

    const rows = await lastActivities(db, HOUSEHOLD, CHILD_A);
    expect(rows.map(r => r.startMs)).toEqual([ms('2026-09-14T08:00:00Z')]);
  });

  it('the last bottle is the last bottle of milk: water never answers "when was the last feed"', async () => {
    const db = await fixture();
    const milk = await addActivity(db, { type: 'bottle', startAt: '2026-09-14T03:00:00Z' });
    const water = await addActivity(db, { type: 'bottle', startAt: '2026-09-14T05:50:00Z' });
    await db.run(
      `insert into bottle_details (activity_id, kind, consumed_ml) values (?, 'EBM', 120), (?, 'WATER', 60)`,
      [milk, water],
    );
    const rows = await lastActivities(db, HOUSEHOLD, CHILD_A);
    expect(rows.map(r => [r.type, r.startMs, r.bottleKind])).toEqual([
      ['bottle', ms('2026-09-14T03:00:00Z'), 'EBM'],
    ]);
  });

  /**
   * THE OWNER, 2026-09-26: "i added 2 min left 2 min right, but it keeps showing as 'Now · 0m'".
   * A feed started and finished at once by mistake at 10:00, then the real one typed in at 10:00:40
   * as "Already finished" — which starts at 9:56:40, before the mistap. The newest START was the
   * mistap; the feed that happened last is the one typed in, and it is the one read back.
   */
  it('reads back the entry that happened last, not the newest start: a feed typed in afterwards', async () => {
    const db = await fixture();
    const mistap = await addActivity(db, {
      type: 'breastfeed',
      startAt: '2026-09-14T10:00:00Z',
      endAt: '2026-09-14T10:00:05Z',
    });
    const typed = await addActivity(db, {
      type: 'breastfeed',
      startAt: '2026-09-14T09:56:40Z',
      endAt: '2026-09-14T10:00:40Z',
    });
    await db.run(
      `insert into breastfeed_details (activity_id, first_side, left_seconds, right_seconds)
       values (?, 'LEFT', 5, 0), (?, null, 120, 120)`,
      [mistap, typed],
    );
    await addActivity(db, { type: 'diaper', startAt: '2026-09-14T09:00:00Z' });

    const rows = await lastActivities(db, HOUSEHOLD, CHILD_A);
    // still one row per type, newest start first
    expect(rows.map(r => [r.type, r.id])).toEqual([
      ['breastfeed', typed],
      ['diaper', expect.any(String)],
    ]);
    expect(rows[0]).toMatchObject({ leftSeconds: 120, rightSeconds: 120 });
    // and the sheet's hint names the same feed
    const hint = await lastBreastfeed(db, { householdId: HOUSEHOLD, childId: CHILD_A });
    expect(hint).toEqual({
      first_side: null,
      start_at: iso('2026-09-14T09:56:40Z'),
      // and its sides, which a feed typed in next opens on (2026-10-06)
      left_seconds: 120,
      right_seconds: 120,
    });
  });

  it('keeps the newest start when nothing overlaps it, and a deleted overlap does not count', async () => {
    const db = await fixture();
    await addActivity(db, {
      type: 'sleep',
      startAt: '2026-09-14T08:00:00Z',
      endAt: '2026-09-14T09:00:00Z',
    });
    const nap = await addActivity(db, {
      type: 'sleep',
      startAt: '2026-09-14T13:00:00Z',
      endAt: '2026-09-14T13:40:00Z',
    });
    await addActivity(db, {
      type: 'sleep',
      startAt: '2026-09-14T12:00:00Z',
      endAt: '2026-09-14T14:00:00Z',
      deletedAt: '2026-09-14T14:05:00Z',
    });
    expect((await lastActivities(db, HOUSEHOLD, CHILD_A)).map(r => r.id)).toEqual([nap]);
  });

  it('is per child: the other twin’s newer bath is not this child’s last bath', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bath', startAt: '2026-09-10T08:00:00Z', childId: CHILD_A });
    await addActivity(db, { type: 'bath', startAt: '2026-09-14T08:00:00Z', childId: CHILD_B });

    const a = await lastActivities(db, HOUSEHOLD, CHILD_A);
    expect(a.map(r => r.startMs)).toEqual([ms('2026-09-10T08:00:00Z')]);
    const all = await lastActivities(db, HOUSEHOLD, null);
    expect(all.map(r => r.startMs)).toEqual([ms('2026-09-14T08:00:00Z')]);
  });
});

/**
 * WHAT THE LOGGING-FOR ROW STARTS ON, READ AHEAD (`sheets/quick/loggingForStart.ts`; the owner,
 * 2026-09-25): each baby's newest start per type, over the same rows the tiles call "last".
 */
describe('lastStartByChild — each baby’s newest start, per type', () => {
  const TYPES = ['bottle', 'breastfeed', 'diaper', 'sleep', 'pump'] as const;
  const read = (db: Db, viewer = USER) =>
    lastStartByChild(db, HOUSEHOLD, viewer, [CHILD_A, CHILD_B], TYPES);

  it('keeps each baby apart, and each type apart, however old the entry', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T08:00:00Z', childId: CHILD_A });
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T11:00:00Z', childId: CHILD_A });
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T09:30:00Z', childId: CHILD_A });
    await addActivity(db, {
      type: 'breastfeed',
      startAt: '2026-09-14T09:00:00Z',
      childId: CHILD_B,
    });
    await addActivity(db, { type: 'diaper', startAt: '2026-06-01T08:00:00Z', childId: CHILD_B });

    expect(await read(db)).toEqual({
      [CHILD_A]: { bottle: ms('2026-09-14T11:00:00Z') },
      [CHILD_B]: {
        breastfeed: ms('2026-09-14T09:00:00Z'),
        diaper: ms('2026-06-01T08:00:00Z'),
      },
    });
  });

  it('reads only what the tiles would: no deleted row, no water, no one else’s private row', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'diaper', startAt: '2026-09-14T08:00:00Z' });
    await addActivity(db, {
      type: 'diaper',
      startAt: '2026-09-14T11:00:00Z',
      deletedAt: '2026-09-14T11:05:00Z',
    });
    const milk = await addActivity(db, { type: 'bottle', startAt: '2026-09-14T03:00:00Z' });
    const water = await addActivity(db, { type: 'bottle', startAt: '2026-09-14T05:50:00Z' });
    await db.run(
      `insert into bottle_details (activity_id, kind, consumed_ml) values (?, 'EBM', 120), (?, 'WATER', 60)`,
      [milk, water],
    );
    await addActivity(db, {
      type: 'sleep',
      startAt: '2026-09-14T12:00:00Z',
      isPrivate: true,
      createdBy: OTHER_USER,
    });

    expect(await read(db)).toEqual({
      [CHILD_A]: { diaper: ms('2026-09-14T08:00:00Z'), bottle: ms('2026-09-14T03:00:00Z') },
    });
    // the person who logged the private row reads it
    expect((await read(db, OTHER_USER))[CHILD_A]?.sleep).toBe(ms('2026-09-14T12:00:00Z'));
  });

  it('has no baby for a household row, and reads only the babies and types it is asked for', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'pump', startAt: '2026-09-14T08:00:00Z', childId: null });
    await addActivity(db, { type: 'bath', startAt: '2026-09-14T09:00:00Z', childId: CHILD_A });
    expect(await read(db)).toEqual({});
    expect(await lastStartByChild(db, HOUSEHOLD, USER, [CHILD_A], ['bath'])).toEqual({
      [CHILD_A]: { bath: ms('2026-09-14T09:00:00Z') },
    });
    expect(await lastStartByChild(db, HOUSEHOLD, USER, [], ['bath'])).toEqual({});
    expect(await lastStartByChild(db, HOUSEHOLD, USER, [CHILD_A], [])).toEqual({});
  });
});

/**
 * THE TIMER READ THAT SHIPS. These four pinned `activeTimers` until it went (2026-09-26): it was a
 * thinner copy of this read that nothing used, and the rules belong on the one Today and the timer
 * sheets run.
 */
describe('timersNow', () => {
  async function addTimer(db: Db, type: string, startedAt: string, childId: string | null) {
    seq += 1;
    await db.run(
      `insert into running_timers (id, household_id, child_id, type, started_at, started_by, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `22222222-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        HOUSEHOLD,
        childId,
        type,
        iso(startedAt),
        USER,
        iso(startedAt),
        iso(startedAt),
      ],
    );
  }

  it('returns a running timer with its start as ms, and no elapsed of any kind', async () => {
    const db = await fixture();
    await addTimer(db, 'sleep', '2026-09-14T11:30:00Z', CHILD_A);

    const timers = await timersNow(db, HOUSEHOLD, CHILD_A);
    expect(timers).toHaveLength(1);
    expect(timers[0]).toMatchObject({ type: 'sleep', startedAtMs: ms('2026-09-14T11:30:00Z') });
    // there is no stored counter to go stale across a kill, a lock or a handover
    expect(Object.keys(timers[0] ?? {})).not.toContain('elapsedMs');
  });

  it('includes the household-scoped pump timer while a child is selected', async () => {
    const db = await fixture();
    await addTimer(db, 'pump', '2026-09-14T06:00:00Z', null);
    const timers = await timersNow(db, HOUSEHOLD, CHILD_A);
    expect(timers.map(t => t.type)).toEqual(['pump']);
  });

  it('lets each twin have their own sleep timer', async () => {
    const db = await fixture();
    await addTimer(db, 'sleep', '2026-09-14T11:00:00Z', CHILD_A);
    await addTimer(db, 'sleep', '2026-09-14T11:15:00Z', CHILD_B);

    expect(await timersNow(db, HOUSEHOLD, CHILD_A)).toHaveLength(1);
    expect(await timersNow(db, HOUSEHOLD, CHILD_B)).toHaveLength(1);
    expect(await timersNow(db, HOUSEHOLD, null)).toHaveLength(2);
  });

  it('names who started it, so a caregiver knows whose timer they are stopping', async () => {
    const db = await fixture();
    await addTimer(db, 'sleep', '2026-09-14T11:30:00Z', CHILD_A);
    expect((await timersNow(db, HOUSEHOLD, CHILD_A))[0]?.startedBy).toBe(USER);
  });
});

describe('the timeline reads (WP5.8)', () => {
  it('pages by keyset newest first, filters by type, and says who wrote it and whether it is queued', async () => {
    const db = await fixture();
    for (let h = 0; h < 4; h += 1) {
      await addActivity(db, {
        type: h % 2 ? 'diaper' : 'note',
        startAt: `2026-09-14T0${h}:00:00Z`,
      });
    }
    const req = { householdId: HOUSEHOLD, childId: CHILD_A, filter: 'all' as const, limit: 3 };
    const page1 = await timelineRows(db, req);
    expect(page1.map(r => r.startMs)).toEqual([
      ms('2026-09-14T03:00:00Z'),
      ms('2026-09-14T02:00:00Z'),
      ms('2026-09-14T01:00:00Z'),
    ]);
    const page2 = await timelineRows(db, { ...req, beforeMs: page1[2]?.startMs ?? null });
    expect(page2.map(r => r.startMs)).toEqual([ms('2026-09-14T00:00:00Z')]);
    expect((await timelineRows(db, { ...req, filter: 'diaper' })).map(r => r.type)).toEqual([
      'diaper',
      'diaper',
    ]);
    // the fixture's rows have local_synced 0 and a seeded profile
    expect(page1[0]).toMatchObject({ queued: true });
    expect(typeof page1[0]?.byName === 'string' || page1[0]?.byName === null).toBe(true);
  });

  /**
   * THROUGH THE REAL WRITE AND THE REAL DELETE. Moved here on 2026-09-26 from `activities.test.ts`,
   * where it pinned the first read layer (`lastOf`, `timelinePage`, `queuedActivityIds`,
   * `activityById`) until nothing ran those: the same rules, on the reads the Log and Today make.
   */
  it('a row deleted through the Log’s own delete leaves the Log, the newest of its type and the entry read', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    const { db, clock } = f;
    const ctx = {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet' as const,
    };
    const first = await logActivity(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'diaper',
      startAt: '2026-09-13T10:00:00.000Z',
      detail: { kind: 'WET' },
    });
    clock.advance(10_000);
    const second = await logActivity(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'diaper',
      startAt: '2026-09-13T11:00:00.000Z',
      detail: { kind: 'DIRTY' },
    });
    const kept = first.entityIds[0] ?? '';
    const gone = second.entityIds[0] ?? '';
    const newestDiaper = async () =>
      (await lastActivities(db, HOUSEHOLD, CHILD_A)).find(r => r.type === 'diaper')?.id;
    const req = { householdId: HOUSEHOLD, childId: CHILD_A, filter: 'all' as const, limit: 10 };

    expect(await newestDiaper()).toBe(gone);
    // a fresh write is queued until the server has it
    expect((await timelineRows(db, req)).map(r => [r.id, r.queued])).toEqual([
      [gone, true],
      [kept, true],
    ]);

    await deleteEntry(db, clock, { ...ctx, activityId: gone, childId: CHILD_A, type: 'diaper' });

    expect(await newestDiaper()).toBe(kept);
    expect((await timelineRows(db, req)).map(r => r.id)).toEqual([kept]);
    expect(await entryById(db, gone)).toBeNull();
    // and once a pull marks the survivor synced, its row stops saying it is waiting
    await db.run('update activities set local_synced = 1 where id = ?', [kept]);
    expect((await timelineRows(db, req))[0]).toMatchObject({ id: kept, queued: false });
  });

  /**
   * THE PLAN'S HISTORY FLOOR (`historyFloorMs` in core; `GATES.timeline.beyond_free_window`).
   *
   * Free is 7 days of history in the app, and until 2026-09-23 this query had no floor at all — so
   * Reports clamped and said so while the Activity log scrolled back forever. What has to hold:
   * the floor bounds the FIRST page and every page after it, the count under the gate matches what
   * the floor left out, and `null` still means everything.
   */
  it('never returns a row below the floor, on the first page or a later one', async () => {
    const db = await fixture();
    for (const day of ['08', '09', '10', '11', '12']) {
      await addActivity(db, { type: 'note', startAt: `2026-09-${day}T12:00:00Z` });
    }
    const floor = ms('2026-09-10T00:00:00Z');
    const req = {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      filter: 'all' as const,
      sinceMs: floor,
      limit: 2,
    };
    const page1 = await timelineRows(db, req);
    expect(page1.map(r => r.startMs)).toEqual([
      ms('2026-09-12T12:00:00Z'),
      ms('2026-09-11T12:00:00Z'),
    ]);
    // paging on: the floor does not move with the cursor, so the walk stops at the plan's edge
    const page2 = await timelineRows(db, { ...req, beforeMs: page1[1]?.startMs ?? null });
    expect(page2.map(r => r.startMs)).toEqual([ms('2026-09-10T12:00:00Z')]);
    const page3 = await timelineRows(db, { ...req, beforeMs: page2[0]?.startMs ?? null });
    expect(page3).toEqual([]);
    // and without a floor the same walk reaches all five
    const whole = await timelineRows(db, { ...req, sinceMs: null, limit: 50 });
    expect(whole).toHaveLength(5);
  });

  it('counts what the floor left out, so the gate can say the number', async () => {
    const db = await fixture();
    for (const day of ['05', '06', '07', '11', '12']) {
      await addActivity(db, { type: 'note', startAt: `2026-09-${day}T12:00:00Z` });
    }
    await addActivity(db, { type: 'bath', startAt: '2026-09-06T09:00:00Z' });
    // one deleted row below the floor, which is not an entry and must not be counted as one
    await addActivity(db, {
      type: 'note',
      startAt: '2026-09-05T09:00:00Z',
      deletedAt: '2026-09-05T09:01:00Z',
    });
    const base = { householdId: HOUSEHOLD, childId: CHILD_A, sinceMs: ms('2026-09-10T00:00:00Z') };
    expect(await olderThanFloorCount(db, { ...base, filter: 'all' })).toBe(4);
    // the filter applies, so the number agrees with the list it sits under
    expect(await olderThanFloorCount(db, { ...base, filter: 'note' })).toBe(3);
    expect(await olderThanFloorCount(db, { ...base, filter: 'bath' })).toBe(1);
    // a household younger than the window has nothing behind the gate, so no gate is drawn
    expect(
      await olderThanFloorCount(db, {
        ...base,
        filter: 'all',
        sinceMs: ms('2026-09-01T00:00:00Z'),
      }),
    ).toBe(0);
  });

  it('typesPresent lists each live type once, in scope', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bath', startAt: '2026-09-14T01:00:00Z' });
    await addActivity(db, { type: 'bath', startAt: '2026-09-14T02:00:00Z' });
    await addActivity(db, {
      type: 'diaper',
      startAt: '2026-09-14T03:00:00Z',
      deletedAt: '2026-09-14T03:01:00Z',
    });
    await addActivity(db, { type: 'sleep', startAt: '2026-09-14T04:00:00Z', childId: CHILD_B });
    expect(await typesPresent(db, HOUSEHOLD, CHILD_A)).toEqual(['bath']);
    expect(await typesPresent(db, HOUSEHOLD, null)).toEqual(['bath', 'sleep']);
  });

  it('entryById returns the row with its detail, and null for a deleted or unknown id', async () => {
    const db = await fixture();
    const id = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T03:00:00Z' });
    await db.run('insert into diaper_details (activity_id, kind) values (?, ?)', [id, 'DIRTY']);
    const e = await entryById(db, id);
    expect(e?.activity).toMatchObject({ id, type: 'diaper', child_id: CHILD_A });
    expect(e?.detail).toMatchObject({ kind: 'DIRTY' });
    const gone = await addActivity(db, {
      type: 'note',
      startAt: '2026-09-14T03:00:00Z',
      deletedAt: '2026-09-14T03:01:00Z',
    });
    expect(await entryById(db, gone)).toBeNull();
    expect(await entryById(db, 'nope')).toBeNull();
  });

  /*
    ATTRIBUTION (WP11). The editor names the caregiver, so the JOIN that resolves the name and
    the flag that says "this has been corrected" are both worth a test: an unnamed write must
    not take the sheet down with it, and an untouched row must not claim an edit.
  */
  it('entryById names who wrote the entry and reports no edit until one happens', async () => {
    const db = await fixture();
    const id = await addActivity(db, { type: 'bath', startAt: '2026-09-14T18:00:00Z' });
    const e = await entryById(db, id);
    expect(e?.by).toEqual({
      byName: 'Dana',
      createdAtMs: ms('2026-09-14T18:00:00Z'),
      editedAtMs: null,
      editedByName: null,
    });
  });

  it('entryById reports the edit once a write stamps updated_by, with the editor name', async () => {
    const db = await fixture();
    const id = await addActivity(db, { type: 'bath', startAt: '2026-09-14T18:00:00Z' });
    await db.run(
      'insert into profiles (id, display_name, created_at, updated_at) values (?, ?, ?, ?)',
      [OTHER_USER, 'Sam', iso('2026-09-01T00:00:00Z'), iso('2026-09-01T00:00:00Z')],
    );
    await db.run('update activities set updated_by = ?, updated_at = ? where id = ?', [
      OTHER_USER,
      iso('2026-09-14T19:30:00Z'),
      id,
    ]);
    expect((await entryById(db, id))?.by).toEqual({
      byName: 'Dana',
      createdAtMs: ms('2026-09-14T18:00:00Z'),
      editedAtMs: ms('2026-09-14T19:30:00Z'),
      editedByName: 'Sam',
    });
  });

  it('entryById survives a caregiver whose profile has not arrived — the edit still shows', async () => {
    const db = await fixture();
    const id = await addActivity(db, {
      type: 'bath',
      startAt: '2026-09-14T18:00:00Z',
      createdBy: OTHER_USER,
    });
    await db.run('update activities set updated_by = ?, updated_at = ? where id = ?', [
      OTHER_USER,
      iso('2026-09-14T19:30:00Z'),
      id,
    ]);
    const by = (await entryById(db, id))?.by;
    // no `profiles` row for OTHER_USER: no name, but the row is still readable and still edited
    expect(by?.byName).toBeNull();
    expect(by?.editedByName).toBeNull();
    expect(by?.editedAtMs).toBe(ms('2026-09-14T19:30:00Z'));
  });
});

describe('the sheet pre-fills and header rows (details.ts)', () => {
  it('lastDiaper is the newest diaper’s kind for the child, with its details', async () => {
    const db = await fixture();
    const older = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T08:00:00Z' });
    const newer = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T11:00:00Z' });
    await db.run('insert into diaper_details (activity_id, kind, rash) values (?, ?, 0)', [
      older,
      'WET',
    ]);
    await db.run(
      'insert into diaper_details (activity_id, kind, color, rash) values (?, ?, ?, 1)',
      [newer, 'BOTH', 'Green'],
    );
    expect(await lastDiaper(db, { householdId: HOUSEHOLD, childId: CHILD_A })).toMatchObject({
      kind: 'BOTH',
      color: 'Green',
      rash: 1,
    });
    expect(await lastDiaper(db, { householdId: HOUSEHOLD, childId: CHILD_B })).toBeUndefined();
  });

  it('pumpSummary counts only what the viewer may see, inside the day', async () => {
    const db = await fixture();
    const mine = await addActivity(db, {
      type: 'pump',
      startAt: '2026-09-14T06:00:00Z',
      childId: null,
    });
    const theirs = await addActivity(db, {
      type: 'pump',
      startAt: '2026-09-14T09:00:00Z',
      childId: null,
      isPrivate: true,
      createdBy: OTHER_USER,
    });
    const yesterday = await addActivity(db, {
      type: 'pump',
      startAt: '2026-09-13T09:00:00Z',
      childId: null,
    });
    for (const [id, ml] of [
      [mine, 120],
      [theirs, 200],
      [yesterday, 90],
    ] as const) {
      await db.run('insert into pump_details (activity_id, total_ml) values (?, ?)', [id, ml]);
    }
    const day = ['2026-09-14T00:00:00.000Z', '2026-09-15T00:00:00.000Z'] as const;
    const asMe = await pumpSummary(db, HOUSEHOLD, USER, day[0], day[1]);
    // the other caregiver's private session is invisible: the newest I can see is my own
    expect(asMe).toEqual({
      last: { startMs: ms('2026-09-14T06:00:00Z'), totalMl: 120 },
      todayMl: 120,
      todaySessions: 1,
    });
    const asThem = await pumpSummary(db, HOUSEHOLD, OTHER_USER, day[0], day[1]);
    expect(asThem.last?.totalMl).toBe(200);
    expect(asThem).toMatchObject({ todayMl: 320, todaySessions: 2 });
  });

  it('lastBath reads hair_washed out of the metadata, and null when it was never recorded', async () => {
    const db = await fixture();
    const first = await addActivity(db, { type: 'bath', startAt: '2026-09-10T18:00:00Z' });
    expect(
      (await lastBath(db, { householdId: HOUSEHOLD, childId: CHILD_A }))?.hairWashed,
    ).toBeNull();
    const second = await addActivity(db, { type: 'bath', startAt: '2026-09-13T18:00:00Z' });
    await db.run('update activities set metadata = ? where id = ?', [
      '{"hair_washed":false}',
      second,
    ]);
    expect(await lastBath(db, { householdId: HOUSEHOLD, childId: CHILD_A })).toEqual({
      start_at: iso('2026-09-13T18:00:00Z'),
      hairWashed: false,
    });
    expect(first).not.toBe(second);
  });
});

/*
  THE DIAPER'S COLOR, READ (the care audit, H6). The sheet has written `diaper_details.color` since
  the first release and no select read it, so neither the log nor the editor could say it.
*/
describe('the diaper color reaches the projection', () => {
  it('reads the chip the parent tapped, and null when none was', async () => {
    const db = await fixture();
    const green = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T08:00:00Z' });
    const plain = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T09:00:00Z' });
    await db.run(
      'insert into diaper_details (activity_id, kind, color, rash) values (?, ?, ?, 0)',
      [green, 'DIRTY', 'Green'],
    );
    await db.run('insert into diaper_details (activity_id, kind, rash) values (?, ?, 0)', [
      plain,
      'WET',
    ]);
    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, FAR_BACK);
    expect(rows.find(r => r.id === green)?.diaperColor).toBe('Green');
    expect(rows.find(r => r.id === plain)?.diaperColor).toBeNull();
    const log = await timelineRows(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      filter: 'all',
      limit: 10,
    });
    expect(log.find(r => r.id === green)?.diaperColor).toBe('Green');
  });
});

describe('entryById carries the row’s metadata, for the bath’s hair', () => {
  it('returns the metadata text as the mirror stores it', async () => {
    const db = await fixture();
    const id = await addActivity(db, { type: 'bath', startAt: '2026-09-14T18:00:00Z' });
    await db.run('update activities set metadata = ? where id = ?', [
      JSON.stringify({ hair_washed: true, source: 'app' }),
      id,
    ]);
    const e = await entryById(db, id);
    expect(JSON.parse(e?.activity.metadata ?? '{}')).toEqual({ hair_washed: true, source: 'app' });
  });
});

/*
  WHILE YOU WERE AWAY READS WHAT MAY HAVE HAPPENED IN THE ABSENCE (the handoff audit, L5): what
  began in it, what ran into it, and what was WRITTEN in it or just before it — not only rows that
  started after the phone went quiet.
*/
describe('catchupRows', () => {
  const FROM = '2026-09-14T22:00:00Z';
  const request = (over: Partial<Parameters<typeof catchupRows>[1]> = {}) => ({
    householdId: HOUSEHOLD,
    childId: CHILD_A,
    fromMs: ms(FROM),
    arrivalGraceMs: 5 * 60_000,
    backdatedWithinMs: 24 * 3_600_000,
    limit: 50,
    ...over,
  });

  it('reads the three kinds of row a start-only read left out, and nothing older', async () => {
    const db = await fixture();
    const began = await addActivity(db, { type: 'bottle', startAt: '2026-09-14T23:00:00Z' });
    // the night's sleep: put down before the parent left, ended while they were away
    const night = await addActivity(db, {
      type: 'sleep',
      startAt: '2026-09-14T20:30:00Z',
      endAt: '2026-09-15T05:40:00Z',
      createdBy: OTHER_USER,
    });
    // typed at 11:30 p.m. with the 9 p.m. time it was given
    const backdated = await addActivity(db, {
      type: 'bottle',
      startAt: '2026-09-14T21:00:00Z',
      createdAt: '2026-09-14T23:30:00Z',
      createdBy: OTHER_USER,
    });
    // saved on the other phone two minutes before this one went quiet
    const justBefore = await addActivity(db, {
      type: 'diaper',
      startAt: '2026-09-14T21:58:00Z',
      createdAt: '2026-09-14T21:58:00Z',
      createdBy: OTHER_USER,
    });
    // an evening entry the parent saw before leaving, and a nap that ended before it
    const seen = await addActivity(db, { type: 'diaper', startAt: '2026-09-14T20:00:00Z' });
    const nap = await addActivity(db, {
      type: 'sleep',
      startAt: '2026-09-14T15:00:00Z',
      endAt: '2026-09-14T16:00:00Z',
    });
    // an import of last month, written in the absence, is not "while you were away"
    const imported = await addActivity(db, {
      type: 'bottle',
      startAt: '2026-08-14T09:00:00Z',
      createdAt: '2026-09-14T23:00:00Z',
      createdBy: OTHER_USER,
    });
    const got = (await catchupRows(db, request())).map(r => r.id);
    expect(got).toEqual(expect.arrayContaining([began, night, backdated, justBefore]));
    expect(got).not.toContain(seen);
    expect(got).not.toContain(nap);
    expect(got).not.toContain(imported);
    // the write time rides along, for the card to decide with
    const entry = (await catchupRows(db, request())).find(r => r.id === backdated);
    expect(entry?.createdAtMs).toBe(ms('2026-09-14T23:30:00Z'));
    expect(entry?.byName).toBeNull();
  });

  it('keeps the child scope and the deleted rows out, like the log', async () => {
    const db = await fixture();
    await addActivity(db, { type: 'bottle', startAt: '2026-09-14T23:00:00Z', childId: CHILD_B });
    await addActivity(db, {
      type: 'bottle',
      startAt: '2026-09-14T23:10:00Z',
      deletedAt: '2026-09-14T23:11:00Z',
    });
    expect(await catchupRows(db, request())).toEqual([]);
    expect(await catchupRows(db, request({ childId: null }))).toHaveLength(1);
  });
});
