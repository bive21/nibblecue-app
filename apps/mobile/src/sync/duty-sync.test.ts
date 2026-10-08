/**
 * WHO'S ON, THROUGH THE QUEUE — the phone's write, the worker's flush and the fake server's answer
 * together (migration 0115; the sync sweep's D1, 2026-09-24).
 *
 * A shift saved with no signal and sent after it had ended came back VALIDATION "shifts refused:
 * ended": the op was marked FAILED and the chip said "Not synced" for a list that had simply run
 * its course. The server now stores what is left of such a list — nothing — and answers applied.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { saveDuty } from '../data/duty';
import { dutyList } from '../db/queries/duty';
import { HOUSEHOLD, USER } from '../testing/fixtures';
import { createSyncHarness, type SyncHarness } from './harness';

const HOUR = 3_600_000;

let shared: SyncHarness | null = null;
afterEach(() => {
  shared?.dispose();
  shared = null;
});

describe('a who’s-on change that waited in the queue', () => {
  it('is sent after the shift has ended, and nothing is left FAILED (D1)', async () => {
    const h = await createSyncHarness({ scenario: 'duty-ended-while-queued' });
    shared = h;
    const now = h.clock.now();
    await saveDuty(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      shifts: [{ userId: USER, fromMs: now, untilMs: now + 3 * HOUR }],
      eligible: new Set([USER]),
    });
    // the phone had no signal until well after the shift was over
    h.clock.advance(4 * HOUR);
    const worker = h.worker();
    worker.start();
    const out = await worker.flush('reconnect');
    expect(out.failed).toBe(0);
    const failed = await h.db.all<{ n: number }>(
      `select count(*) as n from outbox where state = 'FAILED'`,
    );
    expect(failed[0]?.n).toBe(0);
    // and the list that came back is the ended one's record, with no shift left in force
    const list = await dutyList(h.db, HOUSEHOLD);
    expect(list.shifts.filter(s => s.untilMs > h.clock.now())).toEqual([]);
  });
});
