/**
 * The interval engine (docs/SCHEDULE_LOGIC.md §2–§4): an interval counts from the last
 * COMPLETED session, never from the slot it was meant to fill; every completed session
 * re-anchors the chain; a slot that passes with nothing logged is MISSED and the chain keeps
 * its cadence; an EARLY session is that occurrence, off-grid; nights do what the rule says, and
 * paused hours can never be missed.
 *
 * The walk is the prototype's `intervalOccurrences` (reviewed behavior) with the zone taken
 * from the household rather than the device, MISSED at `due + max(window, miss_after)` and
 * LATE up to the late window as §3's predicates say.
 *
 * IT LAYS OUT THE WHOLE LOCAL DAY, midnight to midnight: every slot that has passed with its
 * own status, the one that is open, and the rest of the day ahead of it. Every missed slot is
 * its own row — the GAP collapse that used to fold them into one counted line is gone (the
 * owner, 2026-09-16) — and what that collapse protected is protected where it belongs: exactly
 * one slot is ever DUE, so the reminders still never build a backlog.
 *
 * AND NO GAP IN IT IS LONGER THAN THE RHYTHM (the owner, 2026-09-27): with nothing logged, each
 * day's grid starts again from its own midnight, and where one day's last slot and the next
 * day's first are further apart than the rule's own step, the walk puts slots between them
 * (`gridFills`).
 */
import {
  atTimeAfter,
  dayPlus,
  dayStartOf,
  hm,
  inWindow,
  wallMinutes,
  windowEndAfter,
} from './time';
import { intervalAnchor, sessionsFor } from './sessions';
import { householdStartFor, slotsBeginAt } from './start';
import {
  HOUR,
  MIN,
  missAtOf,
  occurrence,
  skipKey,
  type EngineContext,
  type Occurrence,
  type Rule,
  type Session,
} from './types';

const DAY_MINUTES = 24 * 60;

/**
 * The single rule that decides when the next interval slot falls (§4 `nextDue`). `prevDueMs` is
 * the slot the walk has just resolved: under ONE it is how the engine knows the night's one
 * session has already happened — an early 02:30 pump for a 03:00 slot must not produce a
 * second 03:00 slot, and the prototype's "next reading of 03:00" produced tomorrow's.
 */
export function nextDue(
  anchorMs: number,
  rule: Rule,
  timeZone: string,
  prevDueMs?: number,
): number {
  const every = (rule.everyMinutes ?? 180) * MIN;
  const mode = rule.nightMode;
  const from = rule.nightFrom;
  const to = rule.nightTo;
  const night = (ts: number): boolean =>
    mode !== 'NONE' && from !== null && to !== null && inWindow(timeZone, ts, from, to);
  let t = anchorMs + every;
  if (mode === 'LONGER' && from !== null && to !== null) {
    const nightEvery = (rule.nightEveryMinutes ?? 240) * MIN;
    /** When the night this step is in, or is stepping into, ends: the household's wake-up. */
    let wakeMs: number | null = null;
    const wake = (): number => (wakeMs ??= windowEndAfter(timeZone, anchorMs, to));
    const nightLong = ((hm(to) - hm(from) + DAY_MINUTES) % DAY_MINUTES) * MIN;
    // §4's worked example (22:40 → 02:40 on a 3 h / 4 h rule): the longer step applies when the
    // anchor is in the window OR the day-length step would land in it — its pseudo-code checks
    // only the anchor, which would make 22:40 → 01:40, and the example is what was reviewed.
    // A day step as long as the night itself can also step clean over it (a 10-hour day step
    // across an 8-hour night): that reaches the night too, and takes the night's step. The hour
    // of slack covers a night a clock change has shortened; `wake()` decides either way.
    const reaches =
      night(anchorMs) || night(t) || (nightLong > 0 && every + HOUR >= nightLong && wake() <= t);
    if (reaches) {
      t = anchorMs + nightEvery;
      /*
        THE DAY'S RHYTHM RESUMES AT WAKE-UP (the owner, 2026-09-29, diapers every 2 h by day and
        8 h by night, the day 8:30 AM to 8:00 PM: *"i have diaper change schedule at 1am, then 8am
        … but since 8am is before the day starts, the next diaper is at 4pm. This is obviously
        doesn't make sense, there needs to be some sort of rule for this"*).

        8:00 AM is still night, so the night's step applied, and nothing held it at the end of the
        night: eight hours of it ran on into the day, where the rhythm is two. So a night step may
        carry past wake-up by one day step at most: the next slot is the earlier of the night's
        step and wake-up plus the day's. 8:00 AM → 10:30 AM, not 4:00 PM.

        It is §3's "no gap longer than the rhythm" (the owner, 2026-09-27) held at the night's two
        edges: no part of a gap after wake-up is longer than the day's step, and none inside the
        night longer than the night's. At bedtime that already held — a day step that would land
        in the night takes the night's step from the same slot, so the evening's part of the gap
        is under one day step and the night's part under one night step — and a night step taken
        there that runs past the NEXT wake-up (a night step longer than the night) is held here
        the same way.

        It binds only where the night's step is longer than the time left until wake-up plus one
        day step. That is why no feeding rhythm showed it: setup's (3 h, nights 4 h from 7:30 PM
        to 7:00 AM) goes 4:00 AM → 8:00 AM, one hour into a day whose step is three, and stays
        exactly as it was; so does §4's pump at 2:50 AM → 6:50 AM. The step that ran deep into
        the day was eight hours against two.

        Not under PAUSE or ONE: their night already ends at wake-up — the window's end, or one
        day step after the night's one slot — which is the boundary this reuses (`windowEndAfter`).
      */
      if (nightEvery > every) t = Math.min(t, wake() + every);
    }
  }
  if (mode === 'PAUSE' && to !== null && night(t)) {
    // slots inside the window are not scheduled and are never counted as missed
    t = windowEndAfter(timeZone, t, to);
  } else if (mode === 'ONE' && to !== null && night(t)) {
    // one slot at night_at inside THIS night; once it has passed, the window end — never
    // tomorrow's night_at, which is what "the next reading of 03:00" would have given
    const end = windowEndAfter(timeZone, t, to);
    const one = atTimeAfter(timeZone, anchorMs, rule.nightAt ?? '03:00');
    const alreadyHad = prevDueMs !== undefined && prevDueMs === one;
    t = one < end && !alreadyHad ? one : end;
  }
  return t;
}

