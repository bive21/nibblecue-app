/**
 * The arithmetic the timer sheets do, pure (docs/plans/WP5.md WP5.4; PRODUCT_SPEC.md §6.2,
 * §6.3, §6.5, §6.10). A timer is a row of timestamps (CLAUDE.md rule 12); everything a sheet
 * shows or saves is computed from them here, where a test can state the time instead of
 * waiting for it.
 */
import { DEFAULT_DAY_WINDOW, sleepKindAt, windowTimeOr, type DayWindow } from '@nibblecue/core';
import type { TimerNow } from '../../db/queries/today';

const SEC = 1000;
export const MIN = 60 * SEC;

/** The seconds each side has, with the open side's run included, at `nowMs`. */
export function bankedSides(
  t: Pick<TimerNow, 'activeSide' | 'sideStartedAtMs' | 'leftSeconds' | 'rightSeconds'>,
  nowMs: number,
): { left: number; right: number } {
  const open =
    t.activeSide !== null && t.sideStartedAtMs !== null
      ? Math.max(0, Math.floor((nowMs - t.sideStartedAtMs) / SEC))
      : 0;
  return {
    left: t.leftSeconds + (t.activeSide === 'LEFT' ? open : 0),
    right: t.rightSeconds + (t.activeSide === 'RIGHT' ? open : 0),
  };
}

/** Elapsed for a plain timer: now − started − paused, never negative. */
export const elapsedMs = (t: Pick<TimerNow, 'startedAtMs' | 'pausedMs'>, nowMs: number) =>
  Math.max(0, nowMs - t.startedAtMs - t.pausedMs);

/**
 * A manual duration entry: the time row is when it ENDED (a sleep's wake time, §6.5), and
 * the start is that many minutes before. Stored as `start_at = end − length`, `end_at = end`.
 */
export function manualBounds(endMs: number, minutes: number): { startMs: number; endMs: number } {
  const len = Math.max(0, Math.round(minutes)) * MIN;
  return { startMs: endMs - len, endMs };
}

/**
 * WHERE A FINISHED FORM'S "ENDED" ROW STANDS WHILE IT IS ANCHORED TO A SLOT (the owner, 2026-09-25:
 * "pre-fill the slot's time when tapping a past slot"; `slotPrefillAt`, `finishedEnd`).
 *
 * The schedule matches an entry to a slot by its START, and these forms write `start = end −
 * length` (`manualBounds`, `pumpSession`). So the row — the wake-up time, the end of a feed, of
 * tummy time or of a pump session — stands one length AFTER the slot's time, and the entry begins
 * at the slot's own minute, inside its window.
 *
 * NEVER AFTER `nowMs`, the sheet's opening. A slot skipped a minute ago, or the last one before
 * the household began, is not yet a whole length behind, and a row may not say a thing ended in
 * the future — the pump's rule (`pumpSession`). The length is kept and the start moves back, as
 * the pump's does, and the line under the stepper shows both ends before anything is saved.
 */
export function slotEndFor(slotAtMs: number, minutes: number, nowMs: number): number {
  return Math.min(slotAtMs + Math.max(0, Math.round(minutes)) * MIN, nowMs);
}

/**
 * THE END A FINISHED FORM SHOWS AND WRITES — sleep, a breastfeed, tummy time, whose row is when the
 * thing ENDED — and on a sheet opened on a slot that is over, ANCHORED TO THE SLOT UNTIL THE ROW IS
 * TOUCHED (2026-09-25, on the pre-fill: "keep the START pinned to the slot while the parent edits
 * lengths, rather than the end").
 *
 * `anchorMs` is the slot's time for as long as the parent has not touched the row. The entry then
 * STARTS there and the end follows every length typed — sleep's "Slept for", tummy time's
 * minutes, a breastfeed's two sides added up — so 15 and 15 on the 12:00 slot is 12:00 → 12:30.
 * Pinning the END instead wrote 11:30 → 12:00: the schedule matches by the start, an interval takes
 * a start only its match window (25 minutes) early, and that feed became an early one that moved
 * the rest of the day. Past the sheet's opening the end stops there, the length is kept and the
 * start moves back (`slotEndFor`).
 *
 * Once the parent touches the row (`touchRow`) the anchor is null and the end is the row's own
 * answer, `rowAtMs` — Now, 15 or 30 minutes ago, Custom — whatever the length does next, exactly as
 * a form opened from anywhere else has always behaved.
 */
export function finishedEnd(
  rowAtMs: number,
  anchorMs: number | null,
  minutes: number,
  openedAtMs: number,
): number {
  return anchorMs === null ? rowAtMs : slotEndFor(anchorMs, minutes, openedAtMs);
}

/** What the time row holds: the Custom instant, and the slot it is anchored to until touched. */
export interface EndRowHold {
  customMs: number | undefined;
  anchorMs: number | null;
}

