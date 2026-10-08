/**
 * The schedule for a day, all rules together (docs/SCHEDULE_LOGIC.md §3, §7; NOTIFICATIONS
 * §4): interval rules walk their own chains; fixed and relative slots are laid out and then
 * sessions are assigned across them — a session takes the NEAREST open slot of its activity,
 * a slot takes the FIRST session that reaches it, and a slot that is done is never re-matched
 * (acceptance test 5.3 and 5.6). Cadence rules fold in last.
 */
import { cadenceOccurrences } from './cadence';
import { dayStartOf } from './time';
import { fixedStatus, resolveAnchors, slotTime, withinSlot, type Anchors } from './fixed';
import { intervalOccurrences, type IntervalResult } from './interval';
import { feedEitherKind, isFeeding, sessionsFor } from './sessions';
import { householdStartFor, slotsBeginAt } from './start';
import {
  MIN,
  occurrence,
  type EngineContext,
  type Occurrence,
  type Rule,
  type Session,
} from './types';

export interface ScheduleDay {
  /** Every occurrence of the day, sorted by time. GAP rows are kept for reporting. */
  occurrences: Occurrence[];
  /** Per interval rule, its chain and its one open slot. */
  intervals: Map<string, IntervalResult>;
  /** Sessions that satisfied no slot of any rule they could have. */
  extras: Session[];
  /**
   * Interval slots from before this day that are still DUE (`IntervalResult.carried`): what
   * Today's open rows lead with just after midnight. Absent on a day built by hand.
   */
  carried?: Occurrence[];
}

export interface ScheduleOptions {
  /** A rule on a disabled module is hidden and never materialises (PRODUCT_SPEC §7). */
  enabled?: (activity: Rule['activity']) => boolean;
}

