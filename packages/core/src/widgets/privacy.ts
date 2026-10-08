/**
 * LOCK-SCREEN PRIVACY (docs/WIDGETS.md §7), applied to the DATA before it leaves the app — not
 * at render time — so a withheld amount is absent from the App Group container, not merely
 * hidden by a view. Home-screen widgets sit behind the device unlock and take FULL; the lock
 * screen accessories and the Live Activity take what the parent chose in More → Widgets.
 *
 *   FULL     everything: times, amounts, kinds, the running timer's clock
 *   LIMITED  times and kinds, but no amount or volume anywhere — `••` in its place
 *   HIDDEN   the child's name, counts, the next item's time and whether a timer runs; no feed
 *            times, no amounts, no pump, no stash, no elapsed timer
 *
 * A private entry (mom privacy) never reaches the snapshot at all: the app's read models
 * already filter by viewer, so this file never sees one and cannot leak one.
 */
import { WIDGET_COPY } from './copy';
import {
  WITHHELD,
  WITHHELD_CLOCK,
  type WidgetLastEntry,
  type WidgetSnapshot,
  type WidgetPrivacy,
} from './snapshot';

export function applyPrivacy(s: WidgetSnapshot, mode: WidgetPrivacy): WidgetSnapshot {
  if (mode === 'FULL') return s;
  if (mode === 'LIMITED') {
    return {
      ...s,
      lastFeed: limitAmount(s.lastFeed),
      lastDiaper: limitAmount(s.lastDiaper),
      totals:
        s.totals === null
          ? null
          : { ...s.totals, milkDisplay: s.totals.milkDisplay === null ? null : WITHHELD },
      pump:
        s.pump === null
          ? null
          : {
              ...s.pump,
              lastAmount: s.pump.lastAmount === null ? null : WITHHELD,
              todayDisplay: WITHHELD,
            },
      stash:
        s.stash === null
          ? null
          : {
              ...s.stash,
              totalDisplay: WITHHELD,
              useFirst: s.stash.useFirst === null ? null : WITHHELD,
            },
    };
  }
  // HIDDEN
  return {
    ...s,
    sleep: s.sleep === null ? null : { asleep: s.sleep.asleep, sinceMs: null, sinceClock: null },
    lastFeed: hideEntry(s.lastFeed),
    lastDiaper: hideEntry(s.lastDiaper),
    // "Timer running" and no more (the live timer handoff, 2026-10-07): no clock, no start, no
    // sides, no baby's name, and no Stop — a tap opens the app, where it is finished
    timer:
      s.timer === null
        ? null
        : {
            ...s.timer,
            label: WIDGET_COPY.timerRunning,
            word: WIDGET_COPY.timerRunning,
            startedAtMs: 0,
            startedClock: WITHHELD_CLOCK,
            sides: null,
            sideClock: null,
            stopUrl: '',
          },
    totals: s.totals === null ? null : { ...s.totals, milkDisplay: null, sleepDisplay: null },
    pump: null,
    stash: null,
  };
}

const limitAmount = (e: WidgetLastEntry | null): WidgetLastEntry | null =>
  e === null || !e.amount ? e : { ...e, detail: WITHHELD };

const hideEntry = (e: WidgetLastEntry | null): WidgetLastEntry | null =>
  e === null ? null : { ...e, clock: WITHHELD_CLOCK, detail: null, amount: false };
