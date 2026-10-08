/**
 * THE DAY DOES NOT END AT MIDNIGHT FOR A PARENT.
 *
 * Every occurrence this engine produces is bounded to one local day: `intervalOccurrences`
 * clips its chain at `dayEndMs`, `slotTime` lays a fixed slot on `ctx.dayStartMs`, and
 * `scheduleDay` puts them together for that day and no other. That is right for the Schedule
 * tab's record of a day, and wrong for the question Today actually asks — "what is next?" — in
 * the last hours before midnight, when the honest answer lives on the other side of it.
 *
 * At 11:39 p.m. the owner found Up next showing three rows from that morning, all of them
 * already missed, because there was nothing left in the day to show (2026-09-17: "the next
 * activity falls of another day and isn't even shown in today's list"). Nothing was broken;
 * the window was simply the wrong size for the question.
 *
 * So this runs the same engine again on the days AFTER the one in `ctx`, and hands back what it
 * finds. It computes nothing itself — no second definition of a slot to drift from the first —
 * and the caller decides how many rows to show and how to label a time that is not today's.
 */
import { scheduleDay, type ScheduleDay, type ScheduleOptions } from './today';
import { dayPlus, localDaysBetween } from './time';
import type { EngineContext, Occurrence, Rule, Session } from './types';

export interface AheadOptions extends ScheduleOptions {
  /** How many local days past `ctx`'s to look. Two covers a rule that skips tomorrow. */
  days?: number;
  /** Stop once this many rows are in hand. */
  want?: number;
  /**
   * Days the caller already built with `scheduleDay`, keyed by how many local days past
   * `ctx` they are (1 is tomorrow). Today builds tomorrow for the Schedule tab and passes
   * it in, so the same day is not built again on every minute and every save. The day has
   * to be that call's own result — same rules, sessions, options and day start. A different
   * day would change which rows come back.
   */
  knownDays?: ReadonlyMap<number, ScheduleDay>;
}

/**
 * The soonest slots on the days after `ctx`'s, one per rule, soonest first.
 *
 * ONE ROW PER RULE, for the reason Today's NEXT already keeps one: a three-hourly bottle has
 * eight slots tomorrow and they all say the same thing. The first of them is the answer to
 * "what is next"; the other seven are a scroll.
 *
 * ONLY WHAT IS STILL AHEAD, and only what genuinely belongs to the day it was computed for.
 * The second guard is not paranoia — a RELATIVE rule anchored to the last feed resolves
 * against a session from TODAY, so asking for tomorrow's copy of it produces a time on today.
 * Rather than enumerate which rule types can do that (and miss the next one), anything that
 * lands outside the day it was asked for is dropped. A household loses a row it could not have
 * been told truthfully anyway; nobody is shown a time that is already in the past.
 */
export function scheduleAhead(
  rules: readonly Rule[],
  sessions: readonly Session[],
  ctx: EngineContext,
  opts: AheadOptions = {},
): Occurrence[] {
  const { days = 2, want = 3, knownDays, ...dayOpts } = opts;
  const out: Occurrence[] = [];
  const seen = new Set<string>();
  for (let d = 1; d <= days && out.length < want; d += 1) {
    const startMs = dayPlus(ctx.timeZone, ctx.dayStartMs, d);
    const endMs = dayPlus(ctx.timeZone, startMs, 1);
    const day =
      knownDays?.get(d) ?? scheduleDay(rules, sessions, { ...ctx, dayStartMs: startMs }, dayOpts);
    const rows = day.occurrences
      .filter(o => o.atMs >= startMs && o.atMs < endMs && o.atMs > ctx.nowMs)
      .filter(o => o.status === 'UPCOMING')
      .sort((a, b) => a.atMs - b.atMs || a.ruleId.localeCompare(b.ruleId));
    for (const o of rows) {
      if (out.length >= want) break;
      if (seen.has(o.ruleId)) continue;
      seen.add(o.ruleId);
      out.push(o);
    }
  }
  return out;
}

/**
 * `Tomorrow`, a weekday name, or null for something on the day the caller is already showing.
 *
 * A row that reads `9:00 AM` beside one that reads `11:45 PM` is a row a parent will read as
 * this morning — which is exactly the misreading that makes an across-midnight list worse than
 * no list. The day has to travel with the clock, so this returns the word and the caller puts
 * it in front of the time.
 */
export function dayAheadLabel(
  when: Pick<EngineContext, 'timeZone' | 'nowMs'> & { atMs: number },
  weekdayOf: (atMs: number) => string,
): string | null {
  const n = localDaysBetween(when.timeZone, when.nowMs, when.atMs);
  if (n <= 0) return null;
  return n === 1 ? 'Tomorrow' : weekdayOf(when.atMs);
}

/**
 * `Today`, `Yesterday`, `Last Thursday` — the day a past event happened, for a card that has
 * room for the day and the time on two lines (the owner, 2026-09-19, on the Baby care strip:
 * "just add detail when last showered happen 'Last Thursday' 'at 9.38am'").
 *
 * IT IS NOT `agoLabel`, and the difference is the point. "5d ago" is arithmetic a parent has to
 * turn back into a day before it means anything; the weekday IS the thing they remember. Past a
 * week the weekday stops being a memory and starts being ambiguous — "last Thursday" said on a
 * Tuesday nine days later names the wrong Thursday — so beyond that this returns null and the
 * caller falls back to whatever it says about a thing that happened a while ago.
 *
 * The weekday comes from the caller for the same reason `dayAheadLabel`'s does: `Intl` knows the
 * word, in the household's zone, and core does not carry a table of names.
 */
export function dayBehindLabel(
  when: Pick<EngineContext, 'timeZone' | 'nowMs'> & { atMs: number },
  weekdayOf: (atMs: number) => string,
): string | null {
  const n = localDaysBetween(when.timeZone, when.nowMs, when.atMs);
  if (n > 0) return null;
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  return n >= -6 ? `Last ${weekdayOf(when.atMs)}` : null;
}
