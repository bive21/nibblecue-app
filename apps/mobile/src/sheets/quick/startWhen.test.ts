/**
 * WHEN A TIMER STARTED, AS ARITHMETIC (`startWhen.ts`; the owner, 2026-09-29: *"when start activity,
 * user can easily choose what the start time was"*). Every rule the start row keeps, stated with the
 * clock written down: the chips and their order, an offset placed when it is tapped, the long-run
 * limit that refuses a start too far back, the hold at the end of the last entry of the kind, never
 * a start in the future, and a young timer's chips counted back from where its start was.
 */
import { LONG_RUN_LIMIT_MIN, zonedToUtc } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import {
  correctionAt,
  EARLIER_OPENS_BACK_MS,
  earlierPick,
  heldStart,
  isHeld,
  isOffset,
  isYoungTimer,
  offsetPick,
  shortcutFloor,
  shortcutHeld,
  START_CHOICES,
  START_EARLIER_FLOOR_MIN,
  START_OFFSET_MIN,
  START_SHORTCUTS,
  startAtTap,
  startLimitMs,
  YOUNG_TIMER_MS,
} from './startWhen';

const TZ = 'America/Los_Angeles';
const MIN = 60_000;
const HOUR = 60 * MIN;
/** Tuesday Sep 29 2026 on the household's wall clock (PDT). */
const la = (hour: number, minute = 0, second = 0): number =>
  zonedToUtc(TZ, 2026, 9, 29, hour, minute) + second * 1000;

describe('the chips: few, in minutes, in one order', () => {
  it('are Now, \u22125m, \u221210m, \u221215m and Custom, and the line under the tiles has all but Now', () => {
    expect(START_CHOICES).toEqual(['now', 'm5', 'm15', 'm30', 'earlier']);
    expect(START_SHORTCUTS).toEqual(['m5', 'm15', 'm30', 'earlier']);
    expect(START_OFFSET_MIN).toEqual({ m5: 5, m15: 15, m30: 30 });
    expect(START_CHOICES.filter(isOffset)).toEqual(['m5', 'm15', 'm30']);
  });

  it('opens the wheel forty-five minutes back, the first quarter hour past the chips', () => {
    expect(EARLIER_OPENS_BACK_MS).toBe(45 * MIN);
    expect(EARLIER_OPENS_BACK_MS).toBeGreaterThan(START_OFFSET_MIN.m30 * MIN);
  });
});

describe('an offset is placed when it is tapped', () => {
  it('is the tap on the chip less its minutes, whenever Start is tapped after', () => {
    const tapped = la(21, 41, 20);
    expect(offsetPick('m15', tapped)).toEqual({
      choice: 'm15',
      atMs: la(21, 26, 20),
      pickedAtMs: tapped,
    });
    expect(offsetPick('m5', tapped).atMs).toBe(la(21, 36, 20));
    // the sheet sat open for nine minutes before Start: the start is still what the chip said
    const pick = offsetPick('m15', tapped);
    expect(startAtTap(pick, la(21, 50), null)).toBe(la(21, 26, 20));
  });

  it('crosses midnight as plain minutes: fifteen minutes before 12:03 AM is 11:48 PM the night before', () => {
    const tapped = zonedToUtc(TZ, 2026, 9, 30, 0, 3);
    expect(offsetPick('m15', tapped).atMs).toBe(zonedToUtc(TZ, 2026, 9, 29, 23, 48));
  });
});

