/**
 * The TODAY tiles (PRODUCT_SPEC.md §3.5, Addendum B.1; docs/plans/WP5.md D1, D2).
 *
 * Only figures that reset at midnight belong here. The milk stash is inventory and has its
 * own section — a running total in a row labelled "today" is the kind of thing a tired
 * person misreads once and then distrusts forever.
 *
 * Two rules do the real work and both are easy to get wrong:
 *
 *  - Sleep is summed by OVERLAP with the local day, not by start time, so last night's nap
 *    contributes its 23:30-to-midnight part to yesterday and the rest to today, and the two
 *    days add up to the nap exactly once.
 *  - A running sleep timer counts toward today for the part that has already happened. A
 *    parent looking at the tile at 2 p.m. during a nap wants the nap so far included; the
 *    alternative is a number that jumps when the baby wakes.
 */
import { volumeAsRead, type VolumeUnit } from '../entry/units';
import { overlapMs, type DayBounds } from './day';
import type { ActiveTimer, TodayActivity } from './rows';

/*
  WHAT COUNTS AS WHAT — one definition each, so Today, Reports, the visit summary and the
  catch-up card cannot each decide differently.

  WATER IS NOT MILK, AND A BOTTLE OF IT IS NOT A FEED (decided by the owner's review of the
  feeding audit, M7, 2026-09-24). The bottle sheet offers Water beside Breast milk and Formula,
  and every sum used to add it in: a 2 oz water bottle made "Milk today" 2 oz larger and the feed
  count one higher, on Today, on the widget, in Reports and on the sheet a parent hands a
  clinician. The stool guidance already read water as neither kind (`feedingMode`). The entry is
  still logged, still in the log and in the full download, exactly as the parent saved it; it is
  only left out of the two figures whose words ("milk", "feeds") it does not fit.

  A DRY CHECK IS NOT A DIAPER CHANGE (PRODUCT_SPEC §6.4): kept in the log, never counted. Today
  already said so; Reports' "diapers a day" and the catch-up card did not (the care audit, M2).
*/

/** A bottle whose amount belongs in the milk figure: every bottle but water. */
export const countsAsMilk = (r: Pick<TodayActivity, 'type' | 'bottleKind'>): boolean =>
  r.type === 'bottle' && r.bottleKind !== 'WATER';

/** A feed, for every count of feeds: a breastfeed, or a bottle of milk (never water). */
export const countsAsFeed = (r: Pick<TodayActivity, 'type' | 'bottleKind'>): boolean =>
  r.type === 'breastfeed' || countsAsMilk(r);

/** A diaper change, for every count of them: any kind but a DRY check. */
export const countsAsDiaper = (r: Pick<TodayActivity, 'type' | 'diaperKind'>): boolean =>
  r.type === 'diaper' && r.diaperKind !== 'DRY';

/**
 * HOW LONG AN ENTRY LASTED, AS IT WAS RECORDED — in ms.
 *
 * For a breastfeed that is the minutes at the breast, left plus right, whenever the sides were
 * recorded: the timer banks each side and stops the clock while paused, the manual sheet asks for
 * the minutes, and the editor corrects them. The wall-clock span from start to end is NOT that
 * figure — a pause, a Finish tapped while paused, a corrected start or a tandem feed all stretch it
 * — and every surface that showed it said "30m" beside a toast that had said "18 min" (the feeding
 * audit, H1). A breastfeed with no sides recorded, and every other type, is its span.
 */
export function recordedMs(
  r: Pick<TodayActivity, 'type' | 'startMs' | 'endMs' | 'leftSeconds' | 'rightSeconds'>,
): number {
  if (r.type === 'breastfeed') {
    const seconds = (r.leftSeconds ?? 0) + (r.rightSeconds ?? 0);
    if (seconds > 0) return seconds * 1000;
  }
  return r.endMs !== null && r.endMs > r.startMs ? r.endMs - r.startMs : 0;
}

