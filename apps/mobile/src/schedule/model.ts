/**
 * The mirror's rows as the engine wants them (docs/SCHEDULE_LOGIC.md §7). Pure: every function
 * here is a mapping over plain rows, so the read model in useSchedule.ts is a thin hook and the
 * screens' claims are tested in node.
 */
import {
  FEEDING,
  isFeeding,
  napAsRhythm,
  ruleFrom,
  sleepKindOf,
  type ActivityType,
  type DayWindow,
  type ModuleId,
  type NapOutlook,
  type Rhythm,
  type Rule,
  type RuleFields,
  type Beat,
  type Session,
  type SleepLog,
} from '@nibblecue/core';
import type { BeatRow, RuleRow, SessionRow, SleepRow } from '../db/queries/schedule';
import type { TimerNow } from '../db/queries/today';

const DAY = 86_400_000;
/** Postgres `time` mirrors as `HH:MM:SS`; the engine wants `HH:MM`. */
const hhmm = (t: string | null): string | null => (t === null ? null : t.slice(0, 5));

function jsonArray<T>(text: string | null | undefined): T[] {
  if (!text) return [];
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function ruleFromRow(r: RuleRow): Rule {
  return ruleFrom({
    id: r.id,
    activity: r.activity as ActivityType,
    ruleType: r.rule_type as Rule['ruleType'],
    childId: r.child_id,
    atLocalTime: hhmm(r.at_local_time),
    everyMinutes: r.every_minutes,
    relativeTo: r.relative_to as Rule['relativeTo'],
    offsetMinutes: r.offset_minutes,
    everyDays: r.every_days,
    repeat: r.repeat as Rule['repeat'],
    repeatDays: r.repeat_days === null ? null : jsonArray<number>(r.repeat_days),
    matchWindowMinutes: r.match_window_minutes,
    matchScope: r.match_scope as Rule['matchScope'],
    missAfterMinutes: r.miss_after_minutes,
    lateWindowMinutes: r.late_window_minutes,
    nightMode: r.night_mode as Rule['nightMode'],
    nightFrom: hhmm(r.night_from),
    nightTo: hhmm(r.night_to),
    nightEveryMinutes: r.night_every_minutes,
    nightAt: hhmm(r.night_at),
    targetPerDay: r.target_per_day,
    targetQuantity: r.target_quantity,
    reminderEnabled: r.reminder_enabled === 1,
    remindUserIds: jsonArray<string>(r.remind_user_ids),
    name: r.name,
    isActive: r.is_active === 1,
    effectiveFromMs: Date.parse(r.effective_from),
    careItemId: r.care_item_id,
  });
}

/** The sheet's draft, as the engine reads it — for `ruleShapeError` before anything is written. */
export function ruleFromFields(id: string, f: RuleFields): Rule {
  return ruleFrom({
    id,
    activity: f.activity,
    ruleType: f.rule_type,
    childId: f.child_id,
    atLocalTime: f.at_local_time,
    everyMinutes: f.every_minutes,
    relativeTo: f.relative_to,
    offsetMinutes: f.offset_minutes,
    everyDays: f.every_days,
    repeat: f.repeat,
    repeatDays: f.repeat_days,
    matchWindowMinutes: f.match_window_minutes,
    matchScope: f.match_scope,
    missAfterMinutes: f.miss_after_minutes,
    lateWindowMinutes: f.late_window_minutes,
    nightMode: f.night_mode,
    nightFrom: f.night_from,
    nightTo: f.night_to,
    nightEveryMinutes: f.night_every_minutes,
    nightAt: f.night_at,
    targetPerDay: f.target_per_day,
    targetQuantity: f.target_quantity,
    reminderEnabled: f.reminder_enabled,
    remindUserIds: f.remind_user_ids,
    name: f.name,
    isActive: f.is_active,
    effectiveFromMs: Date.parse(f.effective_from),
    careItemId: f.care_item_id,
  });
}

/** A logged row as the engine sees it. */
export function sessionFromRow(s: SessionRow): Session {
  return {
    id: s.id,
    type: s.type as ActivityType,
    childId: s.child_id,
    startMs: Date.parse(s.start_at),
    endMs: s.end_at === null ? null : Date.parse(s.end_at),
    careItemId: s.care_item_id,
    sleepKind: s.sleep_kind === 'NIGHT' || s.sleep_kind === 'NAP' ? s.sleep_kind : null,
  };
}

/** The rows this viewer may SEE: their own, and everything not marked private. */
export const visibleSessions = (
  rows: readonly SessionRow[],
  viewerId: string | null,
): SessionRow[] => rows.filter(s => s.is_private !== 1 || s.created_by === viewerId);

/**
 * THE ROWS THE ENGINE MAY COUNT — everything, with another caregiver's private entries reduced
 * to the four facts a slot needs and nothing else.
 *
 * *A log by anyone clears it for everyone* is the promise the whole schedule rests on, and a
 * private pump broke it: the engine was handed `visibleSessions`, so on a partner's phone the
 * slot that pump had answered went on ageing to DUE and then MISSED, and the partner's own local
 * reminder fired for a pump already done (the schedule audit's B9, 2026-09-19). The household
 * was told a thing had not happened, and it had.
 *
 * WHAT THIS DOES AND DOES NOT REVEAL, said plainly because it is a privacy trade the owner made
 * on 2026-09-20 with the cost in front of them. A redacted row carries the activity, the child,
 * and the start and end instants — enough for a slot to close. It carries no id anybody can look
 * up, no amount, no note, no sides, no care item, and no author: `sessionById` is still built
 * from the visible rows alone, so a slot answered this way draws as done with no detail line
 * beside it, and the timeline and the log never show the entry at all. What a partner can infer
 * is that SOMETHING of that kind happened near a time the household had already written down —
 * which is the minimum the promise above costs, and less than the app already tells them by
 * having a schedule at all.
 *
 * THE FORESIGHT ARITHMETIC IS DELIBERATELY NOT CHANGED (`beatsFrom` below still drops them). A
 * closed slot is one bit at a time the household chose; a median rebuilds a person's rhythm from
 * entries they marked private, and announces it. Those are different exposures and only the
 * first is worth the promise.
 */
export function engineSessions(rows: readonly SessionRow[], viewerId: string | null): Session[] {
  return rows.map(s => {
    const own = s.is_private !== 1 || s.created_by === viewerId;
    if (own) return sessionFromRow(s);
    return {
      // an id that cannot be looked up in `sessionById`, and is stable so a re-render does not
      // re-match the slot to a "different" session
      id: `private:${s.id}`,
      type: s.type as ActivityType,
      childId: s.child_id,
      startMs: Date.parse(s.start_at),
      endMs: s.end_at === null ? null : Date.parse(s.end_at),
      careItemId: s.care_item_id,
      sleepKind: s.sleep_kind === 'NIGHT' || s.sleep_kind === 'NAP' ? s.sleep_kind : null,
    };
  });
}

/**
 * THE STARTS THE FORESIGHT ENGINE MAY MEASURE (`packages/core/src/schedule/foresight.ts`).
 *
 * Two filters, and each is a rule the arithmetic would otherwise break:
 *
 *   * A PRIVATE ENTRY IS THE PERSON'S OWN — the same mom-privacy rule `visibleSessions` applies
 *     to the day. It counts towards a rhythm only for the caregiver who wrote it; on a partner's
 *     phone a median built on it would announce "usually a pump about now" from rows they are not
 *     allowed to see, which leaks the fact of the entry through the arithmetic.
 *   * A CHILD'S ENTRY IS THEIR OWN. Two babies' feeds interleaved read as one baby feeding twice
 *     as often, so every heads-up would be half an hour early for both while naming one of them.
 *     A row with no child — a pump, a glass of water — belongs to the household and counts for
 *     whoever is in view.
 *
 * A row whose `start_at` will not parse is dropped rather than carried as `NaN`, which would
 * poison the sort the median depends on.
 */
export function beatsFrom(
  rows: readonly BeatRow[],
  viewerId: string | null,
  childId: string | null,
): Beat[] {
  const out: Beat[] = [];
  for (const b of rows) {
    if (b.is_private === 1 && b.created_by !== viewerId) continue;
    if (b.child_id !== null && b.child_id !== childId) continue;
    const startMs = Date.parse(b.start_at);
    if (!Number.isFinite(startMs)) continue;
    out.push({ activity: b.type, startMs });
  }
  return out;
}

/** Who the nap outlook reads for, and on which clock and window a blank kind is filed. */
export interface NapLogScope {
  viewerId: string | null;
  childId: string | null;
  /** The zone the phone was in at an instant (`zoneClocks(...).zoneAt`). */
  zoneAt: (ms: number) => string;
  window: DayWindow;
}

/**
 * THE SLEEP LOG THE NAP OUTLOOK READS (`useNapOutlook`): the child's logged sleeps, AND THE SLEEP
 * TIMER RUNNING FOR THAT CHILD, AS THE OPEN SLEEP IT IS.
 *
 * The engine reads a sleep with no end as the baby being asleep (`napOutlook`: "a running timer is
 * being asleep") — but a running sleep lives in `running_timers`, never in `activities`, until it
 * is stopped, and the hook handed the engine the entries alone (the pre-release sweep of
 * 2026-09-24). So while the NOW card said "Sleeping 50m", the nap card read the baby as AWAKE since
 * the last finished sleep and named a next nap; its asleep state could never be reached, and the
 * notification planner planned a nap heads-up off that same awake reading.
 *
 * The timer's kind is filed the way its stop will file it — by its start against the household's
 * window (`timerSleepKind`), not by the `meta.kind` hint the sheet left, which a corrected start
 * makes stale. A private entry of somebody else's is not counted (the hook's own rule); a timer has
 * no privacy flag and is on every caregiver's NOW card, so it counts.
 */
export function napLogs(
  rows: readonly SleepRow[],
  timers: readonly TimerNow[],
  scope: NapLogScope,
): SleepLog[] {
  const logs: SleepLog[] = [];
  for (const r of rows) {
    if (r.is_private === 1 && r.created_by !== scope.viewerId) continue;
    if (r.child_id !== null && r.child_id !== scope.childId) continue;
    const startMs = Date.parse(r.start_at);
    if (!Number.isFinite(startMs)) continue;
    const endMs = r.end_at === null ? null : Date.parse(r.end_at);
    const stored = r.sleep_kind === 'NIGHT' ? 'NIGHT' : r.sleep_kind === 'NAP' ? 'NAP' : null;
    logs.push({
      startMs,
      endMs: endMs !== null && Number.isFinite(endMs) ? endMs : null,
      kind: sleepKindOf(stored, scope.zoneAt(startMs), startMs, scope.window, endMs),
    });
  }
  for (const t of timers) {
    if (t.type !== 'sleep' || t.childId !== scope.childId) continue;
    if (!Number.isFinite(t.startedAtMs)) continue;
    logs.push({
      startMs: t.startedAtMs,
      endMs: null,
      kind: sleepKindOf(null, scope.zoneAt(t.startedAtMs), t.startedAtMs, scope.window),
    });
  }
  return logs;
}

/**
 * THE RHYTHMS A HEADS-UP IS PLANNED FROM (`useLocalNotifications`): the foresight engine's, with
 * the sleep rhythm taken from the nap outlook wherever it has one — and, WHILE THE BABY IS ASLEEP,
 * no sleep rhythm at all.
 *
 * `napAsRhythm` is null while asleep on purpose: "the next lying-down is not a thing to warn about
 * from inside the current one". The planner read that null as "no outlook" and fell back to the
 * start-to-start sleep rhythm, which is exactly the heads-up the null exists to prevent. It never
 * showed while the outlook could not see a running sleep; since it can (`napLogs`, the sweep of
 * 2026-09-24), the asleep case is ordinary and has to mean what the engine says it means.
 *
 * THE OUTLOOK IS THE ONLY SOURCE OF A SLEEP HEADS-UP (2026-09-28). The start-to-start rhythm used to
 * stand in wherever the outlook named no next sleep while the baby was awake. But the outlook says
 * nothing on purpose there: awake in the night, a gap in the log (a nap nobody logged), too few days
 * yet. The fallback spoke exactly where the better arithmetic had decided there was nothing to say,
 * so it is gone, and a sleep heads-up now always has the outlook's lead and words (`napAsRhythm`).
 *
 * AND NONE AT ALL, WHERE THE HOUSEHOLD HAS NOT GOT ONE (2026-10-01, `HeadsUpScope`): with Sleep
 * turned off on What you track there is no sleep heads-up, and since the owner made it Plus ("my
 * decision for nap predictor, keep it plus") none on a plan without `patterns` either. The feed and
 * pump heads-ups are untouched by both. The child the outlook read rides on the rhythm, so the
 * planner stands it down for that child's own nap times or bedtime and nobody else's.
 */
export function headsUpRhythms(
  foresight: readonly Rhythm[],
  outlook: NapOutlook,
  scope: HeadsUpScope = {},
): Rhythm[] {
  const others = foresight.filter(r => r.activity !== 'sleep');
  if (scope.sleepOn === false || scope.patterns === false) return others;
  const nap = outlook.state === 'asleep' ? null : napAsRhythm(outlook, scope.childId);
  return nap === null ? others : [...others, nap];
}

/**
 * WHAT DECIDES THE SLEEP HEADS-UP BESIDE THE OUTLOOK ITSELF (`useLocalNotifications` passes all
 * three). A field left out leaves things as they were before it existed: on, and no child named.
 */
export interface HeadsUpScope {
  /** Whose log the outlook read (`useNapOutlook`), or null in a household with no child. */
  childId?: string | null;
  /** Sleep is on in What you track. Off, the sleep log is not read for a heads-up at all. */
  sleepOn?: boolean;
  /** The household's plan can use `patterns`, the gate the nap outlook is sold under. */
  patterns?: boolean;
}

export function timerAsSession(t: TimerNow): Session {
  return {
    id: t.id,
    type: t.type,
    childId: t.childId,
    startMs: t.startedAtMs,
    endMs: null,
    running: true,
  };
}

/**
 * WHEN THE HOUSEHOLD BEGAN, as the schedule hands it to the engine (`EngineContext.trackingFromMs`)
 * — the instant that makes the household's first day run from midnight with the part before it
 * skipped rather than missed (core's `schedule/start.ts`; the owner, 2026-09-25).
 *
 * THE ACCOUNT'S COPY FIRST (`Membership.household_created_at`), THE MIRROR'S SECOND. It used to be
 * the mirror's alone, and the mirror is exactly where a household that has just been set up has
 * no `households` row: on the in-app test backend never (its sync fake serves none), and on a real
 * project not until the first pull lands, which the seeder's local writes usually beat. With no
 * instant the engine cannot tell the first day from any other and keeps the rule a household gets
 * for a rhythm written into a day already going — nothing before the rule, the first slot fifteen
 * minutes in. That was the owner's report (2026-09-26): an account made at 11:30 PM, rules written
 * at 11:31 by setup, and a Schedule tab whose day was one row, 11:46 PM, with nothing before it.
 *
 * The two copies are the same column read two ways, so they never disagree; the account is simply
 * the one every build has from the first frame. Null when neither parses — an older caller's
 * behavior, which is what core does with no household start.
 */
export function householdBeganMs(
  fromAccount: string | null | undefined,
  fromMirrorMs: number | null | undefined,
): number | null {
  const account = typeof fromAccount === 'string' ? Date.parse(fromAccount) : Number.NaN;
  if (Number.isFinite(account)) return account;
  return typeof fromMirrorMs === 'number' && Number.isFinite(fromMirrorMs) ? fromMirrorMs : null;
}

/** How far back the sessions have to reach: two days for slots, a month for a cadence. */
export function lookbackMs(rules: readonly Rule[]): number {
  return rules.some(r => r.ruleType === 'CADENCE') ? 31 * DAY : 2 * DAY;
}

/**
 * WHETHER A RULE'S MODULE IS ON, as the day asks the engine (`ScheduleOptions.enabled`): a feeding
 * rule shows while either feed module is on, because it is about feeding and not the bottle, and
 * before the account's modules are read every rule does. One predicate for today's day and for the
 * History page's past ones (`useScheduleHistory`), so a module switched off leaves both alike.
 */
export const ruleModuleOn =
  (enabled: ReadonlySet<ModuleId>) =>
  (activity: Rule['activity']): boolean =>
    enabled.size === 0 ||
    enabled.has(activity as ModuleId) ||
    (isFeeding(activity) && FEEDING.some(f => enabled.has(f as ModuleId)));

/** The rules a view of one child shows: its own and the household's; "both" shows every rule. */
export function scopeRules(rules: readonly Rule[], childId: string | null): Rule[] {
  return childId === null
    ? [...rules]
    : rules.filter(r => r.childId === null || r.childId === childId);
}

export const activitiesOf = (rules: readonly Rule[]): ActivityType[] => [
  ...new Set(rules.map(r => r.activity)),
];

/**
 * THE KINDS OF ENTRY A DAY OF THE SCHEDULE READS: its rules' own, both kinds of feed (either answers
 * a feeding slot), the sleeps a slot set off waking or bedtime hangs from, and the rest the cards
 * beside the day read. One list for today's read (`useScheduleDay`) and the History page's
 * (`historyWindow.ts`), so a past day is handed the kinds of entry today is.
 */
export const sessionTypesOf = (rules: readonly Rule[]): ActivityType[] => [
  ...new Set<ActivityType>([
    ...activitiesOf(rules),
    'bottle',
    'breastfeed',
    'pump',
    'diaper',
    'med',
    'bath',
    'sleep',
    'solids',
  ]),
];
