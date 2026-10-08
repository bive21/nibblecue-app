/**
 * The long-run ask (`longRun.ts`): when the app may ask whether a timer is still running, and
 * the two ways that question can go wrong — asking about a session that is plainly still going,
 * and asking again the moment a parent has said it is.
 */
import { describe, expect, it } from 'vitest';
import { LONG_RUN_LIMIT_MIN, longRunNextChangeMs, longRunning, validEnd } from './longRun';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 20, 9, 0, 0);

describe('when the app asks', () => {
  it('says nothing until the timer passes its own limit', () => {
    for (const [type, limit] of Object.entries(LONG_RUN_LIMIT_MIN)) {
      const at = (min: number) =>
        longRunning({
          type: type as keyof typeof LONG_RUN_LIMIT_MIN,
          startedAtMs: T0,
          nowMs: T0 + min * MIN,
        });
      expect(at(limit - 1), `${type} inside`).toBeNull();
      expect(at(limit), `${type} at`)?.toMatchObject({ limitMin: limit });
      expect(at(limit + 30)?.elapsedMin, `${type} past`).toBe(limit + 30);
    }
  });

  /** Paused minutes are not running minutes: a breastfeed parked for an hour has not run one. */
  it('excludes banked paused time, the way every elapsed display does', () => {
    const limit = LONG_RUN_LIMIT_MIN.breastfeed;
    const nowMs = T0 + (limit + 20) * MIN;
    expect(longRunning({ type: 'breastfeed', startedAtMs: T0, nowMs })).not.toBeNull();
    expect(
      longRunning({ type: 'breastfeed', startedAtMs: T0, pausedMs: 30 * MIN, nowMs }),
    ).toBeNull();
  });

  /**
   * A START IN THE FUTURE IS A BUG, NOT A SESSION. A corrected start, a device whose clock
   * moved, a row that arrived from another phone mid-sync: none of them is a timer that has
   * been running for a negative time, and none of them is worth a prompt.
   */
  it('stays quiet when the start is ahead of now', () => {
    expect(longRunning({ type: 'pump', startedAtMs: T0 + 5 * MIN, nowMs: T0 })).toBeNull();
    expect(longRunning({ type: 'pump', startedAtMs: T0, nowMs: T0 })).toBeNull();
  });
});

describe('"still going" is taken at its word', () => {
  const limit = LONG_RUN_LIMIT_MIN.pump;

  it('does not ask again until a whole limit has passed since the answer', () => {
    const snoozedAtMs = T0 + limit * MIN;
    const ask = (min: number) =>
      longRunning({ type: 'pump', startedAtMs: T0, nowMs: T0 + min * MIN, snoozedAtMs });
    expect(ask(limit + 1)).toBeNull();
    expect(ask(limit + limit - 1)).toBeNull();
    // and then once more, because a pump running for four hours is worth one more question
    expect(ask(limit * 2)).not.toBeNull();
  });
});

describe('the end time the parent picks', () => {
  it('is refused before the start and after now', () => {
    const nowMs = T0 + 3 * 60 * MIN;
    expect(validEnd(T0, T0 - MIN, nowMs)).toBe(false);
    expect(validEnd(T0, T0, nowMs)).toBe(false);
    expect(validEnd(T0, nowMs + MIN, nowMs)).toBe(false);
    expect(validEnd(T0, T0 + 25 * MIN, nowMs)).toBe(true);
    expect(validEnd(T0, nowMs, nowMs)).toBe(true);
  });

  /**
   * THE PICKER OPENS AT THE MOMENT THE SESSION STOPPED BEING PLAUSIBLE, so every correction
   * from there moves backward — which is the direction a forgotten timer is wrong in. It is
   * never later than now, or the wheel would open on a value the app itself would refuse.
   */
  it('is suggested at the limit past the start, paused time included', () => {
    const nowMs = T0 + 5 * 60 * MIN;
    const plain = longRunning({ type: 'pump', startedAtMs: T0, nowMs });
    expect(plain?.suggestedEndMs).toBe(T0 + LONG_RUN_LIMIT_MIN.pump * MIN);
    expect(plain?.suggestedEndMs ?? 0).toBeLessThanOrEqual(nowMs);
    const paused = longRunning({ type: 'pump', startedAtMs: T0, pausedMs: 10 * MIN, nowMs });
    expect(paused?.suggestedEndMs).toBe(T0 + (10 + LONG_RUN_LIMIT_MIN.pump) * MIN);
  });
});