describe('"Earlier…": a time off the wheel, or the reason it cannot be a start', () => {
  it('takes a time within the kind’s long-run limit, as the wheel placed it', () => {
    const now = la(21, 41);
    // 9:05 PM off the wheel at 9:41 PM is tonight's (`applyCustom` placed it before this is called)
    const at = la(21, 5);
    expect(earlierPick('sleep', at, now)).toEqual({
      ok: true,
      pick: { choice: 'earlier', atMs: la(21, 5), pickedAtMs: now },
    });
  });

  it('refuses a start further back than the limit: a pump two hours and a minute ago', () => {
    const now = la(21, 41);
    expect(earlierPick('pump', now - 2 * HOUR - MIN, now)).toEqual({
      ok: false,
      reason: 'tooEarly',
      limitMs: 2 * HOUR,
    });
    // exactly the limit is still a start
    expect(earlierPick('pump', now - 2 * HOUR, now).ok).toBe(true);
  });

  it('refuses the wheel turned to a later hour for an activity, and takes it for sleep', () => {
    // 9:45 PM picked at 9:41 PM is last night's 9:45 (`applyCustom`): 23h 56m ago. An activity's
    // earlier-start limit refuses it. Sleep has no earlier-start limit, and the time is not future.
    const now = la(21, 41);
    const at = zonedToUtc(TZ, 2026, 9, 28, 21, 45);
    expect(now - at).toBe(23 * HOUR + 56 * MIN);
    for (const type of ['pump', 'tummy', 'breastfeed'] as const)
      expect(earlierPick(type, at, now).ok, type).toBe(false);
    expect(earlierPick('sleep', at, now).ok).toBe(true);
  });

  it('gives activities at least two hours, and sleep no earlier-start limit', () => {
    expect(START_EARLIER_FLOOR_MIN).toBe(120);
    // the "still going?" windows stay the long-run limits; the picker does not borrow them
    expect(LONG_RUN_LIMIT_MIN.tummy).toBe(60);
    expect(LONG_RUN_LIMIT_MIN.pump).toBe(120);
    expect(LONG_RUN_LIMIT_MIN.breastfeed).toBe(180);
    expect(LONG_RUN_LIMIT_MIN.sleep).toBe(15 * 60);
    expect(startLimitMs('tummy')).toBe(2 * HOUR);
    expect(startLimitMs('pump')).toBe(2 * HOUR);
    expect(startLimitMs('breastfeed')).toBe(LONG_RUN_LIMIT_MIN.breastfeed * MIN);
    expect(startLimitMs('sleep')).toBeNull();
    // tummy time an hour and a half ago used to be past the one-hour cap; two hours allows it
    const now = la(21, 41);
    expect(earlierPick('tummy', now - 90 * MIN, now).ok).toBe(true);
    expect(earlierPick('tummy', now - 2 * HOUR - MIN, now).ok).toBe(false);
  });

  it('is never later than the moment it was picked', () => {
    const now = la(21, 41);
    const verdict = earlierPick('sleep', now + 5 * MIN, now);
    expect(verdict.ok && verdict.pick.atMs).toBe(now);
  });
});

describe('the start a timer is written with, at the tap', () => {
  const tap = la(21, 41);

  it('is the tap itself for "Just now", as a start always was', () => {
    expect(startAtTap(null, tap, null)).toBe(tap);
    // a last entry that ended before the tap changes nothing
    expect(startAtTap(null, tap, la(21, 0))).toBe(tap);
  });

  it('is never in the future: a pick later than the tap is held at the tap', () => {
    expect(startAtTap({ choice: 'earlier', atMs: tap + MIN, pickedAtMs: tap }, tap, null)).toBe(
      tap,
    );
  });

  it('is held at the end of the same baby’s last entry of the kind, never inside it', () => {
    const pick = offsetPick('m15', tap); // 9:26
    // the last sleep ended at 9:35: this one counts from 9:35, and the line says so
    expect(startAtTap(pick, tap, la(21, 35))).toBe(la(21, 35));
    expect(isHeld(pick.atMs, la(21, 35))).toBe(true);
    // it ended at 9:20: nothing to hold
    expect(startAtTap(pick, tap, la(21, 20))).toBe(la(21, 26));
    expect(isHeld(pick.atMs, la(21, 20))).toBe(false);
    // it ended exactly where this one begins: they meet, nothing is held
    expect(isHeld(pick.atMs, pick.atMs)).toBe(false);
  });

  it('is held no later than the tap, whatever another phone’s clock wrote as an end', () => {
    expect(heldStart(la(21, 31), tap + 3 * MIN, tap)).toBe(tap);
    expect(heldStart(la(21, 31), null, tap)).toBe(la(21, 31));
  });
});

