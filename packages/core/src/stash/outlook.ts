/**
 * HOW LONG THE STASH LASTS, AND WHAT THAT NUMBER IS DIVIDED BY (docs/MILK_STASH.md §10b).
 *
 * ONE QUESTION, ANSWERED THE SAME WAY EVERY WEEK: **how long the stash covers if every feed came
 * from it.** The owner, 2026-09-26: *"say parent only do 50-50 breastfeeding and bottle. bottle
 * shows 12oz in their daily log avg, but it should be 24oz per day based on the 50-50 rule. if user
 * has 1000 oz milk stored, it looks like it will last about 80 days if only counting from bottle
 * (12oz), when in reality its about half of that if doing full milk stash."*
 *
 * They were right, and it was worse than one wrong number: the card answered two questions. Until
 * the stash's own use qualified as a rate it divided by the household's PLAN — every feed of the
 * rhythm at their usual bottle — and from then on by what actually came OUT of the stash, which for
 * a household that nurses half its feeds is half the feeds. So the same 1,000 oz read about 41 days
 * one week and about 83 the next, with nothing changed but the week.
 *
 * So the divisor is now always the DAILY NEED: the feeds this household gives in a day — bottles
 * and breastfeeds alike, counted from its own log (`feedsPerDayFromLog`) or, while the log is too
 * thin, from the rhythm it set (`feedsPerDayFrom`) — times its usual bottle (`usualBottleMl`). The
 * stash's own pace is kept as a second figure for a household that also nurses (`pace`), because
 * "how fast it is actually going down" is still a true thing to know, just not the headline.
 *
 * NO NORM AND NO AGE TABLE, ever (CLAUDE.md §2 rules 1 and 6). Both numbers are the household's
 * own — a count of the feeds it logged and the middle of the bottles it gave — which is the owner's
 * own "8 feeds × 3 oz" arithmetic. How much a baby of a given age should drink is a clinical claim,
 * and nothing here makes one: a household that nurses every feed and never logged a bottle or set a
 * bottle size has no usual bottle, and the card shows no number rather than inventing one.
 *
 * AND IT ALLOWS FOR A LOG WITH HOLES IN IT (the owner, the same day: *"consider the human aspect of
 * like forget to logging"*). A day with too few feeds logged is a day the log missed, and it is not
 * counted (`FEED_DAY_SHARE`); the count is a median, so one short day moves nothing; and a top-up
 * bottle is part of the feed it topped up, never a second feed or a small "usual bottle".
 */
import type { Rule } from '../schedule/types';
import { isFeeding } from '../schedule/sessions';
import { shiftDay, type DayBounds } from '../today/day';

const MIN_MS = 60_000;

/** Entries in the window before the stash's own pace is a rate rather than an anecdote. */
const MIN_USE_ENTRIES = 3;
/** Days of history before the stash's own pace — and the log's count of feeds — is a rate. */
const MIN_USE_DAYS = 3;
/** The window the rates are taken over, when there is that much history. */
const RATE_WINDOW_DAYS = 7;

/**
 * ONE FEED, HOWEVER MANY ENTRIES IT TOOK. An entry starting within half an hour of the previous one
 * for the same baby is the same feed: a breastfeed topped up with a bottle, a breastfeed logged a
 * side at a time, both parents logging the same bottle. Counted as two, a mixed-feeding household's
 * top-ups would double its feeds a day. Thirty minutes is the foresight engine's own line for the
 * same question (`SAME_OCCURRENCE_MS`, `schedule/foresight.ts`), and it is backtested there.
 */
export const SAME_FEED_MS = 30 * MIN_MS;

/**
 * A DAY WITH FEWER THAN HALF THE FEEDS OF THE HOUSEHOLD'S OWN USUAL DAY IS NOT COUNTED — it is a
 * day the log is missing feeds (a day at a grandparent's, an evening nobody wrote down), and
 * counting it would say the household gives fewer feeds than it does. The line is the household's
 * own middle day, never a number of feeds a baby "should" have.
 */
export const FEED_DAY_SHARE = 0.5;

export type SupplyBasis = 'logged' | 'planned';

