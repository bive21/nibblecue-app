/**
 * The schedule engine's vocabulary (docs/SCHEDULE_LOGIC.md §1). These are the engine's view of
 * the rows, not the rows: camelCase, unix ms, defaults already applied, so every function in
 * this folder is a pure function of plain objects and can be tested with literals. The app maps
 * a `schedule_rules` row through `ruleFrom`, the admin console and the materialise function do
 * the same, and the three cannot disagree about what a rule means.
 */
import type { ActivityType } from '../domain/domain-types';

export type RuleType = 'FIXED' | 'INTERVAL' | 'RELATIVE' | 'CADENCE';
export type NightMode = 'NONE' | 'LONGER' | 'ONE' | 'PAUSE';
export type RepeatKind = 'DAILY' | 'WEEKDAYS' | 'WEEKENDS' | 'CUSTOM';
export type RelativeTo = 'WAKE' | 'LAST_FEED' | 'BEDTIME';
export type MatchScope = 'MINUTES' | 'DAY';
/** The slot states of §3, plus GAP — the one row a long unlogged stretch collapses into. */
export type SlotStatus = 'UPCOMING' | 'DUE' | 'DONE' | 'LATE' | 'MISSED' | 'SKIPPED' | 'GAP';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** The schema's defaults (0001 `schedule_rules`), restated once for the engine. */
export const RULE_DEFAULTS = {
  matchWindowMinutes: 25,
  missAfterMinutes: 60,
  lateWindowMinutes: 90,
  /** consecutive misses before the chain collapses into one GAP row (§3 "Why cap the cascade") */
  gapAfterMisses: 6,
  /** §2: a missed slot is recorded, then the chain keeps its cadence */
  wakeDefault: '07:00',
  bedtimeDefault: '19:30',
} as const;

export interface Rule {
  id: string;
  activity: ActivityType;
  /** null: household-scoped (pump, hydration, selfcare) or a care-item rule; else one child. */
  childId: string | null;
  ruleType: RuleType;
  /** FIXED and CADENCE: `HH:MM` in the household's home zone. */
  atLocalTime: string | null;
  everyMinutes: number | null;
  relativeTo: RelativeTo | null;
  offsetMinutes: number | null;
  /** CADENCE: every N days; or `repeatDays` names the weekdays instead. */
  everyDays: number | null;
  repeat: RepeatKind;
  /** 0 = Sunday. CUSTOM repeat (FIXED/RELATIVE) or the chosen weekdays (CADENCE). */
  repeatDays: readonly number[] | null;
  matchWindowMinutes: number;
  matchScope: MatchScope;
  missAfterMinutes: number;
  lateWindowMinutes: number;
  nightMode: NightMode;
  nightFrom: string | null;
  nightTo: string | null;
  nightEveryMinutes: number | null;
  nightAt: string | null;
  targetPerDay: number | null;
  targetQuantity: number | null;
  reminderEnabled: boolean;
  remindUserIds: readonly string[];
  name: string | null;
  isActive: boolean;
  /** A rule created at 4 p.m. did not miss that morning: slots before this are not slots. */
  effectiveFromMs: number;
  /** med rules: WHICH saved item the slot is for (docs/CARE_ITEMS.md §4). */
  careItemId: string | null;
}

/** The fields a rule needs; everything else takes the schema default. */
export type RuleInput = Pick<Rule, 'id' | 'activity' | 'ruleType'> & Partial<Rule>;

export function ruleFrom(input: RuleInput): Rule {
  return {
    childId: null,
    atLocalTime: null,
    everyMinutes: null,
    relativeTo: null,
    offsetMinutes: null,
    everyDays: null,
    repeat: 'DAILY',
    repeatDays: null,
    matchWindowMinutes: RULE_DEFAULTS.matchWindowMinutes,
    missAfterMinutes:
      input.ruleType === 'INTERVAL' && input.everyMinutes
        ? Math.min(RULE_DEFAULTS.missAfterMinutes, Math.round(input.everyMinutes / 2))
        : RULE_DEFAULTS.missAfterMinutes,
    nightMode: 'NONE',
    nightFrom: null,
    nightTo: null,
    nightEveryMinutes: null,
    nightAt: null,
    targetPerDay: null,
    targetQuantity: null,
    reminderEnabled: true,
    remindUserIds: [],
    name: null,
    isActive: true,
    effectiveFromMs: 0,
    careItemId: null,
    ...input,
    // AFTER the spread, deliberately — see `scopeOf` and `lateOf`.
    matchScope: scopeOf(input),
    lateWindowMinutes: lateOf(input),
  };
}