/**
 * A SHIFT TOO SMALL TO BE WORTH A STRIKETHROUGH. `movedFromMs` draws the old time struck
 * through beside the new one, which is worth a parent's attention when a feed at 6:13 moved a
 * 5:30 slot — and is noise when a five-minute drift turns "3:50" into "~~3:50~~ 3:55" on a row
 * nobody was looking at. Ten minutes is the same order as the double-log threshold below it:
 * under that, the two times are the same plan.
 */
const NEAR_MS = 10 * MIN;
const nearEnough = (a: number, b: number): boolean => Math.abs(a - b) < NEAR_MS;

/**
 * A RULE WRITTEN INTO A DAY ALREADY GOING gets its first slot this long after it was written (see
 * `fresh` below). Until 2026-09-25 a brand-new household's rules did too; they now lay their
 * first day out from midnight (`start.ts`).
 */
export const FIRST_SLOT_MS = 15 * MIN;

/**
 * HOW FAR BACK AN ENTRY'S CHAIN IS WALKED to reach the day, in the rule's day steps (see the carry
 * in `intervalOccurrences`): past this the chain jumps instead. A hundred and twenty is fifteen
 * days on a three-hourly rule and five on an hourly one — longer than any gap in a household still
 * logging — and it bounds the work a stale rule costs every day the planner reads.
 */
const WALK_BACK_STEPS = 120;

/**
 * THE EMPTY-DAY GRID OF ONE LOCAL DAY: where the walk below puts a rule's slots, on the day that
 * starts at `dayStartMs`, while no session anchors the chain — from the day's opening, stepped by
 * `nextDue` to the end of the day. The opening is the walk's own (`opened` there): the day's
 * midnight, one step in, for a rule the household started with and on every day after a rule's
 * first; fifteen minutes after `effectiveFromMs` on the day a rule written later was written
 * (`FIRST_SLOT_MS`). A day before the rule's first (`slotsBeginAt`) has no grid.
 *
 * It reads the day, the rule, the zone and the household's start, and never the clock or the day
 * being computed, so the day before, the day itself and the day after all see one grid for any
 * one day — which is what lets two days agree about the slots between them (`gridFills`).
 */
export function emptyDayGrid(
  rule: Rule,
  ctx: Pick<EngineContext, 'timeZone' | 'trackingFromMs'>,
  dayStartMs: number,
): number[] {
  const { timeZone } = ctx;
  const dayEndMs = dayPlus(timeZone, dayStartMs, 1);
  if (slotsBeginAt(rule, ctx) >= dayEndMs) return [];
  const opened =
    householdStartFor(rule, ctx) !== null
      ? dayStartMs
      : Math.min(Math.max(dayStartMs, rule.effectiveFromMs), dayEndMs);
  const out: number[] = [];
  let due = opened > dayStartMs ? opened + FIRST_SLOT_MS : nextDue(opened, rule, timeZone);
  for (let guard = 0; guard < 200 && due < dayEndMs; guard++) {
    out.push(due);
    const next = nextDue(due, rule, timeZone, due);
    if (!(next > due)) break;
    due = next;
  }
  return out;
}

/** PAUSE and ONE keep the night the parent chose: no slots, or one. Only these two are filled. */
const fillsWraps = (rule: Pick<Rule, 'nightMode'>): boolean =>
  rule.nightMode === 'NONE' || rule.nightMode === 'LONGER';