/** One feed entry from the log: whose, when, and — for a bottle — how much went into it. */
export interface FeedEntry {
  kind: 'bottle' | 'breastfeed';
  /** The baby it was for. Twins' feeds are two feeds, however close together. */
  childId: string | null;
  startMs: number;
  /** A bottle's volume in ml; null for a breastfeed or a bottle logged without one. */
  ml: number | null;
}

/** The complete local days the log's rates are read over: the seven before today, oldest first. */
export function feedRateDays(timeZone: string, nowMs: number): DayBounds[] {
  const out: DayBounds[] = [];
  for (let back = RATE_WINDOW_DAYS; back >= 1; back -= 1)
    out.push(shiftDay(timeZone, nowMs, -back));
  return out;
}

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/** Each baby's entries, oldest first. */
function byChild(entries: readonly FeedEntry[]): FeedEntry[][] {
  const groups = new Map<string, FeedEntry[]>();
  for (const e of [...entries].sort((a, b) => a.startMs - b.startMs)) {
    const key = e.childId ?? '';
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.values()];
}

/** When each feed began: an entry within `SAME_FEED_MS` of the one before it joins that feed. */
function feedStarts(entries: readonly FeedEntry[]): number[] {
  const starts: number[] = [];
  for (const list of byChild(entries)) {
    let prev: number | null = null;
    for (const e of list) {
      if (prev === null || e.startMs - prev >= SAME_FEED_MS) starts.push(e.startMs);
      prev = e.startMs;
    }
  }
  return starts.sort((a, b) => a - b);
}

export interface LoggedFeeds {
  /** Whole feeds a day, as the household's own middle day has them. */
  perDay: number;
  /** How many complete days that came from. */
  days: number;
}

/**
 * FEEDS A DAY, FROM THE LOG — every baby's, because every feed would come out of the one stash.
 * Only complete local days (`feedRateDays`: today is half a day), only days with at least
 * `FEED_DAY_SHARE` of the household's own middle count, and at least `MIN_USE_DAYS` of them; the
 * answer is the middle of those days, in whole feeds. Null below that: the rhythm stands in.
 */
export function feedsPerDayFromLog(
  entries: readonly FeedEntry[],
  days: readonly DayBounds[],
): LoggedFeeds | null {
  const starts = feedStarts(entries);
  const counts = days
    .map(d => starts.filter(s => s >= d.startMs && s < d.endMs).length)
    .filter(n => n > 0);
  const usual = median(counts);
  if (usual === null) return null;
  const counted = counts.filter(n => n >= usual * FEED_DAY_SHARE);
  if (counted.length < MIN_USE_DAYS) return null;
  const perDay = Math.round(median(counted) ?? 0);
  return perDay > 0 ? { perDay, days: counted.length } : null;
}

/**
 * THE USUAL BOTTLE — the middle of the bottles logged, in ml. A bottle within `SAME_FEED_MS` of a
 * breastfeed for the same baby is a top-up, part of a feed that was mostly at the breast, and is
 * left out: its small volume is not the size of a feed. Null with no whole bottle logged.
 */
export function usualBottleMl(entries: readonly FeedEntry[]): number | null {
  const sizes: number[] = [];
  for (const list of byChild(entries)) {
    const nursed = list.filter(e => e.kind === 'breastfeed').map(e => e.startMs);
    for (const e of list) {
      if (e.kind !== 'bottle' || e.ml === null || e.ml <= 0) continue;
      if (nursed.some(n => Math.abs(n - e.startMs) < SAME_FEED_MS)) continue;
      sizes.push(e.ml);
    }
  }
  return median(sizes);
}

/**
 * HOW MANY FEEDS A DAY THIS HOUSEHOLD HAS WRITTEN DOWN, from the rules they set — the fallback while
 * the log is too thin to count from.
 *
 * An interval says it in one number; set times say it by counting. Either kind of feeding rule
 * counts, because either kind of feed would empty a bottle. Null when they have written neither.
 */
export function feedsPerDayFrom(rules: readonly Rule[]): number | null {
  const feeding = rules.filter(r => r.isActive && isFeeding(r.activity));
  const interval = feeding.find(r => r.ruleType === 'INTERVAL' && (r.everyMinutes ?? 0) > 0);
  if (interval !== undefined) {
    const every = interval.everyMinutes ?? 0;
    return Math.round((24 * 60) / every);
  }
  const times = feeding.filter(r => r.ruleType === 'FIXED' && r.atLocalTime !== null).length;
  return times > 0 ? times : null;
}