/**
 * THE LIMITS ARE A PRODUCT DECISION, and two of them are the owner's own words (2026-09-20:
 * *"pumping for more than 2 hours continuously is not correct. Same with tummy time more than
 * hours straight"*). They are pinned here so that changing one is a deliberate edit to a test
 * rather than a number somebody nudges.
 */
describe('the limits themselves', () => {
  it('are the owner’s two, and two that are generous on purpose', () => {
    expect(LONG_RUN_LIMIT_MIN.pump).toBe(120);
    expect(LONG_RUN_LIMIT_MIN.tummy).toBe(60);
    // a cluster-feeding evening is real, and a night's sleep is legitimately twelve hours
    expect(LONG_RUN_LIMIT_MIN.breastfeed).toBeGreaterThanOrEqual(180);
    expect(LONG_RUN_LIMIT_MIN.sleep).toBeGreaterThanOrEqual(14 * 60);
  });
});

/**
 * THE CARD WAKES WHEN ITS ANSWER CAN CHANGE, AND AT NO OTHER TIME (`longRunNextChangeMs`;
 * docs/DESIGN_SYSTEM.md §7.1). It used to re-read the clock every second, beside the timer card's
 * own tick, to answer a question that moves at an hour boundary at the soonest. These hold the
 * instant it is given to exactly that: the same answer at every instant before it, a different one
 * at it — so waking there draws every change the one-second tick drew, at the second it drew it.
 */
describe('when the ask can change', () => {
  const TYPES = Object.keys(LONG_RUN_LIMIT_MIN) as (keyof typeof LONG_RUN_LIMIT_MIN)[];
  /** mulberry32: arbitrary and the same on every run */
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('is later than now, the answer holds until it, and changes at it', () => {
    const r = rng(0x10a9);
    for (let i = 0; i < 2000; i++) {
      const type = TYPES[Math.floor(r() * TYPES.length)] ?? 'pump';
      const startedAtMs = T0 + Math.floor((r() - 0.1) * 60) * MIN + Math.floor(r() * 60_000);
      const pausedMs = r() < 0.5 ? 0 : Math.floor(r() * 90 * MIN);
      const snoozedAtMs = r() < 0.5 ? null : T0 + Math.floor(r() * 20 * 60) * MIN;
      const nowMs = T0 + Math.floor(r() * 20 * 60 * MIN);
      const input = { type, startedAtMs, pausedMs, snoozedAtMs };
      const next = longRunNextChangeMs({ ...input, nowMs });
      expect(next, JSON.stringify(input)).toBeGreaterThan(nowMs);
      const now = longRunning({ ...input, nowMs });
      for (const at of [nowMs + 1, Math.floor((nowMs + next) / 2), next - 1]) {
        if (at < nowMs || at >= next) continue;
        expect(longRunning({ ...input, nowMs: at }), `${JSON.stringify(input)} at ${at}`).toEqual(
          now,
        );
      }
      expect(longRunning({ ...input, nowMs: next })).not.toEqual(
        longRunning({ ...input, nowMs: next - 1 }),
      );
    }
  });

  it('wakes a pump timer run for three hours 60 times, where the one-second tick woke it 10,800', () => {
    let wakes = 0;
    let at = T0;
    while (at < T0 + 180 * MIN) {
      at = longRunNextChangeMs({ type: 'pump', startedAtMs: T0, nowMs: at });
      if (at < T0 + 180 * MIN) wakes += 1;
    }
    // once at two hours, when "Still pumping?" appears, then once a minute for its "Running 2h 05m"
    expect(wakes).toBe(1 + 59);
    expect(longRunNextChangeMs({ type: 'pump', startedAtMs: T0, nowMs: T0 })).toBe(
      T0 + LONG_RUN_LIMIT_MIN.pump * MIN,
    );
    // and a "still going" puts the next wake a whole limit past the answer, not a second away
    const snoozedAtMs = T0 + 130 * MIN;
    expect(
      longRunNextChangeMs({ type: 'pump', startedAtMs: T0, nowMs: snoozedAtMs, snoozedAtMs }),
    ).toBe(snoozedAtMs + LONG_RUN_LIMIT_MIN.pump * MIN);
  });
});