export function scheduleDay(
  rules: readonly Rule[],
  sessions: readonly Session[],
  ctx: EngineContext,
  opts: ScheduleOptions = {},
): ScheduleDay {
  const live = rules.filter(r => r.isActive && (opts.enabled ? opts.enabled(r.activity) : true));
  const out: Occurrence[] = [];
  const intervals = new Map<string, IntervalResult>();
  const extras: Session[] = [];
  const carried: Occurrence[] = [];

  for (const r of live.filter(r => r.ruleType === 'INTERVAL')) {
    const res = intervalOccurrences(r, sessions, ctx);
    intervals.set(r.id, res);
    out.push(...res.occurrences);
    extras.push(...res.extra);
    if (res.carried !== null) carried.push(res.carried);
  }

  // fixed + relative: lay out the slots, then assign sessions nearest-first, in time order
  const fixedRules = live.filter(r => r.ruleType === 'FIXED' || r.ruleType === 'RELATIVE');
  const anchorsByChild = new Map<string, Anchors>();
  const anchorsFor = (childId: string | null): Anchors => {
    const key = childId ?? '';
    let a = anchorsByChild.get(key);
    if (!a) {
      a = resolveAnchors(sessions, ctx, childId);
      anchorsByChild.set(key, a);
    }
    return a;
  };
  const slots = fixedRules.flatMap(r => {
    const t = slotTime(r, ctx, anchorsFor(r.childId));
    return t
      ? [{ rule: r, atMs: t.atMs, provisional: t.provisional, matched: null as Session | null }]
      : [];
  });
  const claimed = new Set<string>();
  const candidates = new Map<string, Session[]>();
  for (const s of slots) {
    if (!candidates.has(s.rule.id)) candidates.set(s.rule.id, sessionsFor(s.rule, sessions));
  }
  const allSessions = [
    ...new Map(slots.flatMap(s => candidates.get(s.rule.id) ?? []).map(s => [s.id, s])).values(),
  ]
    .filter(s => s.startMs <= ctx.nowMs)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  for (const s of allSessions) {
    const open = slots
      .filter(slot => slot.matched === null && (candidates.get(slot.rule.id) ?? []).includes(s))
      .filter(slot => withinSlot(slot.rule, slot.atMs, s, ctx.timeZone));
    // NEAREST, BUT NEVER REACHING PAST AN OPEN SLOT INTO A LATER ONE. A `DAY`-scoped slot is
    // satisfied by any session of its own day (`withinSlot`), which is what lets a vitamin given
    // at 7:48 p.m. answer its 8 a.m. reminder. That long reach runs FORWARD too, and forward it
    // is wrong: on a cream set to three times a day, ONE application at 10 a.m. took the 2 p.m.
    // slot — the nearest open one — and left 8 a.m. standing. The wrong thing was answered, and
    // the day showed one fewer outstanding slot than it had (the owner, 2026-09-16: "I've logged
    // once, it does not show alert that it's not enough for today").
    //
    // So a session prefers the slots it has actually reached — anything up to its own ordinary
    // match window ahead of it — and only falls back to a later slot when it has reached none.
    // The fallback is what keeps a dose given genuinely early (06:30 against a 09:00 reminder,
    // or the only two slots left on the day an item was added) matching at all. For a
    // MINUTES-scoped slot this partition is a no-op: `withinSlot` already refuses a session more
    // than one window before the slot, so every eligible slot is in the first group.
    const reached = open.filter(
      slot => slot.atMs <= s.startMs + slot.rule.matchWindowMinutes * MIN,
    );
    const win = (reached.length > 0 ? reached : open)
      .slice()
      .sort((a, b) => Math.abs(a.atMs - s.startMs) - Math.abs(b.atMs - s.startMs))[0];
    if (win) {
      win.matched = s;
      claimed.add(s.id);
    }
  }
  /**
   * YOU CANNOT MISS BREAKFAST IF YOU GAVE BREAKFAST (the owner, 2026-09-19: solids logged at
   * 11:15 against a 9:15 slot "says that it's already missed but still showing in next
   * activities, and the solid module in quick log is red bordered with ! Missed").
   *
   * They are right, and it was one boundary doing three wrong things. `withinSlot` stops
   * matching a MINUTES-scoped slot once a session is past `lateWindowMinutes` — 90 by default —
   * so a meal two hours behind its slot matched nothing. The slot then went MISSED, which put
   * it in Up next (misses belong there, `nextCard.ts`) and turned the tile's border red, while
   * the entry the parent had just made became an unmatched "extra". Three symptoms, one cause:
   * the day said the thing had not happened, and it had.
   *
   * So a slot nobody answered gets a SECOND look before it is called missed: the earliest
   * unclaimed session of its own activity, later the same local day, closes it. That is the
   * question a fixed slot is really asking — `matchScope: 'DAY'` has always asked it in so many
   * words — and `fixedStatus` then calls it LATE with the minutes, which is the honest word: it
   * was done, later than planned.
   *
   * IT IS A SECOND PASS, not a wider `withinSlot`, and deliberately so. The first pass is
   * unchanged, so nothing that matches today matches differently: a session still takes the
   * nearest slot it has REACHED, and one given genuinely early still cannot reach forward past
   * an open slot into a later one (the loop above records why that matters on a three-a-day
   * cream). Only a slot that was heading for MISSED can be claimed here, only by a session
   * nothing else wanted, and only within its own day — the zone is what bounds the reach, which
   * is why a context without one skips this entirely rather than guessing at a day boundary.
   */
  if (ctx.timeZone !== undefined) {
    const tz = ctx.timeZone;
    const seriesOf = (r: Rule): string => seriesKey({ ruleId: r.id, rule: r });
    const byTime = slots.slice().sort((a, b) => a.atMs - b.atMs);
    /**
     * YOU CANNOT MISS BEDTIME IF YOU PUT THE BABY DOWN EARLY (the owner, 2026-09-20, with the
     * clock at 20:31: "I just logged the bedtime at 20.32pm, why doesnt this update when it's
     * done early?").
     *
     * A MINUTES-scoped slot accepted a session from one match window before it — twenty-five
     * minutes — and an hour and a half after. That asymmetry has no reason behind it. A bedtime
     * at 21:00 that happened at 20:32 is twenty-eight minutes early, so it matched nothing: the
     * hero card and the timer bar went on saying "Bedtime · 9:00 PM · NEXT" with the baby
     * already asleep, and the sleep itself became an unmatched extra. A household on set feeding
     * times fed at 09:30 against a 10:00 slot had the same day: `10:00 AM MISSED`, red on Today
     * all morning, for a feed they had just given (the schedule audit's A2, 2026-09-19).
     *
     * THE REACH IS THE LATE ONE, MIRRORED — `lateWindowMinutes` before the slot — and capped at
     * HALF THE GAP to the previous slot of the same series, so a 10:00 feed can never be
     * answered by the 08:30 one's.
     *
     * IT RUNS BEFORE THE LATE RESCUE BELOW, and the order is the whole of the care taken here.
     * The two passes reach in opposite directions and would otherwise fight over one entry: with
     * a nap at 15:00 and a bedtime at 21:00, the late rescue offered the 20:32 sleep to the NAP —
     * five and a half hours late — and the bedtime slot went on standing. An entry that is
     * minutes early for the slot in front of a parent is about that slot, not about one they
     * passed hours ago. Nothing the late rescue settles is touched: it takes what came AFTER a
     * slot, earliest slot first, exactly as the owner set it on 2026-09-16 ("just mark the first
     * one as missed and log my entry to the closest schedule") and again on 2026-09-19 (the 9:15
     * breakfast given at 11:15), and no session is ever claimed twice.
     */
    for (const slot of byTime) {
      if (slot.matched !== null || slot.rule.matchScope === 'DAY') continue;
      const prev = byTime
        .filter(o => o !== slot && seriesOf(o.rule) === seriesOf(slot.rule) && o.atMs < slot.atMs)
        .slice(-1)[0];
      const reach = Math.min(
        slot.rule.lateWindowMinutes * MIN,
        prev === undefined ? Number.POSITIVE_INFINITY : (slot.atMs - prev.atMs) / 2,
      );
      const earlier = allSessions
        .filter(
          s =>
            !claimed.has(s.id) &&
            (candidates.get(slot.rule.id) ?? []).includes(s) &&
            s.startMs < slot.atMs &&
            s.startMs >= slot.atMs - reach &&
            dayStartOf(tz, s.startMs) === dayStartOf(tz, slot.atMs),
        )
        // the NEAREST one: with two unclaimed feeds before a slot, the later is the one it is
        .slice(-1)[0];
      if (earlier !== undefined) {
        slot.matched = earlier;
        claimed.add(earlier.id);
      }
    }
    /**
     * YOU CANNOT MISS BREAKFAST IF YOU GAVE BREAKFAST (the owner, 2026-09-19: solids logged at
     * 11:15 against a 9:15 slot "says that it's already missed but still showing in next
     * activities, and the solid module in quick log is red bordered with ! Missed").
     *
     * They are right, and it was one boundary doing three wrong things. `withinSlot` stops
     * matching a MINUTES-scoped slot once a session is past `lateWindowMinutes` — 90 by default —
     * so a meal two hours behind its slot matched nothing. The slot then went MISSED, which put
     * it in Up next (misses belong there, `nextCard.ts`) and turned the tile's border red, while
     * the entry the parent had just made became an unmatched "extra". Three symptoms, one cause:
     * the day said the thing had not happened, and it had.
     *
     * So a slot nobody answered gets a SECOND look before it is called missed: the earliest
     * unclaimed session of its own activity, later the same local day, closes it. That is the
     * question a fixed slot is really asking — `matchScope: 'DAY'` has always asked it in so many
     * words — and `fixedStatus` then calls it LATE with the minutes, which is the honest word: it
     * was done, later than planned.
     *
     * IT IS A SECOND PASS, not a wider `withinSlot`, and deliberately so. The first pass is
     * unchanged, so nothing that matches today matches differently: a session still takes the
     * nearest slot it has REACHED, and one given genuinely early still cannot reach forward past
     * an open slot into a later one (the loop above records why that matters on a three-a-day
     * cream). Only a slot that was heading for MISSED can be claimed here, only by a session
     * nothing else wanted, and only within its own day — the zone is what bounds the reach, which
     * is why a context without one skips this entirely rather than guessing at a day boundary.
     */
    for (const slot of slots) {
      if (slot.matched !== null) continue;
      /*
        A SLOT FROM BEFORE THE HOUSEHOLD EXISTED IS RESCUED ONLY BY A FIX — an entry that itself
        happened before the household did, backdated with its real time (`start.ts`, the owner,
        2026-09-25). This pass exists so a slot is not called MISSED when the thing was done
        later, and such a slot is never going to be called missed; what it would do instead is
        bill the first feed a parent logs after signing up to a 7 a.m. slot from before they had
        the app, "5 h late". A feed at noon is about the household's own day.
      */
      const began = householdStartFor(slot.rule, ctx);
      const fixOnly = began !== null && slot.atMs < began ? began : null;
      const later = allSessions.find(
        s =>
          !claimed.has(s.id) &&
          (candidates.get(slot.rule.id) ?? []).includes(s) &&
          s.startMs > slot.atMs &&
          (fixOnly === null || s.startMs < fixOnly) &&
          dayStartOf(tz, s.startMs) === dayStartOf(tz, slot.atMs),
      );
      if (later !== undefined) {
        slot.matched = later;
        claimed.add(later.id);
      }
    }
  }

  for (const slot of slots) {
    out.push(
      occurrence(slot.rule, slot.atMs, 'UPCOMING', {
        ...fixedStatus(slot.rule, slot.atMs, slot.matched, ctx),
        provisional: slot.provisional,
      }),
    );
  }
  /**
   * AN UNMATCHED FEED IS STILL A FEED. This asked whether any fixed rule named the session's own
   * activity, so a household on set BOTTLE times whose 09:30 entry was a BREASTFEED had that
   * entry fall out of the day's accounting entirely — not a slot, not an extra, nothing. It is
   * the same mistake `feedEitherKind` was written to fix at the other end (a breastfeed closes a
   * bottle's slot), left behind in the one place that counts what nothing closed.
   */
  const coveredBy = (s: Session): boolean =>
    fixedRules.some(r => (feedEitherKind(r) ? isFeeding(s.type) : r.activity === s.type));
  for (const s of allSessions) {
    if (!claimed.has(s.id) && coveredBy(s) && !extras.some(e => e.id === s.id)) extras.push(s);
  }

  for (const r of live.filter(r => r.ruleType === 'CADENCE'))
    out.push(...cadenceOccurrences(r, sessions, ctx));

  /**
   * SLOTS FROM BEFORE THE RULE EXISTED ARE NOT SLOTS — the invariant `effective_from` was added
   * for ("a rule created at 4 p.m. did not miss the morning", domain-types.ts), applied here,
   * once, for every kind of rule.
   *
   * It used to be honored in `fixed.ts` alone, so an interval or a cadence set up at eleven in
   * the morning still projected the morning it was not there for — and a household one minute
   * old opened Today to a list of things it had already missed (the owner, 2026-09-17, at 10:52
   * on a fresh account: three rows reading `9:00 AM · not logged`). Nothing was late. The app
   * had simply counted a day it did not exist for and billed the parent for it.
   *
   * Filtering here rather than in each generator is deliberate: four generators with the same
   * guard is four places for it to be forgotten, and it was, three times out of four. The
   * intervals map and the extras are untouched — a session logged before the rule was written
   * is still a session, it just has no slot to have answered.
   *
   * A RULE THE HOUSEHOLD STARTED WITH IS THE EXCEPTION, on its first day (the owner, 2026-09-25:
   * *"It should still show from midnight"*). Its day runs from midnight, and the slots before the
   * household existed stay on it as skipped rows a parent can still answer — `slotsBeginAt` is the
   * one boundary both cases ask (`start.ts`).
   */
  const dated = out.filter(o => o.atMs >= slotsBeginAt(o.rule, ctx));
  dated.sort((a, b) => a.atMs - b.atMs || a.ruleId.localeCompare(b.ruleId));
  return {
    occurrences: oncePerSession(dated),
    intervals,
    extras,
    carried: carried.filter(o => o.atMs >= slotsBeginAt(o.rule, ctx)),
  };
}

