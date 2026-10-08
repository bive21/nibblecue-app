/**
 * A BOTTLE OF WATER IS NOT A FEED, AND THE SCHEDULE AGREES (the feeding audit's M7).
 *
 * Water at 10:40 with a feed due at 11:00 used to answer the feed's slot and restart the feeding
 * interval from 10:40 — the slot read done, the next one moved to 1:40, and the phone stayed quiet
 * through the feed the baby actually needed. The entry is still logged and still in the log; it
 * is only never a session the schedule counts, nor a beat of the feeding rhythm.
 */
import { intervalOccurrences, ruleFrom, type Session } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../driver';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../../testing/fixtures';
import { foresightBeats, scheduleSessions } from './schedule';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const DAY = Date.parse('2026-09-14T00:00:00.000Z');
const at = (h: number, m = 0) => new Date(DAY + h * 3_600_000 + m * 60_000).toISOString();

let seq = 0;
async function bottle(db: Db, startAt: string, kind: string): Promise<string> {
  seq += 1;
  const id = `33333333-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  await db.run(
    `insert into activities
       (id, client_op_id, household_id, child_id, type, start_at, end_at, is_private,
        created_by, created_at, updated_at, deleted_at)
     values (?, ?, ?, ?, 'bottle', ?, null, 0, ?, ?, ?, null)`,
    [id, id, HOUSEHOLD, CHILD_A, startAt, USER, startAt, startAt],
  );
  await db.run(`insert into bottle_details (activity_id, kind, consumed_ml) values (?, ?, 90)`, [
    id,
    kind,
  ]);
  return id;
}

async function fixture(): Promise<Db> {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f.db;
}

describe('the schedule does not count a bottle of water as a feed', () => {
  it('water answers no feeding slot and does not restart the interval', async () => {
    const db = await fixture();
    const milk = await bottle(db, at(8), 'EBM');
    await bottle(db, at(10, 40), 'WATER');

    const rows = await scheduleSessions(db, HOUSEHOLD, ['bottle', 'breastfeed'], at(0));
    expect(rows.map(r => r.id)).toEqual([milk]);

    const sessions: Session[] = rows.map(r => ({
      id: r.id,
      type: 'bottle',
      childId: r.child_id,
      startMs: Date.parse(r.start_at),
      endMs: null,
    }));
    const rule = ruleFrom({
      id: 'feed',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      effectiveFromMs: DAY,
    });
    const res = intervalOccurrences(rule, sessions, {
      nowMs: Date.parse(at(10, 45)),
      timeZone: 'UTC',
      dayStartMs: DAY,
    });
    // the next feed is 11:00 — three hours from the 8:00 bottle, not 1:40 from the water
    expect(res.next?.atMs).toBe(Date.parse(at(11)));
  });

  it('water is not a beat of the feeding rhythm either', async () => {
    const db = await fixture();
    await bottle(db, at(8), 'FORMULA');
    await bottle(db, at(9), 'WATER');
    const beats = await foresightBeats(db, HOUSEHOLD, at(0));
    expect(beats.map(b => b.start_at)).toEqual([at(8)]);
  });
});
