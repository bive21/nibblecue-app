/**
 * Which milk to use (docs/MILK_STASH.md §6b), and why — the ranking IS the rule
 * "whatever would otherwise be wasted, then whatever needs least work":
 *
 *   1. ROOM      just pumped, still out      oldest out first
 *   2. THAWED    oldest thawed_at first      it can never go back in the freezer
 *   3. FRIDGE    oldest pumped_at first
 *   4. FREEZER   earliest best_use_at first  rotate the stock
 *
 * A container under MIN_SUGGEST_ML, or past its own guidance LIMIT, is not SUGGESTED — it is
 * still in the list, still counted, still usable, and the picker shows it with the same reason
 * line. "Suggested" is an inventory convenience derived from published windows, never a claim
 * about which milk is better for a baby, and no sentence here may read as one (§6c, §13).
 */
import { durationLabel } from '../today/since';
import {
  MIN_SUGGEST_ML,
  USE_SOON_FRESH_HOURS,
  USE_SOON_FROZEN_DAYS,
  type MilkContainerStatus,
  type MilkStorageKind,
} from './constants';
import { calendarDaysUntil, useSoonHorizonMs } from './guidance';
import { clockText, dayText, daysLeftText, recentDayText } from './format';

export interface StashCandidate {
  id: string;
  amountMl: number;
  status: MilkContainerStatus;
  kind: MilkStorageKind;
  pumpedAt: string;
  firstFrozenAt: string | null;
  thawedAt: string | null;
  locationName: string | null;
  locationShort: string | null;
  bestUseAt: number | null;
  limitAt: number | null;
}

export type UseGroup = 'fresh' | 'thawed' | 'fridge' | 'frozen';

export type NotSuggested = 'under_min' | 'past_limit' | 'date_needed';

export interface RankedCandidate extends StashCandidate {
  group: UseGroup;
  /** The chip word: Fresh · Thawing · Fridge · Frozen. */
  chip: string;
  reason: string;
  suggested: boolean;
  whyNot: NotSuggested | null;
}

export interface ReasonFormat {
  timeZone: string;
  clock24: boolean;
}

const GROUP_ORDER: Readonly<Record<UseGroup, number>> = {
  fresh: 0,
  thawed: 1,
  fridge: 2,
  frozen: 3,
};
const CHIP: Readonly<Record<UseGroup, string>> = {
  fresh: 'Fresh',
  thawed: 'Thawing',
  fridge: 'Fridge',
  frozen: 'Frozen',
};

/** THAWING is a status and THAWED a location kind; either puts the milk in the thawed group. */
export function useGroup(kind: MilkStorageKind, status: MilkContainerStatus): UseGroup {
  if (status === 'THAWING' || kind === 'THAWED') return 'thawed';
  if (kind === 'ROOM') return 'fresh';
  if (kind === 'FRIDGE') return 'fridge';
  return 'frozen';
}

const ms = (iso: string | null): number =>
  iso === null ? Number.POSITIVE_INFINITY : Date.parse(iso);

/** The within-group sort key: what would otherwise be wasted first. */
function orderKey(c: StashCandidate, group: UseGroup): number {
  switch (group) {
    case 'fresh':
      return ms(c.pumpedAt);
    case 'thawed':
      return c.thawedAt === null ? ms(c.pumpedAt) : ms(c.thawedAt);
    case 'fridge':
      return ms(c.pumpedAt);
    case 'frozen':
      return c.bestUseAt ?? Number.POSITIVE_INFINITY;
  }
}

/**
 * The calendar days to a best-use date, and below zero once that INSTANT has passed (the stash
 * sweep of 2026-09-24). Calendar days alone round a date that passed at 7:00 this morning to
 * "0", so a fridge bottle a minute past its four days read "use today" — beside a "past best use"
 * badge and a "Past window" chip on the same bag, and in the direction that says the milk keeps
 * longer than the published window does.
 */
function daysLeft(bestUseAt: number, nowMs: number, timeZone: string): number {
  return bestUseAt < nowMs ? -1 : calendarDaysUntil(bestUseAt, nowMs, timeZone);
}

