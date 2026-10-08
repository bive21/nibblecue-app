/**
 * WHEN A RUNNING TIMER REALLY ENDED, THE ONE RULE (`timerEnd.ts`; the owner, 2026-09-29: *"what
 * happens if it should already be ended x minutes ago? … this is the same for all timer"*). The
 * long-run card's "It ended" and the running sheet's End time both call `endTimerAt`, so what is
 * held here holds for both: which ends are refused and with which sentence, what is felt, what a
 * pump does instead of stopping, and what every other timer writes.
 */
import { setHapticsDriver, type HapticKind } from '@nibblecue/ui/haptics';
import { afterEach, describe, expect, it } from 'vitest';
import type { TimerNow } from '../../db/queries/today';
import { LONG_RUN } from './copy';
import { clearStopped, stoppedAt } from './stopped';
import { bankedSides } from './timerMath';
import { endRefusal, endTimerAt, feedEndFloor, type EndAtDeps } from './timerEnd';

const MIN = 60_000;
const NOW = Date.UTC(2026, 8, 29, 4, 41); // 9:41 PM in Los Angeles; the rule reads no zone

function timer(type: TimerNow['type'], over: Partial<TimerNow> = {}): TimerNow {
  return {
    id: `t-${type}`,
    type,
    childId: type === 'pump' ? null : 'child-a',
    startedAtMs: NOW - 60 * MIN,
    pausedMs: 0,
    activeSide: null,
    sideStartedAtMs: null,
    leftSeconds: 0,
    rightSeconds: 0,
    startedBy: 'user-1',
    meta: {},
    ...over,
  };
}

/** What a caller sees: every stop asked for, every sentence said, every close and every opening. */
function harness(committed = true) {
  const seen = {
    stops: [] as [string, number][],
    said: [] as string[],
    opened: 0,
    ended: 0,
    felt: [] as HapticKind[],
  };
  setHapticsDriver(kind => seen.felt.push(kind));
  const deps: EndAtDeps = {
    stop: (t, endMs) => {
      seen.stops.push([t.id, endMs]);
      return Promise.resolve({ committed });
    },
    say: s => seen.said.push(s),
    openOutput: () => (seen.opened += 1),
    onEnded: () => (seen.ended += 1),
  };
  return { seen, deps };
}

afterEach(() => {
  setHapticsDriver(null);
  clearStopped('t-pump');
});

describe('an end the timer cannot have had is refused, felt and said, and nothing is written', () => {
  it.each(['sleep', 'tummy', 'breastfeed', 'pump'] as const)(
    '%s: before the start, inside its first minute, and later than now',
    async type => {
      const t = timer(type);
      for (const [endMs, sentence] of [
        [t.startedAtMs - 5 * MIN, LONG_RUN.endTooEarly],
        // a session of no length is a discard, and this is not the way to make one
        [t.startedAtMs + 30_000, LONG_RUN.endTooEarly],
        [NOW + MIN, LONG_RUN.endInFuture],
      ] as const) {
        const { seen, deps } = harness();
        expect(await endTimerAt(t, endMs, NOW, deps)).toBe('refused');
        expect(seen.said).toEqual([sentence]);
        expect(seen.felt).toEqual(['warning']);
        expect(seen.stops).toEqual([]);
        expect(seen.opened + seen.ended).toBe(0);
        expect(stoppedAt('t-pump')).toBeNull();
      }
    },
  );

  it('says "later than now" only for a time later than now (it was also said inside the first minute)', () => {
    const t = timer('sleep');
    expect(endRefusal(t, t.startedAtMs + 59_999, NOW)).toBe('tooEarly');
    expect(endRefusal(t, t.startedAtMs + MIN, NOW)).toBeNull();
    expect(endRefusal(t, NOW, NOW)).toBeNull();
    expect(endRefusal(t, NOW + 1, NOW)).toBe('inFuture');
  });
});

/**
 * A FEED'S SIDES COUNT UP TO THE END (`bankedSides`), so an end they were still counting at would
 * save more side minutes than the feed lasted. Refused in words, with the same feel.
 */
