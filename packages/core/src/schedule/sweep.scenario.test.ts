/**
 * THE ENGINE HALF OF THE PRE-RELEASE SWEEP (2026-09-24): two slots the schedule described wrongly,
 * pinned here in core so the engine's own suite holds them. The app half — the same days driven
 * through the phone's writes and reads — is `apps/mobile/src/scenarios/schedule.scenario.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { scheduleDay } from './today';
import { intervalOccurrences } from './interval';
import { ruleFrom, skipKey, type EngineContext, type Session } from './types';
import { zonedToUtc } from '../today/day';

const TZ = 'America/Los_Angeles';
/** Thursday, September 24 2026, at a wall-clock time in the household's zone. */
const thu = (hh: number, mm = 0, day = 24): number => zonedToUtc(TZ, 2026, 9, day, hh, mm);
const on = (nowMs: number, skipped: string[] = []): EngineContext => ({
  nowMs,
  timeZone: TZ,
  dayStartMs: thu(0, 0),
  skipped: new Set(skipped),
});
const feed = (id: string, startMs: number): Session => ({
  id,
  type: 'bottle',
  childId: null,
  startMs,
  endMs: null,
});

describe('a feed logged well before its slot', () => {
  it('moves the next slot from where the OLD grid had it, so the caption can say "45 min early"', () => {
    const every3h = ruleFrom({
      id: 'feed',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
    });
    // 1:05 answered the 1:10 slot; the next was 4:05, and the feed came at 3:20 — 45 minutes early
    const res = intervalOccurrences(
      every3h,
      [feed('wed', thu(22, 10, 23)), feed('a', thu(1, 5)), feed('b', thu(3, 20))],
      on(thu(3, 25)),
    );
    expect(res.next?.atMs).toBe(thu(6, 20));
    // where the 6:20 feed was before 3:20 moved the chain: 7:05, three hours after 4:05 — not
    // 4:05 itself, which made the Schedule tab say "last feed ran 135 min late"
    expect(res.next?.movedFromMs).toBe(thu(7, 5));
    expect((res.next!.atMs - res.next!.movedFromMs!) / 60_000).toBe(-45);
  });
});

describe('a bath skipped for tonight', () => {
  const bath = ruleFrom({
    id: 'bath',
    activity: 'bath',
    ruleType: 'CADENCE',
    atLocalTime: '18:30',
    everyDays: 2,
  });
  const tuesday: Session = {
    id: 'tue',
    type: 'bath',
    childId: null,
    startMs: thu(18, 40, 22),
    endMs: null,
  };

  it('is SKIPPED — not left to go due and ring', () => {
    const day = scheduleDay([bath], [tuesday], on(thu(17, 5), [skipKey('bath', thu(18, 30))]));
    expect(day.occurrences.map(o => o.status)).toEqual(['SKIPPED']);
  });

  it('is due as ever when nobody skipped it', () => {
    const day = scheduleDay([bath], [tuesday], on(thu(18, 45)));
    expect(day.occurrences.map(o => o.status)).toEqual(['DUE']);
  });
});
