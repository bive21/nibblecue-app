/**
 * The stash overview's arithmetic (docs/MILK_STASH.md §10; the 2026-09-19 redesign): the order
 * locations are read in, what a countdown chip says, how a location's bags fall into days, how
 * many of those days are on screen, and how a published window is written out.
 *
 * All of it is pure — no clock, no database, no React — because every one of these is a rule a
 * screen would otherwise state in passing and get subtly wrong at a boundary. "Tomorrow" versus
 * "In 2 days" is a calendar question, not a subtraction; a freezer day-group's best-use date is
 * shared by every bag in it and belongs on the header rather than repeated down the rows; and
 * "show 26 more" has to agree with what is actually hidden.
 *
 * NOTHING HERE DECIDES ANYTHING ABOUT MILK. Every duration a parent reads still comes from the
 * versioned guidance profile (`guidance.ts`), and the words below are the neutral ones §13 lists
 * — `guidance.test.ts`'s vocabulary scan covers this file with the rest of the folder.
 */
import { localDayBounds, localDayKey } from '../today/day';
import { isFrozenKind, type MilkStorageKind } from './constants';
import { calendarDaysUntil } from './guidance';
import { dayText } from './format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ locations */

/**
 * WARM TO COOL, which is also soonest-to-latest: a counter's window is four hours and a deep
 * freezer's is six months, so reading the cards top to bottom reads the stash in the order it
 * has to be used. `THAWED` sits at the end rather than beside the fridge it lives in, because a
 * thawing bag is on its way OUT of the stash and a parent scanning for "what is frozen" should
 * not have to step over it.
 *
 * A household's own location gets `CUSTOM_ORDER` and then falls back to `sort_order`, so
 * renaming the freezer to "garage chest" never moves it and a location nobody in this list
 * anticipated lands after the ones everybody has.
 */
const LOCATION_KIND_ORDER: Readonly<Record<MilkStorageKind, number>> = {
  ROOM: 0,
  FRIDGE: 1,
  FREEZER: 2,
  DEEP_FREEZER: 3,
  THAWED: 4,
};
const CUSTOM_ORDER = 5;

export const locationRank = (kind: MilkStorageKind | null): number =>
  kind === null ? CUSTOM_ORDER : (LOCATION_KIND_ORDER[kind] ?? CUSTOM_ORDER);

/** Temperature order, then the household's own arrangement inside a kind. */
export function byLocationOrder<T extends { kind: MilkStorageKind | null; sort_order: number }>(
  a: T,
  b: T,
): number {
  const rank = locationRank(a.kind) - locationRank(b.kind);
  return rank !== 0 ? rank : a.sort_order - b.sort_order;
}

/* ------------------------------------------------------------------ the countdown chip */

/**
 * The chip's tone, which is the only thing a colour is allowed to mean here: `past` and `soon`
 * are facts about a published window, never a verdict on the milk (§13). `plain` carries no
 * urgency at all and is most of the stash most of the time.
 */
export type CountdownTone = 'past' | 'soon' | 'plain';

export interface Countdown {
  tone: CountdownTone;
  label: string;
  /** True for the two states §3's tile and §5's header both count as "due": past, or within 24h. */
  due: boolean;
}

/**
 * `Past window` · `In 3 h` · `Today` · `Tomorrow` · `In 6 days` · `Best use Mar 18`.
 *
 * THE BANDS ARE CALENDAR DAYS, NOT DIVISIONS. A bag due at 1 a.m. tomorrow is eleven hours away
 * and is still `Tomorrow`, because that is the word a parent reads off a calendar and the hour
 * count would say `In 11 h` on a bag they cannot use tonight. `calendarDaysUntil` counts local
 * day starts, so a DST day of 23 or 25 hours cannot shift a label.
 *
 * Under twelve hours the hour count is worth more than the word — `In 3 h` is something you act
 * on now — so today splits: `In N h` under twelve, `Today` above it. Fourteen days out the
 * count stops meaning anything and the date itself is shorter to read than "In 183 days".
 */
export function countdownLabel(
  bestUseAt: number | null,
  nowMs: number,
  timeZone: string,
): Countdown | null {
  if (bestUseAt === null) return null;
  const ms = bestUseAt - nowMs;
  if (ms < 0) return { tone: 'past', label: 'Past window', due: true };
  const days = calendarDaysUntil(bestUseAt, nowMs, timeZone);
  if (ms < 12 * HOUR) {
    return { tone: 'soon', label: `In ${Math.max(1, Math.ceil(ms / HOUR))} h`, due: true };
  }
  if (days === 0) return { tone: 'soon', label: 'Today', due: true };
  if (days === 1) return { tone: 'soon', label: 'Tomorrow', due: ms < DAY };
  if (days < 14) return { tone: 'plain', label: `In ${days} days`, due: false };
  return { tone: 'plain', label: `Best use ${dayText(bestUseAt, timeZone)}`, due: false };
}