/**
 * THE OWNER'S REPORT, 2026-10-08: "the button to start pump −30m does not work". The last pump
 * ended twenty minutes before the tap, so −30m was held at that end (`startAtTap`) and the one-tap
 * chip wrote a start a moment ago in silence. The chip that would be held is faded before the tap
 * (`StartShortcuts`); −5m and −15m, outside the last session, still start where they say.
 */
describe('a one-tap chip that would be held is known before the tap', () => {
  const tap = la(21, 41);
  const lastPumpEnd = la(21, 21);

  it('reproduces the report: −30m is held at the last end, a start a moment ago rather than 9:11', () => {
    const pick = offsetPick('m30', tap);
    expect(pick.atMs).toBe(la(21, 11));
    expect(startAtTap(pick, tap, lastPumpEnd)).toBe(lastPumpEnd);
    // the two that fall after the last end start where they say
    expect(startAtTap(offsetPick('m15', tap), tap, lastPumpEnd)).toBe(la(21, 26));
    expect(startAtTap(offsetPick('m5', tap), tap, lastPumpEnd)).toBe(la(21, 36));
  });

  it('fades exactly the chips the hold would move', () => {
    const floor = shortcutFloor([lastPumpEnd]);
    expect(floor).toBe(lastPumpEnd);
    expect(shortcutHeld('m30', floor, tap)).toBe(true);
    expect(shortcutHeld('m15', floor, tap)).toBe(false);
    expect(shortcutHeld('m5', floor, tap)).toBe(false);
    // the chip and the write agree for every offset, at every distance from the last end
    for (const back of [0, 4, 5, 6, 14, 15, 16, 29, 30, 31, 90])
      for (const c of ['m5', 'm15', 'm30'] as const) {
        const end = tap - back * MIN;
        const held = startAtTap(offsetPick(c, tap), tap, end) !== offsetPick(c, tap).atMs;
        expect(shortcutHeld(c, shortcutFloor([end]), tap), `${c}, ended ${back}m ago`).toBe(held);
      }
  });

  it('fades nothing with no last entry, or when one baby of several has none', () => {
    expect(shortcutFloor([])).toBeNull();
    expect(shortcutFloor([null])).toBeNull();
    expect(shortcutFloor([lastPumpEnd, null])).toBeNull();
    expect(shortcutHeld('m30', null, tap)).toBe(false);
  });

  it('with several babies, fades a chip only when every baby’s start would be held', () => {
    const floor = shortcutFloor([la(21, 21), la(21, 35)]);
    expect(floor).toBe(la(21, 21));
    expect(shortcutHeld('m30', floor, tap)).toBe(true);
    expect(shortcutHeld('m15', floor, tap)).toBe(false);
  });
});

describe('a timer started a moment ago, moved from its own sheet', () => {
  it('is young for its first five minutes, the smallest offset', () => {
    const started = la(21, 41);
    expect(YOUNG_TIMER_MS).toBe(5 * MIN);
    expect(isYoungTimer(started, started)).toBe(true);
    expect(isYoungTimer(started, started + 4 * MIN + 59_000)).toBe(true);
    expect(isYoungTimer(started, started + 5 * MIN)).toBe(false);
  });

  it('counts each chip back from where the start was, so a chip tapped twice moves it once', () => {
    const anchor = la(21, 41, 7);
    expect(correctionAt('m15', anchor)).toBe(la(21, 26, 7));
    expect(correctionAt('m15', anchor)).toBe(correctionAt('m15', anchor));
    expect(correctionAt('m5', anchor)).toBe(la(21, 36, 7));
    // and "Just now" puts it back where it was
    expect(correctionAt('now', anchor)).toBe(anchor);
  });
});