/**
 * NO GAP LONGER THAN THE RHYTHM (the owner, 2026-09-27, who signed up at 10:15 PM on the default
 * rhythm — every 3 h by day, every 4 h by night: *"the scheduled feeding was 9pm (already past),
 * and the next one is 4am … the gap from 9pm to 4am -> 7 hours, was definitelytoo long … we
 * couldve done added a 00.30 am(middle time) to prevent this to happen/. what if parents dont feed
 * baby or becaus eit does not show up in schedule? … having more is better then less in this
 * case"*).
 *
 * WHERE THE GAP CAME FROM. With nothing logged, each day's grid starts again from its own midnight
 * (`emptyDayGrid`), so one day's last slot and the next day's first are not a step apart: they are
 * wherever the two grids happen to end and begin. On 3 h / 4 h with the night from 7:30 PM that is
 * 9:00 PM and 4:00 AM; on a plain three-hourly rule it is 9:00 PM and 3:00 AM, a slot short every
 * night. The first entry ended it — a session anchors the chain, which then runs on with no seam —
 * which is why "the timing is fixed when user enter a real entry".
 *
 * THE RULE: no gap between two slots is longer than the step the rule itself would take there —
 * the step from the earlier day's last slot, `nextDue(last) − last`: the night's at night, the
 * day's by day. Where the wrap is longer (by more than a minute of rounding), the fewest slots
 * that bring every gap inside that step, `⌈gap ÷ step⌉ − 1`, go evenly between the two, on whole
 * minutes. The owner's 9:00 PM → 4:00 AM on a four-hour night step is one slot at 12:30 AM, the
 * middle time they named; a three-hourly day's 9:00 PM → 3:00 AM is one at midnight.
 *
 * NOT UNDER PAUSE OR ONE: a paused night has no slots and a one-slot night has one because the
 * parent chose it, and filling either would overrule them. A fill is a slot like any other — the
 * walk judges it skipped, missed, due, done or late exactly as it judges the rest — and it
 * belongs to the day its time falls in, so both days compute it from the same two slots.
 */
export function gridFills(rule: Rule, timeZone: string, lastMs: number, firstMs: number): number[] {
  if (!fillsWraps(rule)) return [];
  const gap = firstMs - lastMs;
  const step = nextDue(lastMs, rule, timeZone, lastMs) - lastMs;
  if (!(step > 0) || gap <= step + MIN) return [];
  const n = Math.ceil((gap - MIN) / step) - 1;
  const out: number[] = [];
  for (let k = 1; k <= n; k++) out.push(Math.round((lastMs + (k * gap) / (n + 1)) / MIN) * MIN);
  return out;
}

/**
 * THE EMPTY-GRID SLOTS THE WALK TAKES FOR A DAY: the fills after yesterday's last grid slot, the
 * day's grid, the fills before tomorrow's first slot, and that first slot — so a walk that runs off
 * the end of the day steps onto the grid rather than off it. The day before a rule's first has no
 * grid, so a first day opens on its own first slot.
 *
 * A FILL FROM THE EVENING BEFORE IS WALKED TOO, as the walk from a session walks yesterday's last
 * slots: it is yesterday's row, filtered out of this day's list, but at 12:10 AM an 11:30 PM fill
 * can still be the one slot DUE (`carried`), and a feed at 12:20 AM answers it, late, exactly as
 * yesterday's own walk says it did — not as an early feed of its own on this day.
 */
function emptyGridRun(
  rule: Rule,
  ctx: Pick<EngineContext, 'timeZone' | 'trackingFromMs'>,
  dayStartMs: number,
): number[] {
  const { timeZone } = ctx;
  const dayEndMs = dayPlus(timeZone, dayStartMs, 1);
  const before = emptyDayGrid(rule, ctx, dayPlus(timeZone, dayStartMs, -1));
  const today = emptyDayGrid(rule, ctx, dayStartMs);
  const after = emptyDayGrid(rule, ctx, dayEndMs);
  const between = (earlier: readonly number[], later: readonly number[]): number[] => {
    const last = earlier[earlier.length - 1];
    const first = later[0];
    return last === undefined || first === undefined ? [] : gridFills(rule, timeZone, last, first);
  };
  return [...between(before, today), ...today, ...between(today, after), ...after.slice(0, 1)];
}

/**
 * THE EMPTY DAY, whole: every slot a rule with nothing logged has on the day that starts at
 * `dayStartMs` — the fills that fall on it, and its grid. What the walk lays out before any entry
 * anchors it, for a caller that needs the day without the walk (a preview of a rhythm not yet
 * saved). A fill belongs to the day its time falls in: a 12:30 AM fill is the later day's alone.
 */
export function emptyDaySlots(
  rule: Rule,
  ctx: Pick<EngineContext, 'timeZone' | 'trackingFromMs'>,
  dayStartMs: number,
): number[] {
  const dayEndMs = dayPlus(ctx.timeZone, dayStartMs, 1);
  return emptyGridRun(rule, ctx, dayStartMs).filter(t => t >= dayStartMs && t < dayEndMs);
}

/**
 * THE NEXT `count` SLOTS OF A RULE WITH NOTHING LOGGED after `afterMs`: its empty days
 * (`emptyDaySlots`) one after another, the nights' fills included. For what has no walk to ask —
 * the Rule sheet's "Next: …" for a rhythm not yet saved, which counted from the minute the sheet
 * was opened and so promised times (2:15 AM, 6:15 AM at 10:15 PM) the day would never lay out.
 */
export function emptySlotsAfter(
  rule: Rule,
  ctx: Pick<EngineContext, 'timeZone' | 'trackingFromMs'>,
  afterMs: number,
  count: number,
): number[] {
  const out: number[] = [];
  let day = dayStartOf(ctx.timeZone, afterMs);
  for (let d = 0; d < 7 && out.length < count; d++) {
    const later = emptyDaySlots(rule, ctx, day).filter(t => t > afterMs);
    out.push(...later.slice(0, count - out.length));
    day = dayPlus(ctx.timeZone, day, 1);
  }
  return out;
}