export interface TodayTotals {
  /**
   * Today's bottles of milk — never water (`countsAsMilk`) — added up as each one reads in the
   * unit the totals were asked for (`volumeAsRead`): in ounces, the sum of the quarters the rows
   * say, not the stored ml snapped afterwards, which drifts a quarter off after a handful of
   * bottles. In ml, and with no unit, the plain sum of `consumed_ml`.
   */
  milkMl: number;
  /**
   * The bottles `milkMl` is made of, counted beside the sum so "8 oz" and "2 bottles" under it
   * can never disagree about a water bottle. Optional only so a caller that builds totals by hand
   * (a test, the widget snapshot) keeps compiling; `todayTotals` always fills it.
   */
  milkBottles?: number;
  /**
   * Sleep overlapping today, in minutes, including the running timer's elapsed part — each sleep's
   * part of the day in whole minutes, as its own row says them, then added (the pre-launch sweep,
   * 2026-09-27; `breastfeedMinutes` has the rule). A timer's sleep has seconds: naps of 44m 40s,
   * 1h 29m 40s and 29m 35s are rows of 45m, 1h 30m and 30m, and the day read 2h 44m beside them
   * — and beside Reports' own split of the same naps (`sleepInsight`, which rounds each sleep),
   * 2h 45m.
   */
  sleepMinutes: number;
  /**
   * Tummy time overlapping today, in minutes, the running timer's elapsed part included — the
   * numerator of the Baby care card's goal bar (`goal.ts`). Summed the way sleep is, by overlap
   * rather than by start, for the same reason: a go that straddles midnight belongs to both days
   * exactly once. Each go in whole minutes as its row says them, then added, like sleep: three timed
   * goes of about five minutes are "5m" rows, and a 15m goal is met when they add up to 15, not
   * held at "14m / 15m goal" by the seconds under them.
   */
  tummyMinutes: number;
  /** Diaper changes today, EXCLUDING dry (PRODUCT_SPEC.md §6.4). */
  diapers: number;
  /**
   * Pump output today, added up as each session reads (`milkMl` says why). Only meaningful when
   * the pump module is on.
   */
  pumpedMl: number;
  /** Pump sessions today. */
  pumpSessions: number;
  /** Feeds today: bottles of milk plus breastfeeds (`countsAsFeed` — a water bottle is neither). */
  feeds: number;
  /**
   * The breastfeeds that started today — the count under Today's breastfeeding minutes. Optional
   * for `milkBottles`' reason: `todayTotals` always fills it, a hand-built total need not.
   */
  breastfeeds?: number;
  /**
   * THE MINUTES AT THE BREAST TODAY (the owner, 2026-09-26: *"milk also comes from breastfeeding …
   * it just shows intake per day"*). Each breastfeed that started today at its RECORDED length
   * (`recordedMs`: left plus right, not the span a pause stretched), in whole minutes as its own
   * log row says them, then added — so the day's figure is the sum a parent would get by adding
   * the rows up, and the same sum Reports makes for a week (`reportStats`).
   *
   * A feed still being timed is not in it, unlike a running sleep: the running projection carries
   * only when a timer started, not its pauses or which side is banked, so any figure for it would
   * be a guess. The NOW card has its live minutes; this counts the moment it is saved.
   *
   * MINUTES, NEVER OUNCES. A breastfeed measures no volume and this app never turns a time at the
   * breast into an amount — no rate, no age table, no estimate (CLAUDE.md §2 rule 1;
   * docs/MILK_STASH.md §10b records the owner's same question and the same answer).
   */
  breastfeedMinutes?: number;
}

const MIN = 60_000;

/**
 * `nowMs` is needed for the running timer only; every other figure is closed data.
 *
 * Rows are expected to be already filtered for the selected child and already
 * visibility-filtered (`visibleTo`). This function does not know who is looking, and should
 * not: a total that silently hid rows would be a total nobody could reconcile.
 *
 * `unit` is the household's milk unit, and every caller that SHOWS a volume passes it: the milk
 * and pumped figures add each entry up as it reads in that unit (`volumeAsRead`). Without one they
 * are the plain sums of the stored ml, which is what a milliliter household reads anyway.
 */