/** The daily need in millilitres, or null when either half of it is unknown. */
export function plannedDailyMl(
  feedsPerDay: number | null,
  perFeedMl: number | null,
): number | null {
  if (feedsPerDay === null || perFeedMl === null) return null;
  if (feedsPerDay <= 0 || perFeedMl <= 0) return null;
  return feedsPerDay * perFeedMl;
}

export interface OutlookInput {
  totalMl: number;
  /** Feeds a day from the log (`feedsPerDayFromLog`), or null while it is too thin. */
  loggedFeedsPerDay: number | null;
  /** Feeds a day from the rhythm they set (`feedsPerDayFrom`) — the fallback. */
  plannedFeedsPerDay: number | null;
  /** The usual bottle in ml (`usualBottleMl`, else the feeding rule's target), or null. */
  bottleMl: number | null;
  /** Some of the window's feeds were at the breast: the stash's own pace is worth a mention. */
  breastfeeds: boolean;
  /** Millilitres taken out of the stash in the window — the stash's own pace. */
  usedMl: number;
  /** How many USE entries that was. */
  useCount: number;
  /** How many days of ledger history the window actually covers. */
  daysCovered: number;
}

export interface SupplyOutlook {
  /** Whole days the stash covers if every feed came from it; 0 when it does not cover one yet. */
  days: number;
  /** Whole hours, only when `days` is 0 — at least 1, so the card never reads "0". */
  hours: number;
  /** The daily need: `feedsPerDay` × `bottleMl`. */
  perDayMl: number;
  feedsPerDay: number;
  bottleMl: number;
  /** Where the feeds a day came from: the household's log, or the rhythm it set. */
  basis: SupplyBasis;
  /**
   * AT THE PACE THE STASH HAS ACTUALLY GONE DOWN — only for a household that also nurses, and only
   * once that pace is a rate (`MIN_USE_ENTRIES` over `MIN_USE_DAYS`). The second figure, never the
   * headline: it answers "at this week's mix of breast and bottle", which changes with the mix.
   */
  pace: { days: number; perDayMl: number } | null;
}

/**
 * The card's right-hand column, or null when there is nothing honest to put in it: an empty stash,
 * or no daily need to divide by (no feeds a day from the log or a rhythm, or no usual bottle) —
 * §10b drops the column rather than showing a dash.
 */
export function supplyOutlook(input: OutlookInput): SupplyOutlook | null {
  if (input.totalMl <= 0) return null;
  const feedsPerDay = input.loggedFeedsPerDay ?? input.plannedFeedsPerDay;
  const bottleMl = input.bottleMl;
  const perDayMl = plannedDailyMl(feedsPerDay, bottleMl);
  if (perDayMl === null || feedsPerDay === null || bottleMl === null) return null;
  const exact = input.totalMl / perDayMl;
  const days = Math.floor(exact);
  const window = Math.min(Math.max(1, input.daysCovered), RATE_WINDOW_DAYS);
  const measured =
    input.usedMl > 0 && input.useCount >= MIN_USE_ENTRIES && input.daysCovered >= MIN_USE_DAYS
      ? input.usedMl / window
      : null;
  return {
    days,
    // A STASH THAT IS NOT A DAY YET IS STILL SOMETHING (the owner, 2026-09-20: "if the stash is
    // not enough for even a day yet, reword it from last about 0oz to something else that is
    // less demotivating"). Hours are the honest smaller unit — a first morning's pumping is
    // nine hours of bottles, and that is a true sentence and a kinder one than a zero.
    hours: days >= 1 ? 0 : Math.max(1, Math.round(exact * 24)),
    perDayMl,
    feedsPerDay,
    bottleMl,
    basis: input.loggedFeedsPerDay !== null ? 'logged' : 'planned',
    pace:
      input.breastfeeds && measured !== null
        ? { days: Math.floor(input.totalMl / measured), perDayMl: measured }
        : null,
  };
}