/**
 * THE PARENT TOUCHED THE ROW — Now, 15 or 30 minutes ago, or Custom — and from here on the end is
 * theirs. The anchor goes, and Custom holds the end the row was showing at that moment
 * (`shownEndMs`), so the picker opens on it and a picker dismissed leaves it where it was. A row
 * that was never anchored keeps what it had.
 */
export function touchRow(row: EndRowHold, shownEndMs: number): EndRowHold {
  return { customMs: row.anchorMs === null ? row.customMs : shownEndMs, anchorMs: null };
}

/** The whole-minute duration a stopped timer records as `quantity` in `min`. */
export const minutesOf = (ms: number): number => Math.max(0, Math.round(ms / MIN));

/** Which side a feed started on, for `first_side`: the side that opened first, else null. */
export function firstSide(t: Pick<TimerNow, 'meta' | 'activeSide'>): 'LEFT' | 'RIGHT' | null {
  const m = t.meta['first_side'];
  if (m === 'LEFT' || m === 'RIGHT') return m;
  return t.activeSide;
}

/**
 * THE WORD A SLEEP TIMER IS SAVED WITH, decided when it STOPS, from its start as it is NOW and the
 * household's own wake and bed times (the audit of 2026-09-24, care C2 and C3).
 *
 * `meta.kind` is what the sleep sheet worked out when the timer started, and it went stale two
 * ways. A CueCoin starts a sleep with no `meta` at all, so every coin-started sleep — the 8:30 PM
 * tap on the crib rail — was saved as a nap by the old reader's default (`sleepKindOf`, which went
 * on 2026-09-27 with nothing left to call it). And "Correct the start
 * time" moves `started_at` without touching `meta`, so a sleep started at 7:45 PM and corrected to
 * 5:00 PM kept the night it no longer was. Nothing asks the parent for the word (the owner,
 * 2026-09-17: one sleep button), so there is no choice of theirs to keep: the start the entry is
 * written with is the one fact it may be filed by, the same rule the manual path uses
 * (`sleepKindAt` in core — the START decides, so a 9 p.m. sleep ending at 6 a.m. is a night).
 */
export function timerSleepKind(
  t: Pick<TimerNow, 'startedAtMs'>,
  timeZone: string,
  window: DayWindow = DEFAULT_DAY_WINDOW,
  endMs?: number | null,
): 'NAP' | 'NIGHT' {
  // and the stop: a sleep still asleep past bedtime is the night (the owner, 2026-10-07)
  return sleepKindAt(timeZone, t.startedAtMs, window, endMs);
}

/**
 * The household's stored window row as the pair `sleepKindAt` reads — the same fallbacks
 * `useDayWindow` applies (no row is the default pair; a field it cannot read is that field's
 * default), for a stop that reads the row itself rather than waiting on a hook's first load.
 */
export function windowOfRow(row: { wake_time: unknown; bed_time: unknown } | null): DayWindow {
  if (row === null) return DEFAULT_DAY_WINDOW;
  return {
    wake: windowTimeOr(row.wake_time, DEFAULT_DAY_WINDOW.wake),
    bed: windowTimeOr(row.bed_time, DEFAULT_DAY_WINDOW.bed),
  };
}

type FeedTimer = Pick<
  TimerNow,
  'activeSide' | 'sideStartedAtMs' | 'leftSeconds' | 'rightSeconds' | 'meta'
>;

/**
 * A BREASTFEED IS PAUSED WHEN NO SIDE IS TIMING — `side_started_at` is null — and the side it
 * paused on is still in `active_side` (the audit of 2026-09-24, feeding C9 / timers 8).
 *
 * The pause used to clear `active_side` too, which threw away the one thing Resume needs: which
 * breast the baby was on. Resume then guessed "the other side from the first", so a feed started
 * on the left, paused and resumed was credited to the right — L 8 min / R 10 min for a baby who
 * never moved (PRODUCT_SPEC §6.2: "Resume restarts the active side"; the prototype resumes the
 * paused side). The row is its own record of it now, in a column every device already syncs; a
 * `meta` note would not reach the other parent's phone, because the server's timer UPDATE does
 * not carry `meta`.
 */
export const isPausedFeed = (t: Pick<TimerNow, 'sideStartedAtMs'>): boolean =>
  t.sideStartedAtMs === null;

/** The side Resume opens: the one the feed paused on. */
export function resumeSide(t: Pick<TimerNow, 'activeSide' | 'meta'>): 'LEFT' | 'RIGHT' {
  if (t.activeSide !== null) return t.activeSide;
  // a feed paused by an earlier build kept no side at all: that build's own guess, unchanged
  return t.meta['first_side'] === 'RIGHT' ? 'LEFT' : 'RIGHT';
}