/**
 * THE LATE WINDOW NEVER REACHES INTO THE NEXT SLOT'S HALF OF THE GAP.
 *
 * Ninety minutes is the right shape of answer for a three-hourly rhythm and nonsense for an
 * hourly one: a feed fifty minutes after a 9:00 slot on an hourly rule is nearer to the 10:00
 * slot than to the one it would be closing, and letting it close 9:00 makes 10:00 the missed
 * one. Half the interval is the boundary that cannot be argued with — it is the midpoint — and
 * it only ever narrows the window, never widens it.
 *
 * It matters now because MISSED moved to `max(match, miss, late)` (`fixedStatus` and the interval
 * walk): a slot is called missed exactly when nothing can still answer it, so an unbounded late
 * window on a short interval would have held a slot open past the next one and stalled the chain.
 *
 * Derived after the spread for the same reason `scopeOf` is: `late_window_minutes` is a stored
 * column, so a value computed before `...input` would be overwritten by whatever a row from an
 * older build carries. A rule with no interval — FIXED, RELATIVE, CADENCE — keeps the full
 * window, because there is no next slot to reach into.
 */
const lateOf = (input: RuleInput): number => {
  const late = input.lateWindowMinutes ?? RULE_DEFAULTS.lateWindowMinutes;
  if (input.ruleType !== 'INTERVAL' || !input.everyMinutes) return late;
  return Math.max(1, Math.min(late, Math.round(input.everyMinutes / 2)));
};

/**
 * WHEN A SLOT IS CALLED MISSED: once nothing can still answer it.
 *
 * It used to be `due + max(match_window, miss_after)` — sixty minutes by default — while a
 * session logged up to NINETY minutes after the slot still turned it into LATE. Between those
 * two clocks the app said "missed" about something the parent could still answer, and often did:
 * a 9:00 feed reads missed at 10:10, is logged at 10:15, and becomes "late" (the schedule
 * audit's B1, 2026-09-19). A word that unwinds thirty minutes later was not a fact when it was
 * shown, and this is the one screen that must never tell a parent they failed at something they
 * are about to do.
 *
 * So the two clocks are one. MISSED now begins where the late window closes, and `lateOf` keeps
 * that window inside half the rule's own interval so a slot can never stay open past the next
 * one. DUE is what the extra half hour reads as, which is exactly what it is: still yours to do.
 */
export const missAtOf = (rule: Rule): number =>
  Math.max(rule.matchWindowMinutes, rule.missAfterMinutes, rule.lateWindowMinutes) * MIN;

/**
 * A CADENCE rule is matched by DAY, and so is a CARE ITEM — the owner, 2026-09-15: the vitamin
 * whose slot is 8 a.m., given at 7:48 p.m., "should say that it's late instead" of
 * disappearing; and again 2026-09-16: "think about the vitamin D drop as a once a day kind of
 * routine, but the recommended time is 8 a.m. … as long as it's done on the same day you can
 * log it in". A once-a-day vitamin is a DAY question ("did we give it today?"), not a 90-minute
 * one, so the late window is the wrong instrument: outside 90 minutes the dose satisfied
 * nothing, the slot stayed MISSED, and the household's own record said the opposite of what
 * they had just done. Everything else keeps the minute windows, and a cream three times a day
 * still assigns each dose to its nearest open slot (`scheduleDay`).
 *
 * IT IS DERIVED, NOT READ, and it is computed after `...input` for one concrete reason:
 * `match_scope` is a stored column whose schema default is `'MINUTES'`, and `ruleFromRow`
 * passes the stored value straight through. Every medicine rule created before this change
 * carries MINUTES, so a default computed BEFORE the spread was silently overwritten and the
 * 8 a.m. vitamin went on reading "missed" on the owner's phone all evening. Deriving it heals
 * every existing row with no migration and makes the column advisory: the scope is a fact
 * about the rule's shape, not a setting anybody chose.
 */