export interface IntervalResult {
  occurrences: Occurrence[];
  /**
   * The chain's open slot when it fell BEFORE this day and is still DUE — the 11:05 PM feed at
   * 12:05 AM, its late window not yet closed. Never one of `occurrences`: the day's list is
   * midnight to midnight. Only for a day that has begun (`nowMs` inside or after it).
   */
  carried: Occurrence | null;
  /** Sessions that satisfied no slot: counted in totals, never a miss (§3). */
  extra: Session[];
  /** The one open slot — DUE or UPCOMING — or null while the day has none yet. */
  next: Occurrence | null;
  doneToday: number;
  missedToday: number;
  /** Mean gap between today's session starts, or null with fewer than two. */
  actualGapMs: number | null;
}

/**
 * Today's occurrences for one INTERVAL rule. `sessions` may span any range; the walk takes
 * the last one before the day as the opening anchor and every one today in order.
 */
export function intervalOccurrences(
  rule: Rule,
  sessions: readonly Session[],
  ctx: EngineContext,
): IntervalResult {
  const { nowMs, timeZone, dayStartMs } = ctx;
  const win = rule.matchWindowMinutes * MIN;
  const late = rule.lateWindowMinutes * MIN;
  const all = sessionsFor(rule, sessions).filter(s => s.startMs <= nowMs);
  /**
   * A TIMER THAT IS STILL RUNNING IS NOT A SLOT GOING BY.
   *
   * A pump re-anchors the chain from its START, which is right (`intervalAnchor`) — and while
   * the timer is still running, the chain went on aging past it: a pump left running for five
   * and three-quarter hours on a 2½-hourly rule drew `3:56 PM MISSED` and `6:26 PM DUE` with
   * the card beside them still reading "Pumping", and a reminder would have fired for a pump
   * already in progress (the audit's B6, 2026-09-19, from the owner's own screenshot).
   *
   * So for every slot AFTER a running session's start, the clock the status is judged against
   * is that start rather than the wall clock: those slots stay UPCOMING, nothing is missed, and
   * nothing is due. The moment the timer stops, the day catches up in one recompute. Slots
   * BEFORE it are judged as they always were — what happened this morning happened.
   *
   * It is also the honest answer to a stale timer. The app cannot know whether a six-hour pump
   * is real; what it can know is that saying "you missed the 3:56 pump" to somebody whose timer
   * is running is certainly wrong.
   */
  const running = all.filter(s => s.running === true).slice(-1)[0];
  const judge = (dueMs: number): number =>
    running !== undefined && dueMs > running.startMs ? running.startMs : nowMs;
  /**
   * THE MORNING AFTER A PAUSED NIGHT IS NOT A MISS (the audit's B5). With pumping paused from
   * 23:00 to 06:00, `nextDue` puts the first slot at 06:00 exactly — the moment the pause
   * lifts — and a parent who woke at 07:30 opened the app to `6:00 AM MISSED`. The first thing
   * a household that chose "no night pumps" sees in the morning should not be a failure, and it
   * is not one: 06:00 is where the schedule resumes, not a time anybody set an alarm for.
   *
   * So a wake slot keeps its full interval before it can be missed. It still goes DUE at 06:00
   * — it IS the next one — it simply does not age into red while everyone is asleep.
   */
  const pauseWakeAt = (dueMs: number): boolean =>
    rule.nightMode === 'PAUSE' &&
    rule.nightTo !== null &&
    wallMinutes(timeZone, dueMs) === hm(rule.nightTo);
  const prior = all.filter(s => s.startMs < dayStartMs).slice(-1)[0];
  const unmatched = all.filter(s => s.startMs >= dayStartMs);
  const dayEndMs = dayPlus(timeZone, dayStartMs, 1);
  const occ: Occurrence[] = [];
  /** Sessions the walk set aside before reaching a slot they could have answered. */
  const extraOut: Session[] = [];

  /**
   * WITH NO PRIOR SESSION THE DAY ITSELF IS THE ANCHOR, so the first slot falls one interval
   * INTO the day. It used to be `dayStartMs - every`, which made the first slot land exactly on
   * `dayStartMs` — a 12:00 AM row against every interval module, every morning, for a slot
   * nobody planned (the owner, 2026-09-16: "why is there a 12.00 AM time for every module when
   * it's way past that"). Midnight is the day's boundary, not a time a parent chose.
   *
   * A slot AT midnight can still come back, and when it does it is not that one: it is the
   * middle of the night's wrap (`gridFills`, 2026-09-27). A three-hourly day ends at 9:00 PM and
   * the next begins at 3:00 AM; the one slot that keeps both gaps at three hours is 12:00 AM, and
   * it is there because the rhythm asks for it, not because the grid was laid from the boundary.
   */
  /**
   * …AND THE HOUSEHOLD'S FIRST DAY IS A DAY LIKE ANY OTHER (the owner, 2026-09-25: *"It should
   * still show from midnight in case if user wants to 'fix' the schedule or update it with their
   * actual time"*). For a rule the household STARTED WITH (`start.ts`: written at setup, within
   * `STARTED_WITH_MS` of `households.created_at`) the chain opens at midnight on every day,
   * the first one included, so the first day's slots are the ones the parent sees the next
   * morning. The part of that day before the household existed is SKIPPED further down, never
   * missed, and an entry with its real time still answers it.
   *
   * It replaces two earlier answers for those rules: the anchor at signup (2026-09-18: *"why not
   * just start when user creates accoutn"*) and its first slot fifteen minutes in (2026-09-21).
   * Both drew a first day nobody would see again — a phase set by the minute of the signup — and
   * gave a parent who backdates the morning's feeds no slot to put them in.
   */
  const householdStart = householdStartFor(rule, ctx);
  /**
   * …AND NOT FROM BEFORE THE RULE WAS WRITTEN, for a rule written later. `effectiveFromMs` was
   * already honored for the ROWS (`scheduleDay` filters them), but not for the GRID, so a
   * 3-hourly rule created at 4 p.m. in an established household laid its chain out from midnight
   * and drew its first surviving slot at 6:00 PM — a phase nobody chose. Clamped into this day so
   * it only ever matters on the day the rule was written.
   */
  const opened =
    householdStart !== null
      ? dayStartMs
      : Math.min(Math.max(dayStartMs, rule.effectiveFromMs), dayPlus(timeZone, dayStartMs, 1));
  let anchor = prior ? intervalAnchor(rule, prior) : opened;
  /**
   * A RULE WRITTEN TODAY GETS ITS FIRST SLOT FIFTEEN MINUTES IN, not one interval in (the owner,
   * 2026-09-21: "account created at 3.18pm, at 3h interval, all activities in schedule start
   * 6.18pm… make it 15 minutes after account creation, so there is enough time for users to go
   * explore the app and learn first before putting any entries"). Writing a rule is not a feed:
   * a chain that treats it as one draws a day whose first row is three hours of nothing. Fifteen
   * minutes is a first slot that is plainly "soon" and plainly not "now", and the moment anything
   * is logged the chain re-anchors from the entry and this number is gone.
   *
   * It no longer applies to the rules a household starts with (above); it still applies to a rule
   * written into a day already going (`effectiveFromMs`). A day that simply has nothing logged
   * keeps the one-interval-in grid: there is no arrival to count from.
   */
  const fresh = prior === undefined && opened > dayStartMs;
  /**
   * A STALE ANCHOR IS STILL AN ANCHOR — carried forward whole intervals until it reaches this
   * day, rather than walked there.
   *
   * The walk is capped at 200 steps, so a rule whose last session was three weeks ago never
   * arrived: a 2-hourly pump rule with its last pump 20 days back produced NO occurrences at
   * all, no `next`, and no reminder — the rule simply vanished from the Schedule tab and from
   * Today (a household that pauses pumping for a few weeks and comes back to nothing). Stepping
   * by whole intervals keeps the household's PHASE, which is the part worth keeping: a chain
   * that ran on the half hour still runs on the half hour when they pick it up again.
   *
   * Arithmetic rather than `nextDue` on purpose: the night rules bend a step, and bending 240
   * of them to arrive at a grid the first real entry will replace within the hour is work for
   * nothing. Whatever phase this lands on, the day's first session re-anchors it.
   */
  const everyMs = (rule.everyMinutes ?? 180) * MIN;
  /** The slot the carry below stopped on, when it walked there — `nextDue` is told it (ONE). */
  let carriedSlot: number | undefined;
  if (everyMs > 0 && anchor < dayStartMs - everyMs) {
    const back = Math.floor((dayStartMs - anchor) / everyMs);
    if (rule.nightMode === 'NONE' || back > WALK_BACK_STEPS) {
      /*
        …AND IT STOPS ONE INTERVAL SHORT OF THE DAY, so the walk below still judges the last slot
        before midnight itself (the schedule sweep of 2026-09-24). Jumping the whole way landed the
        anchor ON that slot — last feed 8:05 PM, three-hourly: the anchor became 11:05 PM and the
        walk began at 2:05 AM — so an 11:05 PM feed still inside its window at 12:05 AM was never
        looked at, and Today could not know it was due (`carried` below). Walked, it is judged
        like any other slot: missed, skipped, answered by a feed at 12:10, or still due.
      */
      if (back - 1 > 0) anchor += (back - 1) * everyMs;
    } else {
      /*
        …BUT A CHAIN WITH A NIGHT IN IT IS WALKED THERE, step by `nextDue` step (2026-09-27). A
        night step is not a day step, so whole day steps put the anchor on a phase the chain never
        had: on setup's rhythm a 5:10 PM feed is due again at 9:10 PM and at 1:10 AM after that —
        the night's four hours — but the jump landed on 8:10 PM and opened the next day at
        12:10 AM, an hour off what the evening had shown and off the reminder set from it. Walked
        the way the day before walked it, every day reads one chain. It stops where the jump
        stopped, with the last slot before midnight still ahead for the walk below to judge.
        Only a chain nobody has touched for longer than `WALK_BACK_STEPS` steps still jumps, where
        any phase is a guess.
      */
      for (let n = 0; n < WALK_BACK_STEPS; n++) {
        const step = nextDue(anchor, rule, timeZone, carriedSlot);
        if (nextDue(step, rule, timeZone, step) >= dayStartMs) break;
        anchor = step;
        carriedSlot = step;
      }
    }
  }
  /**
   * WHILE NOTHING ANCHORS THE CHAIN, IT RUNS ON THE EMPTY-DAY GRID, WRAPS FILLED (the owner,
   * 2026-09-27: *"the gap from 9pm to 4am -> 7 hours, was definitelytoo long"*; `gridFills`).
   *
   * With no session before the day, the day's slots are the grid `emptyDayGrid` lays from its
   * opening, plus the fills that fall on it: after yesterday's last slot in the small hours (the
   * owner's 12:30 AM), and before tomorrow's first late in the evening. The walk begins at the
   * first fill after yesterday's last slot even when it fell before midnight — yesterday's row,
   * judged here only so it can be `carried` while still due (`emptyGridRun`). `stepOn` is the step
   * the walk takes while it is on that grid — to the grid's next slot, fill or not — and every
   * branch below that keeps the cadence (a skip, a miss, a slot before the household, the rest of
   * the day) takes it. The first session that anchors the chain takes it off the grid for good:
   * from there the walk is plain `nextDue` from the entry, exactly as before, and nothing is
   * filled — a chain counted from a real entry has no seam to fill.
   *
   * With a session before the day there is no grid at all — the chain already runs from an entry,
   * across midnight without a wrap. Under PAUSE and ONE there are no fills, so the walk takes the
   * plain step it always did (`fillsWraps`). And the grid is the same one either neighboring day
   * reads (`emptyDayGrid`), so the fills this day draws are the ones the day before and the day
   * after draw, each on the day its time falls in.
   */
  const grid = prior === undefined && fillsWraps(rule) ? emptyGridRun(rule, ctx, dayStartMs) : [];
  const gridFirst = grid[0];
  let onGrid = gridFirst !== undefined;
  const stepOn = (at: number): number =>
    (onGrid ? grid.find(t => t > at) : undefined) ?? nextDue(at, rule, timeZone, at);
  let due =
    gridFirst ?? (fresh ? opened + FIRST_SLOT_MS : nextDue(anchor, rule, timeZone, carriedSlot));
  /**
   * WHERE THE NEXT SLOT WOULD HAVE BEEN had the session below not moved the chain. Set when a
   * hit or an early session re-anchors, read by the very next occurrence pushed, and cleared
   * immediately — `Occurrence.movedFromMs` says why only one row carries it.
   */
  let movedFrom: number | null = null;
  const withMove = (at: number, status: Parameters<typeof occurrence>[2]): Occurrence => {
    const o = occurrence(rule, at, status, movedFrom !== null ? { movedFromMs: movedFrom } : {});
    movedFrom = null;
    return o;
  };
  /**
   * A SECOND ENTRY A FEW MINUTES AFTER THE ONE THAT MOVED THE CHAIN IS THE SAME ENTRY, TWICE.
   *
   * Two caregivers logging the same pump, or one tapping the tile again because the first tap
   * did not look like it landed: the day then counted two pumps, drew an off-grid row five
   * minutes after the real one, and struck the next slot through — "~~9:15~~ 9:20" — over a
   * mistake. The nudge engine threw gaps under twenty minutes away when it measured a
   * household's usual rhythm, and the coach's gaps still do (`coach/coach.ts`); this is the same
   * judgment, where the schedule reads gaps between entries.
   *
   * It absorbs rather than records: the entry itself is untouched in the log, where a parent can
   * see it and delete it. What it does not do is move the schedule.
   */
  const DOUBLE_LOG_MS = 20 * MIN;
  /** The session the chain is anchored on, or null while the day itself is the anchor. */
  let anchorSessionMs: number | null = null;
  /**
   * AN UNANSWERED MISS MEANS THE NEXT SLOT IS DUE NOW (the owner, 2026-10-04).
   *
   * A diaper missed at 1:08 and a bottle missed at 1:44 used to leave the next diaper "in 9 min"
   * and the next bottle "in 45 min". Nothing had been logged since those slots, so the rhythm was
   * already late and the countdown was the wrong sentence. The missed rows stay on the list at
   * their own times — Up next never puts that old clock back (2026-09-24) — and the next slot
   * still on this day is the one outstanding one, due, until a log or a caregiver's skip answers
   * the series. The slot after that waits for its own clock.
   *
   * A slot the night pushed onto a later morning stays a plan. "No night feeds" means the next
   * one is wake-up, not "due now" at 10 PM, and a day that has not begun is still ahead
   * (`scheduleAhead` reads only UPCOMING). The red tile keeps the miss. A slot from before the
   * household existed was never missed, so it owes nothing. A fixed clock (a cream, a medicine)
   * is a different walk: a missed dose stays a record and the next one stays at its time (the
   * owner, 2026-09-16). The reminder still rings at this slot's own time. Marking it due does
   * not buzz early.
   */
  let owed = false;
  for (let guard = 0; guard < 200; guard++) {
    if (ctx.skipped?.has(skipKey(rule.id, due))) {
      occ.push(occurrence(rule, due, 'SKIPPED'));
      owed = false; // a chosen skip answers the series; the slot after waits for its clock
      // A SKIPPED ROW CARRIES NO "was", and neither does a MISSED one below. `movedFrom` is set
      // when a session moves the chain and read by the NEXT row pushed — but only `withMove`
      // reads it, and these two branches do not go through it, so the value survived a run of
      // misses and landed on an open slot hours later (a 3:20 PM row reading "moved from 8:00
      // AM", for a slot that moved from nothing). A row says "was 8:00" only when it IS the
      // slot that moved.
      movedFrom = null;
      anchor = due; // same as MISSED: the cadence is kept
      due = stepOn(anchor);
      continue;
    }
    /**
     * THE EARLIEST UNANSWERED SESSION IS THE ONE THIS SLOT IS ABOUT — take it, then decide what
     * it is. The walk used to look for an in-window session FIRST and only then for an early
     * one, so a pump at 8:00 and another at 9:10 against a 9:15 slot gave the slot to 9:10 and
     * left 8:00 behind as an "extra": the day counted two pumps out of three and the Activities
     * box said "2 done" with three in the log. Sessions happen in an order; the chain has to
     * read them in it.
     */
    const s0 = unmatched[0];
    if (
      s0 !== undefined &&
      anchorSessionMs !== null &&
      s0.startMs - anchorSessionMs <= DOUBLE_LOG_MS
    ) {
      unmatched.shift();
      continue;
    }
    /**
     * AN ENTRY FROM BEFORE THE CHAIN OPENED IS THE CHAIN'S ANCHOR, when nothing else is (the
     * owner, 2026-09-21: "if user decides to put last log entry (for example feeding was done
     * at 1.50pm), make sure this is updated in the schedule that it starts from there… so
     * 4.50pm next"). It used to be set aside as an "extra" — logged before the household's
     * first moment, so no slot to have answered — which was true of the SLOT and wrong about
     * the DAY: a real feed at 1:50 is a better anchor than a signup at 3:18, and a parent who
     * backdates their last feed the moment they arrive is telling the app exactly where the
     * rhythm stands. It falls through to the early-session branch below and re-anchors from
     * there. With a prior session the chain already has a real anchor and nothing today can
     * precede it, so the branch that stood here had no case left to handle.
     */
    const inWindowHit =
      s0 !== undefined &&
      s0.startMs >= due - win &&
      (s0.startMs <= due + win || s0.startMs < due + late);
    if (s0 !== undefined && inWindowHit) {
      const hit = s0;
      const isLate = hit.startMs > due + win;
      occ.push(
        occurrence(rule, due, isLate ? 'LATE' : 'DONE', {
          matchedId: hit.id,
          // the grid time is `due`; this is the minute it really happened (`matchedAtMs`)
          matchedAtMs: hit.startMs,
          minutesLate: isLate ? Math.round((hit.startMs - due) / MIN) : null,
        }),
      );
      unmatched.shift();
      owed = false; // a log answers the series, including one that was already missed
      // what the NEXT slot was on the grid this session just left behind — on the empty-day
      // grid, its next slot, a fill included: a 12:40 AM feed on the 12:30 AM fill moves 4:00
      const wouldHaveBeen = stepOn(due);
      anchor = intervalAnchor(rule, hit);
      anchorSessionMs = hit.startMs;
      onGrid = false; // anchored on an entry: plain steps from here, nothing filled
      due = nextDue(anchor, rule, timeZone, due);
      movedFrom = nearEnough(wouldHaveBeen, due) ? null : wouldHaveBeen;
      continue;
    }
    // §2 "an early session": between slots still resets the clock — it IS the occurrence,
    // off-grid, and the slot it pre-empted is never left standing
    if (s0 !== undefined && s0.startMs < due - win) {
      const early = s0;
      // an early session IS the occurrence, so `atMs` is already the real minute; it carries
      // `matchedAtMs` too so every done slot answers the question the same way
      occ.push(
        occurrence(rule, early.startMs, 'DONE', {
          matchedId: early.id,
          matchedAtMs: early.startMs,
          offGrid: true,
        }),
      );
      unmatched.shift();
      owed = false; // an early log answers the series the same way an in-window one does
      // a slot displaced off a grid no entry has anchored yet — the day's own from midnight, or a
      // new rule's — was never a slot anybody planned, so the first entry moves nothing worth
      // striking through
      const planned = prior !== undefined || anchorSessionMs !== null;
      /*
        WHERE THE NEXT SLOT WAS ON THE OLD GRID — the slot after the one this session answered,
        exactly as the in-window branch above reckons it, because `movedFromMs` is "where THIS
        slot would have been" and the Schedule tab subtracts it from this slot's time to say how
        far the session ran early or late (`present.ts` `movedCaption`). It was `due` itself — the
        slot the session answered — so a feed given at 3:20 for a 4:05 slot put the next one at
        6:20 "moved from 4:05 AM · last feed ran 135 min late", for a feed that was 45 minutes
        early (the pre-release sweep, 2026-09-24). On the old grid the next feed was 7:05.
      */
      const wouldHaveBeen = stepOn(due);
      anchor = intervalAnchor(rule, early);
      anchorSessionMs = early.startMs;
      onGrid = false;
      due = nextDue(anchor, rule, timeZone, due);
      movedFrom = !planned || nearEnough(wouldHaveBeen, due) ? null : wouldHaveBeen;
      continue;
    }
    /**
     * A SLOT FROM BEFORE THE HOUSEHOLD EXISTED IS SKIPPED, NOT MISSED (the owner, 2026-09-25:
     * *"I think it should be skipped, since user can 'fix' it with actual time"*). The app was not
     * in the parent's hands at 9:00 on the morning they signed up at 10:47, so nothing was missed
     * then and nothing is due from then.
     *
     * IT IS JUDGED HERE, AFTER THE TWO BRANCHES THAT ANSWER A SLOT, and that order is the "fix":
     * a feed logged with its real time — 9:20 against the 9:00 slot — has already made the slot
     * DONE above and re-anchored the chain from 9:20, exactly as on any other day. Only a slot
     * nothing answered reaches this line. The cadence is kept, as after a miss or a stored skip.
     *
     * DERIVED, NEVER STORED (`Occurrence.beforeStart`): not the caregiver's skip in
     * `ctx.skipped`, which the server keeps and cannot take back. The materialiser writes no row
     * for it, the reminder planners take only DUE and UPCOMING, and the day's totals leave it out.
     */
    if (householdStart !== null && due < householdStart) {
      occ.push(occurrence(rule, due, 'SKIPPED', { beforeStart: true }));
      movedFrom = null; // a skipped row moved from nothing — see the SKIPPED branch above
      anchor = due;
      anchorSessionMs = null;
      due = stepOn(anchor);
      continue;
    }
    const missAfter = pauseWakeAt(due) ? Math.max(missAtOf(rule), everyMs) : missAtOf(rule);
    if (due + missAfter < judge(due)) {
      // EVERY MISSED SLOT IS ITS OWN ROW. They used to fold into one GAP carrying a count once
      // six had passed, and the day then said "4 slots passed before your next entry · not
      // counted as outstanding" instead of naming them — which is a sentence nobody asked a
      // question that needed (the owner, 2026-09-16: "it does not show any missed schedule in
      // today's list, which is wrong … it should mark the 8am and 10am as missed"). What the
      // collapse was protecting — never nagging about a backlog — is a property of the
      // REMINDERS and of what counts as outstanding, not of the list: exactly one slot below is
      // ever DUE, whatever the day's history looks like.
      occ.push(occurrence(rule, due, 'MISSED'));
      owed = true;
      movedFrom = null; // a missed slot moved from nothing — see the SKIPPED branch above
      anchor = due; // keep the cadence, do not drift
      anchorSessionMs = null;
      due = stepOn(anchor);
      continue;
    }
    /**
     * The open slot, and then THE REST OF THE DAY.
     *
     * Only this first one is DUE — one outstanding slot at a time is §2's promise and what the
     * reminders honor — but the walk goes on to the end of the local day, so the list is a day
     * rather than "up to the next thing" (the owner, 2026-09-16: "the list should show the full
     * day schedule, from 12 am to 11.59 pm … if the interval is set to two hours, the schedule
     * for the rest of the day shifts to 13.50, 15.50, 17.50"). Those later slots re-anchor the
     * moment anything is logged, because the next walk starts from the new session.
     *
     * It is DUE when its own time has come, and also when an earlier slot of this rhythm was
     * missed, nothing since has answered it (`owed`), and this slot is still on the day being
     * read while that day is the one the clock is in. The rows after it stay a plan.
     */
    const onThisDay = nowMs >= dayStartMs && nowMs < dayEndMs && due < dayEndMs;
    occ.push(withMove(due, due <= judge(due) || (owed && onThisDay) ? 'DUE' : 'UPCOMING'));
    // still on the empty-day grid, the rest of the day is the grid's, the evening's fill included
    let ahead = stepOn(due);
    for (let n = 0; n < 200 && ahead < dayEndMs; n++) {
      occ.push(occurrence(rule, ahead, 'UPCOMING'));
      ahead = stepOn(ahead);
    }
    break;
  }

  const todays = all.filter(s => s.startMs >= dayStartMs).map(s => s.startMs);
  let actualGapMs: number | null = null;
  if (todays.length >= 2) {
    let sum = 0;
    for (let i = 1; i < todays.length; i++) sum += (todays[i] ?? 0) - (todays[i - 1] ?? 0);
    actualGapMs = sum / (todays.length - 1);
  }
  // slots before the day belong to the walk that anchored it, not to today's list; slots past
  // the end of it belong to tomorrow's
  const today = occ.filter(o => o.atMs >= dayStartMs && o.atMs < dayEndMs);
  /*
    …EXCEPT THE ONE STILL OPEN (the schedule sweep of 2026-09-24). The walk reaches today through
    yesterday's slots, and the last of them can still be DUE: at 12:05 AM an 11:05 PM feed whose
    window runs to 12:35 is the one open slot §2 promises — but it was filtered out with the rest
    of yesterday, so Up next jumped to "2:05 AM · In 2 h" at the stroke of midnight and the tile
    lost its ring, against the owner's rule that a slot leaves Up next once missed "unless it's
    still due". It is handed back on its own, for Today's open rows (`openToday`); the day's
    record is untouched.
  */
  const carried =
    nowMs >= dayStartMs ? (occ.find(o => o.status === 'DUE' && o.atMs < dayStartMs) ?? null) : null;
  return {
    occurrences: today,
    carried,
    extra: [...extraOut, ...unmatched].sort((a, b) => a.startMs - b.startMs),
    next: today.find(o => o.status === 'DUE' || o.status === 'UPCOMING') ?? null,
    doneToday: today.filter(o => o.status === 'DONE' || o.status === 'LATE').length,
    missedToday: today.filter(o => o.status === 'MISSED').length,
    actualGapMs,
  };
}