/**
 * ONE ENTRY, ONE ROW. A household that keeps BOTH a feeding interval and a set time for the
 * same feed — the doc says a rhythm is one or the other, the table does not stop them — had one
 * breastfeed at 10:05 close the interval's 10:00 slot AND the fixed 10:00 slot, so the day drew
 * two identical `10:00 AM DONE` rows and counted the feed twice (`scheduled: 8, done: 2` for a
 * single feed, the audit's A4). To a parent that is the app stuttering, and it is the same
 * complaint as the two pending tummy times (`nextCard.ts`) one level down.
 *
 * The SESSION is the fact, so the session is the key: two occurrences matched to one entry are
 * one event seen twice, and the more specific rule keeps the row. A set time names the moment
 * ("the 10 o'clock bottle"); an interval names a rhythm; so FIXED and RELATIVE win over
 * INTERVAL, and between two of a kind the earlier row stands.
 *
 * IT CANNOT COLLAPSE TWO DIFFERENT EVENTS: an unmatched slot has `matchedId: null` and is never
 * grouped, and a nap chain and a bedtime slot only ever share a matched id when the same sleep
 * answered both — which is precisely when one row is right.
 */
function oncePerSession(rows: readonly Occurrence[]): Occurrence[] {
  const best = new Map<string, Occurrence>();
  const rank = (o: Occurrence): number => (o.rule.ruleType === 'INTERVAL' ? 1 : 0);
  for (const o of rows) {
    if (o.matchedId === null) continue;
    const held = best.get(o.matchedId);
    if (held === undefined || rank(o) < rank(held)) best.set(o.matchedId, o);
  }
  return rows.filter(o => o.matchedId === null || best.get(o.matchedId) === o);
}