/** §6b's "what the parent reads" column, one line per container. */
export function reasonLine(c: StashCandidate, nowMs: number, f: ReasonFormat): string {
  const group = useGroup(c.kind, c.status);
  switch (group) {
    case 'fresh': {
      const parts = [`Out since ${clockText(ms(c.pumpedAt), f.timeZone, f.clock24)}`];
      parts.push('nothing to thaw or warm');
      if (c.bestUseAt !== null && c.bestUseAt > nowMs)
        parts.push(`use within ${durationLabel(c.bestUseAt - nowMs)}`);
      else if (c.bestUseAt !== null) parts.push('past best use');
      return parts.join(' · ');
    }
    case 'thawed': {
      if (c.bestUseAt === null) return 'Thawed · thaw date needed';
      return `Thawed · use by ${clockText(c.bestUseAt, f.timeZone, f.clock24)} · thawed milk does not go back in the freezer`;
    }
    case 'fridge': {
      const parts = ['Fridge', `pumped ${recentDayText(ms(c.pumpedAt), nowMs, f.timeZone)}`];
      if (c.bestUseAt !== null) parts.push(daysLeftText(daysLeft(c.bestUseAt, nowMs, f.timeZone)));
      return parts.join(' · ');
    }
    case 'frozen': {
      if (c.firstFrozenAt === null || c.bestUseAt === null)
        return 'Frozen · freeze date needed · needs thawing';
      const days = daysLeft(c.bestUseAt, nowMs, f.timeZone);
      const when =
        days < 0 ? 'past best use' : days === 0 ? 'best use today' : `best use in ${days} days`;
      return `Frozen ${dayText(ms(c.firstFrozenAt), f.timeZone)} · ${when} · needs thawing`;
    }
  }
}

function whyNotSuggested(c: StashCandidate, nowMs: number): NotSuggested | null {
  if (c.amountMl < MIN_SUGGEST_ML) return 'under_min';
  if (c.limitAt === null) return 'date_needed';
  if (c.limitAt < nowMs) return 'past_limit';
  return null;
}

/**
 * Every container in the stash, ranked: the suggested ones first in §6b order, then the rest
 * in the same order. Stable for equal keys, so two devices agree on the first chip.
 */
export function rankForUse(
  list: readonly StashCandidate[],
  nowMs: number,
  f: ReasonFormat,
): RankedCandidate[] {
  const ranked = list.map(c => {
    const group = useGroup(c.kind, c.status);
    const whyNot = whyNotSuggested(c, nowMs);
    return {
      ...c,
      group,
      chip: CHIP[group],
      reason: reasonLine(c, nowMs, f),
      suggested: whyNot === null,
      whyNot,
    };
  });
  return ranked
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const s = Number(!a.c.suggested) - Number(!b.c.suggested);
      if (s !== 0) return s;
      const g = GROUP_ORDER[a.c.group] - GROUP_ORDER[b.c.group];
      if (g !== 0) return g;
      const k = orderKey(a.c, a.c.group) - orderKey(b.c, b.c.group);
      if (k !== 0 && Number.isFinite(k)) return k;
      if (k !== 0) return Number.isFinite(orderKey(a.c, a.c.group)) ? -1 : 1;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : a.i - b.i;
    })
    .map(x => x.c);
}

/**
 * The `Use first` net (§6g): frozen containers whose best use is within 30 days, everything
 * else within 48 h, by best use ascending. A container with no date cannot be in a window.
 */
export function useSoon<T extends { kind: MilkStorageKind; bestUseAt: number | null }>(
  list: readonly T[],
  nowMs: number,
): T[] {
  return list
    .filter(
      c =>
        c.bestUseAt !== null &&
        c.bestUseAt <= nowMs + useSoonHorizonMs(c.kind, USE_SOON_FROZEN_DAYS, USE_SOON_FRESH_HOURS),
    )
    .sort((a, b) => (a.bestUseAt ?? 0) - (b.bestUseAt ?? 0));
}