const scopeOf = (input: RuleInput): MatchScope =>
  input.ruleType === 'CADENCE' || (input.careItemId ?? null) !== null
    ? 'DAY'
    : (input.matchScope ?? 'MINUTES');

/** A logged activity as the engine sees it: the four facts matching needs, in ms. */
export interface Session {
  id: string;
  type: ActivityType;
  childId: string | null;
  startMs: number;
  /** null for an instantaneous entry (a bottle), or while a timer runs. */
  endMs: number | null;
  /** A running timer does not count: the interval restarts when the session ENDS (§5). */
  running?: boolean;
  sleepKind?: 'NAP' | 'NIGHT' | null;
  careItemId?: string | null;
}

/** One occurrence of a rule at a concrete instant — a `schedule_instances` row, computed. */
export interface Occurrence {
  ruleId: string;
  rule: Rule;
  atMs: number;
  status: SlotStatus;
  /** The session that satisfied it (DONE / LATE), else null. */
  matchedId: string | null;
  /**
   * WHEN THAT SESSION ACTUALLY STARTED, or null where nothing satisfied this slot.
   *
   * `atMs` is the slot's place on the GRID and stays that, because that is what a rhythm says
   * and what the next slot is computed from. This is the other fact — the minute it really
   * happened — and the two differ by up to the late window (90 minutes by default): a feed
   * planned for 3:00 and logged at 4:15 is one occurrence carrying both.
   *
   * Everything a person READS asks `shownAtMs` rather than `atMs`: the wheel's "how it went"
   * view, the Schedule list, its order and its fold. Each of them once drew a done slot on the
   * grid while an EARLY one (which is `offGrid` and keeps the session's own time) sat where it
   * really was — two rows logged the same minute, one at the minute and one twelve minutes
   * before it (the owner, 2026-09-24: a feed and a diaper both logged at 11:08 PM, the list
   * reading 10:56 and 11:08). One rule for every surface, and this field is what makes it one.
   */
  matchedAtMs: number | null;
  /** An early session that became the occurrence (§2): its time is the session's, not the grid's. */
  offGrid: boolean;
  /** GAP: how many slots the stretch stood for. 1 for every other row. */
  expectedCount: number;
  minutesLate: number | null;
  /** A look-ahead row (a cadence rule's next day), never today's business. */
  future: boolean;
  /** RELATIVE with no anchor event yet: rendered as "about 9:10 AM" (NOTIFICATIONS §2). */
  provisional: boolean;
  /**
   * WHERE THIS SLOT WOULD HAVE BEEN before the session above it moved the chain, or null when
   * nothing moved it (the owner, 2026-09-18: *"show the change only for the single affected
   * schedule, so it should show 5.30PM strikethroughed 6.13PM. and then the next ones should
   * still be every 2,5hours so 8.43 and dont strikthgouh this one, otherwise there will be too
   * much edit"*).
   *
   * Only the FIRST slot after a re-anchoring session carries it, which is the whole point: an
   * interval that moves moves every slot after it, and striking through all of them would be a
   * day of corrections rather than one. The one that changed is the one a parent was looking at
   * a minute ago; the rest simply are where they are.
   */
  movedFromMs: number | null;
  /**
   * A SKIP NOBODY CHOSE: a SKIPPED slot on the household's first day whose time was before the
   * household existed (`start.ts`; the owner, 2026-09-25: *"I think it should be skipped, since
   * user can 'fix' it with actual time"*). True only on such a row; false or absent on every other.
   *
   * It is the engine's, derived on every run, and it is NOT the skip a caregiver makes. That one
   * arrives as `ctx.skipped` from a stored instance row, the server keeps it, and nothing can take
   * it back once sent (`skipSlotForTrial` in the app says why). This one is never stored, never
   * pushed, never an outbox op and never a reminder, and it is neutral: not a miss, not a
   * decision, outside the day's totals (`adherence`). It is also still answerable — an entry
   * logged with its real time inside the slot's window makes the slot DONE like any other, and
   * then this is false, because the slot is simply done.
   */
  beforeStart?: boolean;
}