/** The rows a TILE reasons about: today's, without the GAP marker and the look-aheads. */
export const listedToday = (day: ScheduleDay): Occurrence[] =>
  day.occurrences.filter(o => o.status !== 'GAP' && !o.future);

/**
 * TODAY'S ROWS WITH THE ANSWERED MISSES DROPPED — what the Quick tiles and the NEXT list read.
 *
 * A miss the household has since answered is history, not outstanding work. Log a bottle at
 * 2:03 against a 2-hourly rule and the morning's missed slots are a record of the morning; they
 * are not three things still to do, they must not keep the tile red, and they must not fill NEXT
 * with 9 a.m. (the owner, 2026-09-16: "I just logged the bottle at 2.03 and the time now is
 * 2.05 — it should remove the mark and move on to the next schedule").
 *
 * THE DAY'S OWN LIST STILL SHOWS EVERY ONE OF THEM. That is the difference this function
 * exists for, and it is the whole of the disagreement that produced it: the Schedule tab's list
 * is a RECORD, so every missed slot stands there with its own row; Today is a WORKING SURFACE,
 * so it carries what is still open. The engine used to fold answered misses away for everybody,
 * which made the record wrong; then nothing folded them, which made Today wrong. One rule, one
 * place, applied by the two readers that want it.
 *
 * ANSWERED IS PER SERIES, because a series is what "we have moved on" is about. A feeding
 * interval is one rule either kind of feed satisfies, so a breastfeed answers a bottle's slot.
 * A CARE ITEM IS ONE SERIES TOO, however many rules its times are: each reminder time is stored
 * as a rule of its own (`data/care.ts`), and keying this on the rule left every missed dose
 * standing all day with nothing a parent could do about it — a cream set to three times a day
 * and applied once at 6 p.m. took the 2 p.m. slot, and the 8 a.m. one stayed red until
 * midnight. You cannot apply a cream twice at once to catch up (the owner, 2026-09-16: "if
 * it's missed then just move on to next entry … I can't apply twice at the same time as that
 * would be pointless. Just mark the first one as missed and log my entry to the closest
 * schedule"). So the item's latest answered dose closes the misses before it, exactly as an
 * interval's latest feed does, and the evening slot still stands because that one IS still to
 * come. The Schedule tab's list keeps every missed dose: that is the record, and the record is
 * what "mark the first one as missed" asks for.
 *
 * TUMMY TIME IS THE SAME SHAPE and reaches this by the same route: it is a count per day rather
 * than an interval (the owner, 2026-09-16: "tummy time should not be set every x hours, but
 * rather how many times done in a day. just like 3 times a day medication cream"), so it is
 * several DAY-scoped FIXED rules and `seriesKey` groups them by activity. Nothing about that is
 * special-cased below — the scope is the fact, and the fact is stored on the rule.
 */