export function todayTotals(
  rows: readonly TodayActivity[],
  running: readonly ActiveTimer[],
  bounds: DayBounds,
  nowMs: number,
  unit: VolumeUnit = 'ml',
): TodayTotals {
  let milkMl = 0;
  let milkBottles = 0;
  // whole minutes per entry, as its own row says them, then added (see the interface)
  let sleepMinutes = 0;
  let tummyMinutes = 0;
  const minutesIn = (startMs: number, endMs: number): number =>
    Math.round(overlapMs(startMs, endMs, bounds) / MIN);
  let diapers = 0;
  let pumpedMl = 0;
  let pumpSessions = 0;
  let feeds = 0;
  let breastfeeds = 0;
  let breastfeedMinutes = 0;

  for (const r of rows) {
    const startsToday = r.startMs >= bounds.startMs && r.startMs < bounds.endMs;

    switch (r.type) {
      case 'bottle':
        // water is logged and kept, and is neither milk nor a feed (see `countsAsMilk`)
        if (startsToday && countsAsMilk(r)) {
          milkMl += volumeAsRead(r.consumedMl ?? 0, unit);
          milkBottles += 1;
          feeds += 1;
        }
        break;
      case 'breastfeed':
        if (startsToday) {
          feeds += 1;
          breastfeeds += 1;
          // whole minutes per feed, as its own row says them, then added (see the interface)
          breastfeedMinutes += Math.round(recordedMs(r) / MIN);
        }
        break;
      case 'sleep':
        // by overlap, not by start: this row may have begun yesterday
        sleepMinutes += minutesIn(r.startMs, r.endMs ?? r.startMs);
        break;
      case 'tummy':
        tummyMinutes += minutesIn(r.startMs, r.endMs ?? r.startMs);
        break;
      case 'diaper':
        // DRY is kept in the timeline but never counted (PRODUCT_SPEC.md §6.4)
        if (startsToday && countsAsDiaper(r)) diapers += 1;
        break;
      case 'pump':
        if (startsToday) {
          pumpedMl += volumeAsRead(r.totalMl ?? 0, unit);
          pumpSessions += 1;
        }
        break;
      default:
        break;
    }
  }

  for (const t of running) {
    // clipped at both ends: the part of this still-running timer that is inside today
    if (t.type === 'sleep') sleepMinutes += minutesIn(t.startedAtMs, nowMs);
    else if (t.type === 'tummy') tummyMinutes += minutesIn(t.startedAtMs, nowMs);
  }

  return {
    milkMl,
    milkBottles,
    sleepMinutes,
    tummyMinutes,
    diapers,
    pumpedMl,
    pumpSessions,
    feeds,
    breastfeeds,
    breastfeedMinutes,
  };
}

/** Today's diapers by what they were — the three kinds that count, never DRY (§6.4). */
export interface DiaperKinds {
  wet: number;
  dirty: number;
  both: number;
}

export function diaperKinds(rows: readonly TodayActivity[], bounds: DayBounds): DiaperKinds {
  const out: DiaperKinds = { wet: 0, dirty: 0, both: 0 };
  for (const r of rows) {
    if (r.type !== 'diaper' || r.startMs < bounds.startMs || r.startMs >= bounds.endMs) continue;
    if (r.diaperKind === 'WET') out.wet += 1;
    else if (r.diaperKind === 'DIRTY') out.dirty += 1;
    else if (r.diaperKind === 'BOTH') out.both += 1;
  }
  return out;
}

/**
 * YESTERDAY, UP TO THE SAME TIME OF DAY — the window a fair "more than yesterday" is measured
 * against.
 *
 * At nine in the morning, today holds nine hours of feeds and yesterday holds twenty-four; a
 * comparison of the two says "18 oz less than yesterday" about a day that is not over, every
 * morning, and a parent who read it that way would be right to be alarmed and wrong to be. So
 * yesterday is clipped to the hours today has had: what had happened by this time yesterday is
 * the like for today's like. Sleep counts by overlap inside the window, so the overnight stretch
 * is shared fairly between the two days exactly as `todayTotals` already shares it.
 */
export function sameTimeYesterday(
  today: DayBounds,
  yesterday: DayBounds,
  nowMs: number,
): DayBounds {
  const elapsed = Math.max(0, Math.min(nowMs, today.endMs) - today.startMs);
  return {
    startMs: yesterday.startMs,
    endMs: Math.min(yesterday.endMs, yesterday.startMs + elapsed),
  };
}
