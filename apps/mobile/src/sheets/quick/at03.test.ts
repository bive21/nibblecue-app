/**
 * Acceptance test 3 (docs/TESTING.md §6): a sleep timer survives the app being killed. The
 * timer is a timestamp (CLAUDE.md rule 12): nothing about it lives in memory, so after a kill
 * the only state is the persisted `running_timers` row, and elapsed is
 * `now − started_at − paused_ms` from it — 90 minutes later, 90 minutes exactly. Stopping
 * writes a sleep whose `end_at − start_at` is those 90 minutes.
 *
 * The kill is simulated by holding NO reference across the gap: the second half of the test
 * reads the row back from the database and nothing else. The real kill, lock and relaunch is
 * e2e/03-timer-after-kill.yaml on the owner's device.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { startTimer, stopTimer } from '../../data/timers';
import { timersNow } from '../../db/queries/today';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../../testing/fixtures';
import { elapsedMs } from './timerMath';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const MIN = 60_000;
const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };

describe('@AT-03 a sleep timer across an app kill', () => {
  it('reads 90 min from the persisted row after 90 min, and stopping writes a 90 min sleep', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    const { db, clock } = f;
    const startedAt = clock.iso();
    const started = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt,
      meta: { kind: 'NAP' },
    });
    expect(started.committed).toBe(true);

    // ── the app is killed here; 90 minutes pass ──────────────────────────────────────────
    clock.advance(90 * MIN);

    // ── relaunch: the row is all there is ─────────────────────────────────────────────────
    const [timer] = await timersNow(db, HOUSEHOLD, CHILD_A);
    expect(timer).toBeDefined();
    expect(timer?.type).toBe('sleep');
    expect(elapsedMs(timer!, clock.now())).toBe(90 * MIN);

    const stopped = await stopTimer(db, clock, {
      ...ctx,
      timerId: timer!.id,
      childId: CHILD_A,
      type: 'sleep',
      startAt: new Date(timer!.startedAtMs).toISOString(),
      endAt: clock.iso(),
      detail: { kind: 'NAP', wake_count: null, location: null },
    });
    expect(stopped.committed).toBe(true);
    const row = await db.get<{ start_at: string; end_at: string }>(
      "select start_at, end_at from activities where type = 'sleep' and deleted_at is null",
      [],
    );
    expect(Date.parse(row?.end_at ?? '') - Date.parse(row?.start_at ?? '')).toBe(90 * MIN);
    expect(await timersNow(db, HOUSEHOLD, CHILD_A)).toHaveLength(0);
  });
});