describe('a feed is never ended where its sides were still counting', () => {
  // a 60-minute-old feed: 20 minutes on the left, then 15 on the right, and the left again from
  // 25 minutes ago, still timing
  const timing = timer('breastfeed', {
    activeSide: 'LEFT',
    sideStartedAtMs: NOW - 25 * MIN,
    leftSeconds: 20 * 60,
    rightSeconds: 15 * 60,
  });

  it('while a side is timing: not before that side began', async () => {
    expect(feedEndFloor(timing)).toBe(NOW - 25 * MIN);
    for (const endMs of [NOW - 40 * MIN, NOW - 26 * MIN, NOW - 25 * MIN - 1]) {
      const { seen, deps } = harness();
      expect(await endTimerAt(timing, endMs, NOW, deps)).toBe('refused');
      expect(seen.said).toEqual([LONG_RUN.endStillCounting]);
      expect(seen.felt).toEqual(['warning']);
      expect(seen.stops).toEqual([]);
      expect(seen.ended).toBe(0);
    }
    // from the moment it began, the sides saved add up to no more than the feed lasted
    for (const endMs of [NOW - 25 * MIN, NOW - 10 * MIN, NOW]) {
      const sides = bankedSides(timing, endMs);
      expect((sides.left + sides.right) * 1000).toBeLessThanOrEqual(endMs - timing.startedAtMs);
      expect(endRefusal(timing, endMs, NOW)).toBeNull();
    }
    // before it, they would not have: the reason for the rule
    const early = bankedSides(timing, NOW - 40 * MIN);
    expect((early.left + early.right) * 1000).toBeGreaterThan(NOW - 40 * MIN - timing.startedAtMs);
  });

  it('while paused: not sooner after the start than its sides add up to', async () => {
    // paused on the right (`side_started_at` null, the side kept for Resume): 35 minutes banked
    const paused = { ...timing, activeSide: 'RIGHT' as const, sideStartedAtMs: null };
    expect(feedEndFloor(paused)).toBe(paused.startedAtMs + 35 * MIN);
    const { seen, deps } = harness();
    expect(await endTimerAt(paused, paused.startedAtMs + 30 * MIN, NOW, deps)).toBe('refused');
    expect(seen.said).toEqual([LONG_RUN.endStillCounting]);
    expect(seen.felt).toEqual(['warning']);
    expect(seen.stops).toEqual([]);
    const ok = harness();
    expect(await endTimerAt(paused, paused.startedAtMs + 35 * MIN, NOW, ok.deps)).toBe('saved');
    expect(ok.seen.stops).toEqual([[paused.id, paused.startedAtMs + 35 * MIN]]);
  });

  it('asks the other refusals first, and asks nothing of a timer that is not a feed', () => {
    expect(endRefusal(timing, timing.startedAtMs - MIN, NOW)).toBe('tooEarly');
    expect(endRefusal(timing, NOW + MIN, NOW)).toBe('inFuture');
    for (const type of ['sleep', 'tummy', 'pump'] as const)
      expect(feedEndFloor({ ...timing, type })).toBeNull();
  });

  it('says it in one short sentence about the timer, never the baby', () => {
    expect(LONG_RUN.endStillCounting).toBe(
      'The feed timer was still counting then. Pick a later time.',
    );
    expect(LONG_RUN.endStillCounting).not.toMatch(/[‐‑‒–—―]|baby|should|wrong|too /i);
  });
});

describe('a pump is only stopped there: its output form saves it', () => {
  it('marks the stop at the picked instant, never writes an entry, and opens the form only when asked', async () => {
    const t = timer('pump');
    const { seen, deps } = harness();
    expect(await endTimerAt(t, NOW - 10 * MIN, NOW, deps)).toBe('stopped');
    expect(stoppedAt(t.id)).toBe(NOW - 10 * MIN);
    expect(seen.stops).toEqual([]);
    expect(seen.ended).toBe(0);
    expect(seen.opened).toBe(1);
    // the stop is felt as a stop, where every pump stop is (`markStopped`)
    expect(seen.felt).toEqual(['thud']);

    // inside the pump's own sheet the form is already there: nothing opens, nothing closes
    const inSheet = harness();
    const { stop, say, onEnded } = inSheet.deps;
    const sheetDeps: EndAtDeps = { stop, say, ...(onEnded ? { onEnded } : {}) };
    expect(await endTimerAt(t, NOW - 5 * MIN, NOW, sheetDeps)).toBe('stopped');
    expect(inSheet.seen.opened + inSheet.seen.ended).toBe(0);
  });

  it('moves a stop it already has, within the same limits', async () => {
    const t = timer('pump');
    await endTimerAt(t, NOW - 10 * MIN, NOW, harness().deps);
    await endTimerAt(t, NOW - 20 * MIN, NOW, harness().deps);
    expect(stoppedAt(t.id)).toBe(NOW - 20 * MIN);
    const refused = harness();
    expect(await endTimerAt(t, t.startedAtMs - MIN, NOW, refused.deps)).toBe('refused');
    expect(stoppedAt(t.id)).toBe(NOW - 20 * MIN);
  });
});

describe('every other timer is the ordinary stop, at the picked instant', () => {
  it.each(['sleep', 'tummy', 'breastfeed'] as const)(
    '%s: stops at that instant, then lets the sheet close',
    async type => {
      const t = timer(type);
      const { seen, deps } = harness();
      expect(await endTimerAt(t, NOW - 20 * MIN, NOW, deps)).toBe('saved');
      expect(seen.stops).toEqual([[t.id, NOW - 20 * MIN]]);
      expect(seen.ended).toBe(1);
      // the saved toast and its feel are the stop's own (`announce`), never a second one here
      expect(seen.said).toEqual([]);
      expect(seen.felt).toEqual([]);
      expect(seen.opened).toBe(0);
      expect(stoppedAt(t.id)).toBeNull();
    },
  );

  it('keeps the sheet open when the stop wrote nothing (a double tap, a timer already gone)', async () => {
    const { seen, deps } = harness(false);
    expect(await endTimerAt(timer('sleep'), NOW - 20 * MIN, NOW, deps)).toBe('unsaved');
    expect(seen.ended).toBe(0);
  });
});