/** Past, or inside the next 24 hours: §3's amber tile and §5's "due today" summary. */
export const isDueWithin24h = (bestUseAt: number | null, nowMs: number): boolean =>
  bestUseAt !== null && bestUseAt - nowMs < DAY;

export const isPastWindow = (bestUseAt: number | null, nowMs: number): boolean =>
  bestUseAt !== null && bestUseAt < nowMs;

/* ------------------------------------------------------------------ use first */

export interface HasBestUse {
  bestUseAt: number | null;
}

/**
 * The n nearest the end of their window, ANY location (§4). Past-window items sort first, which
 * they do for free: they are the smallest numbers on the line.
 *
 * A container with no best-use date — a frozen bag whose freeze date nobody recorded — sorts
 * last rather than first. It is not urgent, it is unknown, and putting an unknown at the head of
 * a list called "use first" would be the app inventing a date it does not have (§5's
 * `MISSING_FREEZE_DATE` is where that is reported).
 */
export function nearestBestUse<T extends HasBestUse>(items: readonly T[], n: number): T[] {
  return [...items]
    .sort(
      (a, b) =>
        (a.bestUseAt ?? Number.POSITIVE_INFINITY) - (b.bestUseAt ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, Math.max(0, n));
}

/* ------------------------------------------------------------------ grouping by stored day */

export interface HasStoredDay extends HasBestUse {
  /** When this container entered the place it is in now: the freeze for a freezer, the pump otherwise. */
  storedAtMs: number;
  amountMl: number;
}

export interface DayGroup<T> {
  /** `YYYY-MM-DD` in the household's zone: the group's identity, stable across a re-render. */
  key: string;
  /** The local day's start, for ordering and for `Mon D`. */
  dayStartMs: number;
  items: T[];
  totalMl: number;
  /**
   * The group's best use, which is the EARLIEST of its items — and for a freezer day every item
   * has the same one, which is exactly why §5b puts it on the header instead of on each row. A
   * group whose items have no date at all reports null rather than a guess.
   */
  bestUseAt: number | null;
}

/**
 * When a container entered the place it is in now. Frozen milk dates from the freeze, because
 * that is the anchor its window hangs from (`guidance.ts` `anchors`); everything else dates from
 * the pump. A frozen bag with no freeze date falls back to the pump so it still lands in a day
 * rather than in a group of its own called "unknown" — its missing anchor is reported on the
 * container, not by hiding it.
 */
export function storedAtMs(
  kind: MilkStorageKind | null,
  pumpedAtMs: number,
  firstFrozenAtMs: number | null,
): number {
  return kind !== null && isFrozenKind(kind) && firstFrozenAtMs !== null
    ? firstFrozenAtMs
    : pumpedAtMs;
}

/**
 * One group per local day a bag was stored, newest first by default (§5b).
 *
 * The key is the local calendar date rather than a bucket of milliseconds, so a household that
 * flies to another zone regroups its stash the way its own calendar reads and two bags twenty
 * minutes either side of midnight are two days, as a parent would say they are.
 */
export function groupByStoredDay<T extends HasStoredDay>(
  items: readonly T[],
  timeZone: string,
  order: 'newest' | 'oldest' = 'newest',
): DayGroup<T>[] {
  const byKey = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const start = localDayBounds(timeZone, item.storedAtMs).startMs;
    const key = localDayKey(timeZone, start);
    const group = byKey.get(key);
    if (group === undefined) {
      byKey.set(key, {
        key,
        dayStartMs: start,
        items: [item],
        totalMl: item.amountMl,
        bestUseAt: item.bestUseAt,
      });
      continue;
    }
    group.items.push(item);
    group.totalMl += item.amountMl;
    if (item.bestUseAt !== null && (group.bestUseAt === null || item.bestUseAt < group.bestUseAt)) {
      group.bestUseAt = item.bestUseAt;
    }
  }
  const groups = [...byKey.values()];
  const sign = order === 'newest' ? -1 : 1;
  for (const g of groups) g.items.sort((a, b) => sign * (a.storedAtMs - b.storedAtMs));
  groups.sort((a, b) => sign * (a.dayStartMs - b.dayStartMs));
  return groups;
}