/**
 * WHAT "THE SAME THING" IS, for the purpose of closing a miss.
 *
 * Every rule that is not an interval belongs to a SERIES: the rules of one activity, for one
 * child, on one care item, are one routine split across the day, and answering any of them means
 * the routine moved on. That is a care item's three times (each one its own rule, keyed by the
 * item so two creams never answer each other), tummy time's three goes, and — since 2026-09-19 —
 * the SET TIMES a household writes on the Intervals page instead of an interval (the owner:
 * "let users to create customized daily schedule too that they can use for everyday's schedule
 * instead of interval"). Those are MINUTES-scoped FIXED rules, and the scope is the right one
 * for matching (a 10:00 feed is the 10:00 feed, not any feed of the day); but a household on
 * 7:00 · 10:00 · 13:00 that fed at 13:05 has moved on from 10:00 exactly as the cream household
 * moved on from 8 a.m., and keying this on the rule left the 10:00 miss red on Today all
 * afternoon. So the key is the routine, and the scope decides only what a session can answer.
 *
 * An INTERVAL is its own series: it is one rule that walks a chain, and the chain already
 * leaves exactly one slot open. Bottle and breastfeed are ONE routine — feeding — because either
 * kind of feed answers either kind of slot (`feedEitherKind`).
 *
 * The child is in the key because two babies are two routines: Emma's morning tummy time says
 * nothing about Liam's.
 */