/**
 * The side Switch opens. While timing, the other one. WHILE PAUSED, THE LEFT — because that is
 * what the card's button says: `TimerCard` labels it from the side that is OPEN, and a paused feed
 * has none, so it reads "Switch to left". A switch that went anywhere else would do something
 * other than the words on the button (the prototype's `bf-switch` does the same).
 */
export function switchTarget(
  t: Pick<TimerNow, 'activeSide' | 'sideStartedAtMs'>,
): 'LEFT' | 'RIGHT' {
  if (isPausedFeed(t)) return 'LEFT';
  return t.activeSide === 'LEFT' ? 'RIGHT' : 'LEFT';
}

/**
 * What the NOW card and the sheet's card draw for a feed's sides — ONE builder, so Today, the
 * sticky bar and the sheet cannot disagree about whether a feed is paused. A paused feed shows no
 * open side (the card then reads "paused" and offers Resume), whatever `active_side` remembers.
 */
export function feedCardSides(t: FeedTimer): {
  leftMs: number;
  rightMs: number;
  active: 'left' | 'right' | null;
  sideStartedAt?: number;
} {
  const open = isPausedFeed(t) ? null : t.activeSide;
  return {
    leftMs: t.leftSeconds * SEC,
    rightMs: t.rightSeconds * SEC,
    active: open === 'LEFT' ? 'left' : open === 'RIGHT' ? 'right' : null,
    ...(open !== null && t.sideStartedAtMs !== null ? { sideStartedAt: t.sideStartedAtMs } : {}),
  };
}

export interface StartCorrection {
  startedAtMs: number;
  /** A breastfeed only: the sides the corrected start implies. Absent for every other timer. */
  sides?: { leftSeconds: number; rightSeconds: number; sideStartedAtMs: number | null };
}

/**
 * "CORRECT THE START TIME", AS A FEED MEANS IT (the audit of 2026-09-24, feeding C10 / timers 9).
 *
 * For every other timer the start IS the elapsed time: re-anchoring `started_at` is the whole
 * correction. A breastfeed's elapsed, its saved minutes and its L/R split are the SIDES' seconds,
 * so moving only the start changed nothing a parent could see — "5 minutes earlier" still saved
 * 15 minutes and left 900 s, beside a start and end twenty minutes apart.
 *
 * So the difference goes to the sides, from the beginning of the feed:
 *
 *   * EARLIER — the feed began before the tap, on the side it started on: those seconds are added
 *     to the first side (`first_side`, or the open side for a feed that never recorded one).
 *   * LATER — the time before the new start was not feeding, and it comes off the earliest time
 *     there is: the first side's banked seconds, then the other side's, then the open run (its
 *     `side_started_at` moves later, never past now). The order of the runs is not stored, so
 *     banked-before-open is the honest reading of "earliest": a banked run always finished
 *     before the open one began.
 *
 * Seconds are whole, as the columns are. Nothing goes below zero.
 */
export function startCorrection(
  t: FeedTimer & Pick<TimerNow, 'type' | 'startedAtMs'>,
  newStartMs: number,
  nowMs: number,
): StartCorrection {
  if (t.type !== 'breastfeed') return { startedAtMs: newStartMs };
  const first = firstSide(t) ?? 'LEFT';
  const other = first === 'LEFT' ? 'RIGHT' : 'LEFT';
  const banked = { LEFT: t.leftSeconds, RIGHT: t.rightSeconds };
  let sideStartedAtMs = t.sideStartedAtMs;
  const deltaSec = Math.round((t.startedAtMs - newStartMs) / SEC);
  if (deltaSec >= 0) {
    banked[first] += deltaSec;
  } else {
    let remaining = -deltaSec;
    for (const side of [first, other] as const) {
      const take = Math.min(banked[side], remaining);
      banked[side] -= take;
      remaining -= take;
    }
    if (remaining > 0 && t.activeSide !== null && sideStartedAtMs !== null) {
      const openSec = Math.max(0, Math.floor((nowMs - sideStartedAtMs) / SEC));
      sideStartedAtMs += Math.min(openSec, remaining) * SEC;
    }
  }
  return {
    startedAtMs: newStartMs,
    sides: { leftSeconds: banked.LEFT, rightSeconds: banked.RIGHT, sideStartedAtMs },
  };
}

/**
 * WHETHER "CORRECT THE START TIME" MAY TAKE THIS START (2026-09-25). A stopped pump's stop is the
 * session's end, frozen until the output is saved (`stopped.ts`), so a start moved past it made a
 * session that ends before it began: saved on this phone, then refused by the server for good
 * (`activity_time_sane`), so it never reached the household. The panel refuses such a start with
 * a word, the way `LongRunCard` refuses an end before the start (`validEnd`); a timer that is still
 * running has no stop yet, and `applyCustom` already keeps its start from passing now.
 */
export const startBeforeStop = (startedAtMs: number, stoppedAtMs: number | null): boolean =>
  stoppedAtMs === null || startedAtMs <= stoppedAtMs;