export interface EngineContext {
  nowMs: number;
  /**
   * The zone the day is computed in: on a phone, the zone it reads in (its own, abroad too —
   * `today/travel.ts`); in the server's materialiser, `households.home_time_zone`.
   */
  timeZone: string;
  /** First instant of the local day being computed. */
  dayStartMs: number;
  /**
   * Slots a caregiver skipped, keyed `${ruleId}@${atMs}`. A skip is a fact the engine cannot
   * derive from the log, so it arrives from the instance rows.
   */
  skipped?: ReadonlySet<string>;
  /**
   * WHEN THIS HOUSEHOLD STARTED KEEPING THE LOG — `households.created_at`, in ms.
   *
   * It is the anchor a chain falls back to when there is no session at all (the owner, on a new
   * account, 2026-09-18: *"i also created a new account so everything is new at 3.30PM, the time
   * now is 3.44pm, the today's schedule i see only start from 5.30PM why does this happen? why
   * not just start when user creates accoutn"*).
   *
   * They are right, and the old fallback made the mistake visible: with midnight as the anchor,
   * a 2.5-hour rule laid out 2:30 AM, 5:00, 7:30, 10:00, 12:30 and 3:00 PM before it reached the
   * first slot in the household's own lifetime, and every one of them aged into MISSED. An app
   * that greets a parent with six things they failed to do before they had an account is telling
   * them something untrue on their first afternoon.
   *
   * SINCE 2026-09-25 IT IS WHERE THE FIRST DAY'S SKIPS END, not where its grid begins (the owner:
   * *"It should still show from midnight in case if user wants to 'fix' the schedule"*). A rule
   * the household started with lays that day out from midnight like any other, and a slot before
   * this instant is skipped rather than missed — `start.ts` has the rule and the margin.
   *
   * Absent — an older caller, a household whose creation time is unknown — no rule counts as one
   * the household started with, and every rule grids from its own `effectiveFromMs`.
   */
  trackingFromMs?: number;
}

export const skipKey = (ruleId: string, atMs: number): string => `${ruleId}@${atMs}`;

/**
 * WHEN A ROW HAPPENED, for everything a person reads: the minute a done or late slot was really
 * logged (`matchedAtMs`), and the slot's own minute for everything else.
 *
 * `atMs` stays the grid time on purpose — it is the slot's identity (skips are keyed by it), and
 * it is what the next slot is counted from on a fixed rhythm — so a list, its order and its fold
 * ask this instead. A slot planned for 10:56 PM and fed at 11:08 PM reads 11:08 PM, beside a
 * diaper changed at 11:08 PM that also reads 11:08 PM (the owner, 2026-09-24).
 */
export function shownAtMs(o: Pick<Occurrence, 'atMs' | 'status' | 'matchedAtMs'>): number {
  return (o.status === 'DONE' || o.status === 'LATE') && o.matchedAtMs !== null
    ? o.matchedAtMs
    : o.atMs;
}

export function occurrence(
  rule: Rule,
  atMs: number,
  status: SlotStatus,
  extra: Partial<Omit<Occurrence, 'ruleId' | 'rule' | 'atMs' | 'status'>> = {},
): Occurrence {
  return {
    ruleId: rule.id,
    rule,
    atMs,
    status,
    matchedId: null,
    matchedAtMs: null,
    offGrid: false,
    expectedCount: 1,
    minutesLate: null,
    future: false,
    provisional: false,
    movedFromMs: null,
    beforeStart: false,
    ...extra,
  };
}