const seriesKey = (o: Pick<Occurrence, 'ruleId' | 'rule'>): string =>
  o.rule.ruleType === 'INTERVAL'
    ? o.ruleId
    : `${isFeeding(o.rule.activity) ? 'feeding' : o.rule.activity}:${o.rule.childId ?? ''}:${o.rule.careItemId ?? ''}`;

export function openToday(day: ScheduleDay): Occurrence[] {
  // a slot from before midnight that is still DUE leads (`IntervalResult.carried` says why)
  const carried = day.carried ?? [];
  const rows = listedToday(day);
  const answeredAt = new Map<string, number>();
  for (const o of rows) {
    if (o.status !== 'DONE' && o.status !== 'LATE' && o.status !== 'SKIPPED') continue;
    // a skip nobody chose answers nothing: it is the part of the first day before the household
    if (o.beforeStart === true) continue;
    const key = seriesKey(o);
    const at = answeredAt.get(key);
    if (at === undefined || o.atMs > at) answeredAt.set(key, o.atMs);
  }
  return [
    ...carried,
    ...rows.filter(o => {
      if (o.status !== 'MISSED') return true;
      const answered = answeredAt.get(seriesKey(o));
      return answered === undefined || o.atMs > answered;
    }),
  ];
}

/*
  `dayRows` — every row of today, what the Schedule screen's day list drew before `listedToday`
  took that job — went on 2026-09-26 with nothing calling it. The rule it recorded stands: an
  answered stretch is NOT folded into one GAP row with a count (the owner, 2026-09-16), because the
  day's list is the record, and a record that summarises the part you want to look at is not one.
*/

/** The earliest thing still to happen today — Today's NEXT card (PRODUCT_SPEC §3.1). */
export function nextEvent(day: ScheduleDay): Occurrence | null {
  return (
    day.occurrences
      .filter(o => !o.future && (o.status === 'UPCOMING' || o.status === 'DUE'))
      .sort((a, b) => a.atMs - b.atMs)[0] ?? null
  );
}

/** The pump card: the interval rule's next slot and what it was measured from. */
export interface IntervalNext {
  rule: Rule;
  atMs: number;
  status: 'DUE' | 'UPCOMING';
  lastMs: number | null;
  everyMinutes: number;
  missedToday: number;
}

export function nextInterval(
  rule: Rule,
  sessions: readonly Session[],
  ctx: EngineContext,
): IntervalNext | null {
  if (rule.ruleType !== 'INTERVAL' || !rule.isActive) return null;
  const res = intervalOccurrences(rule, sessions, ctx);
  const pool = sessionsFor(rule, sessions).filter(s => s.startMs <= ctx.nowMs);
  const last = pool[pool.length - 1] ?? null;
  const next = res.next;
  return {
    rule,
    atMs: next?.atMs ?? ctx.nowMs,
    status: next?.status === 'DUE' ? 'DUE' : 'UPCOMING',
    lastMs: last?.startMs ?? null,
    everyMinutes: rule.everyMinutes ?? 0,
    missedToday: res.missedToday,
  };
}