/* ------------------------------------------------------------------ paging */

export interface Page<T> {
  shown: T[];
  hidden: T[];
  /** How many ITEMS are behind the button — bags, not groups: that is what the button counts. */
  hiddenItems: number;
  /** The earliest best-use among what is hidden, for the line under the button. */
  hiddenBestUseAt: number | null;
}

/**
 * The first `limit` of something, and an honest account of the rest (§5c, §5d).
 *
 * `hiddenItems` counts BAGS rather than groups because that is the promise the button makes —
 * "Show 26 more bags" is checkable by a parent and "show 7 more groups" is not — and
 * `hiddenBestUseAt` is what lets the caption say everything below is good through a date,
 * which is the sentence that makes hiding them acceptable at all.
 */
export function page<T>(all: readonly T[], limit: number, count?: (t: T) => number): Page<T> {
  const cut = Math.max(0, limit);
  const shown = all.slice(0, cut);
  const hidden = all.slice(cut);
  let items = 0;
  let bestUse: number | null = null;
  for (const h of hidden) {
    items += count === undefined ? 1 : count(h);
    const at = bestUseOf(h);
    if (at !== null && (bestUse === null || at < bestUse)) bestUse = at;
  }
  return { shown, hidden, hiddenItems: items, hiddenBestUseAt: bestUse };
}

function bestUseOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const at = (value as { bestUseAt?: unknown }).bestUseAt;
  return typeof at === 'number' ? at : null;
}

/** How many day groups are on screen before the button, and how many each press adds (§5c). */
export const DAY_GROUPS_PER_PAGE = 4;
/** How many day groups start open inside an expanded location (§5c). */
export const DAY_GROUPS_OPEN = 2;
/** `All bags` pages ten at a time (§5d). */
export const FLAT_ROWS_PER_PAGE = 10;
/** At or under this, a location shows its rows with no toolbar at all (§5a). */
export const TOOLBAR_MIN_ITEMS = 5;
/** At or under this, a location starts expanded (§5 collapse behavior). */
export const AUTO_EXPAND_MAX_ITEMS = 2;
/** How many rows `Use first` shows before the "All n" link (§4). */
export const USE_FIRST_ROWS = 3;

/* ------------------------------------------------------------------ windows in words */

/**
 * `4 hours` · `4 days` · `1 day` · `6 months` (§6), from the profile's own minutes.
 *
 * NEVER `4 h` OR `1 days`. The grid is read once and remembered, so it is written the way it
 * would be said aloud; the tile chips elsewhere are glanced at repeatedly and abbreviate on
 * purpose. Months are counted at 30 days and rounded, which is what turns the CDC's 263 520
 * minutes into the "about 6 months" its own display block already says.
 */
export function formatWindow(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const hours = minutes / 60;
  if (hours < 24) return plural(Math.round(hours), 'hour');
  const days = hours / 24;
  if (days < 30) return plural(Math.round(days), 'day');
  const months = days / 30;
  if (months < 12) return plural(Math.round(months), 'month');
  return plural(Math.round(months / 12), 'year');
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ the two tiles */

export interface SevenDayNet {
  pumpedMl: number;
  usedMl: number;
  discardedMl: number;
  /** Pumped − used − discarded: what went in, less what came out. Negative when more came out. */
  netMl: number;
}

/**
 * §3's tile B: the three flows, and the net OF THOSE THREE — the one sum the tile's legend is
 * drawn as, so it always adds up to what is printed beside it.
 *
 * NO CORRECTION IN IT, SINCE 2026-09-27 (the owner, of the same figure on Reports: *"dont think
 * we need to know correct # as it does not make sense"*). From 2026-09-24 the net took every
 * ADJUST and the legend drew them as a fourth, signed entry, because a synced pump taken back
 * with Undo had read "+5 oz net" over a stash that had not changed. That case is gone at its
 * source now — a write and its Undo cancel out before anything is summed (`balance.ts`
 * `withoutUndone`), so the undone pump is in neither the pumped nor the net — and what is left
 * of the corrections is a parent's "Correct the amount" and a bottle's last few ml written off:
 * the count put right, not milk that moved. They change what is in the stash, which the total
 * card says, and they are not drawn as a flow here.
 */
export function sevenDayNet(w: {
  pumpedMl: number;
  usedMl: number;
  discardedMl: number;
}): SevenDayNet {
  return {
    pumpedMl: w.pumpedMl,
    usedMl: w.usedMl,
    discardedMl: w.discardedMl,
    netMl: w.pumpedMl - w.usedMl - w.discardedMl,
  };
}
