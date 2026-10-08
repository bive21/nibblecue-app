/**
 * WHO GETS THE BABY'S REMINDERS — and WHO'S ON, the one person who takes them for a stretch so
 * everyone else can sleep.
 *
 * The owner, 2026-09-23, on a night split between two parents: *"this needs to be proper and easy
 * for user to do … how to easily 'manage' where these notifications are being sent to … think
 * about the scenarios, and make sure we are helping them."*
 *
 * ── THE RULES, IN THE WORDS A PARENT HOLDS IN THEIR HEAD ────────────────────────────────────
 *
 *   1. PARENTS get the baby's reminders on their own phones, at the level each of them picks on
 *      Reminders (sound, vibrate, silent or off, per kind). Nobody chooses it for them.
 *   2. CAREGIVERS — a nanny, a grandparent, a night nurse — get them only while they're on. A
 *      nanny's phone does not ring at 2 a.m. because they were once invited to help on Tuesdays.
 *   3. VIEW-ONLY members never get one.
 *   4. A PARENT'S OWN REMINDERS — pumping, the `mom` group in the module registry — go to the
 *      person the rule names and to nobody else, whoever is on. They are about a body, not a baby.
 *   5. WHO'S ON: while someone is on, the baby's reminders go to their phone and nobody else's —
 *      at the slot's own time (their quiet hours do not hold one back: being on means wanting to
 *      be told), with sound, or with vibration if that is how they keep them. A kind they turned
 *      off rings too: a shift that reached nobody is the one failure this cannot have.
 *
 * Rule 1 is also a repair. Until today every rule reminded only the person who created it and no
 * screen could change that, so a second parent who joined — or anyone whose partner did the
 * onboarding — was never reminded of anything, whatever their Reminders page said.
 *
 * ── A SHIFT ─────────────────────────────────────────────────────────────────────────────────
 *
 * One person from now until a time, or a night split in two ("you until 2, then me"). It always
 * ends — by itself, at most a day after it began — because a shift nobody remembered to end would
 * silently take every reminder away from everyone else for good.
 *
 * Pure: the zone, the clock and the household's day window arrive as arguments. The server makes
 * the same decision in SQL (`app.sync_reminders`, migration 0113) and `duty.test.ts` is the table
 * both are held to.
 */
import type { Role } from '../domain/domain-types';
import { MODULE_BY_ID, type ModuleId } from '../modules/module-registry';
import { atTimeAfter, hhmmOf, hm, inWindow, wallMinutes } from './time';
import { HOUR, MIN } from './types';

export interface DutyShift {
  userId: string;
  fromMs: number;
  untilMs: number;
}

/** What the household row holds: `household_duty.shifts`. */
export interface DutyShiftWire {
  user_id: string;
  from: string;
  until: string;
}

/** A whole shift, split or not, never outlives a day. */
export const DUTY_MAX_MS = 24 * HOUR;
/** Shorter than this is a mis-tap, not a shift. */
const DUTY_MIN_MS = 15 * MIN;
/** A whole stretch, or a night split in two. More is a rota, and a rota is a different feature. */
const DUTY_MAX_SHIFTS = 2;
/** A stretch this long may be split in two. */
const DUTY_SPLIT_MIN_MS = 4 * HOUR;
/** "Tonight" starts this long before the baby's bedtime — when parents decide who takes the night. */
export const DUTY_EVENING_LEAD_MIN = 60;
/** The shortest end the presets offer: a shift that ends in ten minutes is not worth starting. */
const DUTY_END_MIN_AHEAD_MS = 30 * MIN;
/** The "for a few hours" preset. */
const DUTY_HOURS_PRESET = 3;

/* ------------------------------------------------------------------ roles */

/** Parents are reminded without asking; caregivers only while they're on (rule 2). */
export const remindedByDefault = (role: Role | null): boolean =>
  role === 'OWNER' || role === 'PARENT';

/** Anyone who logs can take a shift. View-only members cannot (rule 3). */
export const canBeOn = (role: Role | null): boolean =>
  role === 'OWNER' || role === 'PARENT' || role === 'CAREGIVER';

/**
 * A baby's reminder follows whoever is on; a parent's own never does (rule 4). A module the
 * registry does not know is treated as the baby's — every retired or future module is one.
 */
export function followsDuty(activity: string): boolean {
  return MODULE_BY_ID[activity as ModuleId]?.group !== 'mom';
}

/* ------------------------------------------------------------------ the row */

export function dutyToWire(shifts: readonly DutyShift[]): DutyShiftWire[] {
  return shifts.map(s => ({
    user_id: s.userId,
    from: new Date(s.fromMs).toISOString(),
    until: new Date(s.untilMs).toISOString(),
  }));
}

/**
 * The row read back, forgivingly: a malformed entry is dropped rather than thrown, because the
 * reader is the notification planner and a planner that throws plans nothing at all.
 */
export function dutyFromWire(raw: unknown): DutyShift[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: DutyShift[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const userId = typeof r.user_id === 'string' ? r.user_id : null;
    const fromMs = typeof r.from === 'string' ? Date.parse(r.from) : NaN;
    const untilMs = typeof r.until === 'string' ? Date.parse(r.until) : NaN;
    if (userId === null || Number.isNaN(fromMs) || Number.isNaN(untilMs)) continue;
    out.push({ userId, fromMs, untilMs });
  }
  return out.sort((a, b) => a.fromMs - b.fromMs);
}

export type DutyProblem =
  | 'tooMany'
  | 'tooShort'
  | 'tooLong'
  | 'notJoined'
  | 'samePerson'
  | 'ended'
  | 'notEligible'
  | 'pastAccess';

/**
 * WHY A SET OF SHIFTS WOULD BE REFUSED, or null. The server keeps the same rules
 * (`app.duty_problem`), so a shift the phone accepts is one the server stores. Empty is always
 * fine — it is how a shift ends.
 *
 * `seatEnds` is when each temporary member's access ends (`household_members.expires_at`). A
 * shift that runs past it is refused (`pastAccess`, migration 0115; the handoff audit's H4): a
 * sitter whose evening seat ended at eleven, put on until the morning, kept every parent's phone
 * quiet all night while the reminders went to a phone that had left. The sheet offers "until
 * their access ends" instead.
 */
export function dutyProblem(
  shifts: readonly DutyShift[],
  nowMs: number,
  eligible: ReadonlySet<string>,
  seatEnds?: ReadonlyMap<string, number>,
): DutyProblem | null {
  if (shifts.length === 0) return null;
  if (shifts.length > DUTY_MAX_SHIFTS) return 'tooMany';
  const sorted = [...shifts].sort((a, b) => a.fromMs - b.fromMs);
  for (let i = 0; i < sorted.length; i += 1) {
    const s = sorted[i];
    if (s === undefined) continue;
    if (!eligible.has(s.userId)) return 'notEligible';
    const seatEnd = seatEnds?.get(s.userId);
    if (seatEnd !== undefined && s.untilMs > seatEnd) return 'pastAccess';
    if (s.untilMs - s.fromMs < DUTY_MIN_MS) return 'tooShort';
    const prev = sorted[i - 1];
    if (prev !== undefined) {
      if (prev.untilMs !== s.fromMs) return 'notJoined';
      if (prev.userId === s.userId) return 'samePerson';
    }
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return null;
  if (last.untilMs - first.fromMs > DUTY_MAX_MS) return 'tooLong';
  if (last.untilMs <= nowMs) return 'ended';
  return null;
}

/* ------------------------------------------------------------------ reading it */

/**
 * The shifts still in force or still to come, in order — what every reader works from. Given the
 * people who can be on, a shift for anyone else is dropped: someone who left the household or
 * became view-only mid-shift hands everyone's reminders back rather than taking them with them.
 */
export function liveShifts(
  shifts: readonly DutyShift[],
  nowMs: number,
  eligible?: ReadonlySet<string>,
): DutyShift[] {
  return shifts
    .filter(s => s.untilMs > nowMs && (eligible === undefined || eligible.has(s.userId)))
    .sort((a, b) => a.fromMs - b.fromMs);
}

/** Who is on at an instant, or null. */
export function shiftAt(shifts: readonly DutyShift[], atMs: number): DutyShift | null {
  return shifts.find(s => s.fromMs <= atMs && atMs < s.untilMs) ?? null;
}

/** The shift in force now, and the one after it when the night is split. */
export function dutyNow(
  shifts: readonly DutyShift[],
  nowMs: number,
): { current: DutyShift | null; next: DutyShift | null } {
  const live = liveShifts(shifts, nowMs);
  const current = shiftAt(live, nowMs);
  const next = live.find(s => s.fromMs > nowMs) ?? null;
  return { current, next };
}

/** When the whole arrangement ends — the last shift's end — or null when nobody is on or due. */
export function dutyEndsAt(shifts: readonly DutyShift[], nowMs: number): number | null {
  const live = liveShifts(shifts, nowMs);
  return live.length === 0 ? null : (live[live.length - 1]?.untilMs ?? null);
}

/**
 * HANDING OVER: from now, another person takes what is left of the current shift. A later half
 * of a split night stays as it was — unless it was already theirs, when the two halves become one.
 */
export function handOver(shifts: readonly DutyShift[], userId: string, nowMs: number): DutyShift[] {
  const live = liveShifts(shifts, nowMs);
  const current = shiftAt(live, nowMs);
  if (current === null) return live;
  const rest = live.filter(s => s.fromMs > nowMs);
  const next = rest[0];
  if (next !== undefined && next.userId === userId) {
    return [{ userId, fromMs: nowMs, untilMs: next.untilMs }, ...rest.slice(1)];
  }
  return [{ userId, fromMs: nowMs, untilMs: current.untilMs }, ...rest];
}

/* ------------------------------------------------------------------ the list's own record */

/**
 * WHICH ARRANGEMENT THIS IS, WHO SET IT, AND WHICH PHONES HAVE IT (migration 0115; the handoff
 * audit's H1 and M1, 2026-09-24).
 *
 * Phones learn a new shift only when the app next opens on them — there is no push until the
 * owner's APNs and FCM credentials exist — so a phone that goes quiet because SOMEONE ELSE is on
 * is betting that the other phone knows. When it did not, nobody was reminded: Sam put Dana on and
 * went to sleep, Dana's phone had never opened, and the 2 a.m. feed rang nowhere. The app said it
 * would work.
 *
 * So every list now carries its own record, and the rule is "twice, never missed": a phone only
 * goes quiet for a stretch once the phone of the person on for it has CONFIRMED the list — the
 * phone writes `seen` for itself the first time it holds a list naming it, and only when it can
 * ring (notifications allowed). Until then the phone that set the list keeps ringing as if it were
 * on itself (`routeFor`), and says so on the row ("Waiting for Dana's phone").
 *
 *   * `rev`  — this arrangement's id, fresh for every change. A confirmation keeps it.
 *   * `base` — the arrangement the writing phone last saw, which the server checks: a list written
 *              without knowing the one it would replace is not stored (M1 — two parents tapping at
 *              once), and the phone that lost says who changed it.
 *   * `by`, `at` — who set it, and when (the audit's U12: the row never said).
 *   * `was`  — the shifts it replaced, so the phone that ended or moved a night keeps covering the
 *              phones that still think the old one stands.
 *   * `seen` — whose phones have it, and since when.
 *
 * ON THE WIRE it is one more element of the `shifts` array, `{ "meta": { … } }`, rather than a
 * column: the local mirror stores the array as text and a new column would be a local schema
 * version, and a build from before this one reads the element as a malformed shift and skips it
 * (`dutyFromWire`), which is exactly right — it never knew any of this.
 */
export interface DutyMeta {
  rev: string | null;
  base: string | null;
  by: string | null;
  atMs: number | null;
  was: DutyShift[];
  seen: Readonly<Record<string, number>>;
}

export interface DutyList {
  /** In order; ended ones included until somebody writes a new list. */
  shifts: DutyShift[];
  meta: DutyMeta;
}

export const EMPTY_DUTY_META: DutyMeta = {
  rev: null,
  base: null,
  by: null,
  atMs: null,
  was: [],
  seen: {},
};

/** The meta element as it travels. */
interface DutyMetaWire {
  rev: string;
  base: string | null;
  by: string;
  at: string;
  was: DutyShiftWire[];
  seen: Record<string, string>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function metaFromWire(raw: unknown): DutyMeta | null {
  if (!isObject(raw)) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  const atMs = typeof raw.at === 'string' ? Date.parse(raw.at) : NaN;
  const seen: Record<string, number> = {};
  if (isObject(raw.seen)) {
    for (const [who, when] of Object.entries(raw.seen)) {
      const ms = typeof when === 'string' ? Date.parse(when) : NaN;
      if (!Number.isNaN(ms)) seen[who] = ms;
    }
  }
  return {
    rev: str(raw.rev),
    base: str(raw.base),
    by: str(raw.by),
    atMs: Number.isNaN(atMs) ? null : atMs,
    was: dutyFromWire(raw.was),
    seen,
  };
}

/**
 * THE ROW READ BACK WITH ITS RECORD. A list written before migration 0115 has none: it is read
 * as set by the row's own `updated_by` at its `updated_at` (`legacy`), confirmed by nobody else —
 * which keeps the phone that set it ringing, the safe side of a list nothing can confirm.
 */
export function dutyListFromWire(
  raw: unknown,
  legacy: { by: string | null; atMs: number | null } = { by: null, atMs: null },
): DutyList {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return { shifts: [], meta: { ...EMPTY_DUTY_META, ...legacy } };
    }
  }
  const shifts = dutyFromWire(list);
  const element = Array.isArray(list)
    ? list.find((e): e is { meta: unknown } => isObject(e) && 'meta' in e)
    : undefined;
  const meta = element === undefined ? null : metaFromWire(element.meta);
  return { shifts, meta: meta ?? { ...EMPTY_DUTY_META, ...legacy } };
}

/** The list as it is written: the shifts, then the one element carrying the record. */
export function dutyListToWire(list: DutyList): unknown[] {
  const { meta } = list;
  const shifts: unknown[] = dutyToWire(list.shifts);
  if (meta.rev === null || meta.by === null || meta.atMs === null) return shifts;
  const wire: DutyMetaWire = {
    rev: meta.rev,
    base: meta.base,
    by: meta.by,
    at: new Date(meta.atMs).toISOString(),
    was: dutyToWire(meta.was),
    seen: Object.fromEntries(
      Object.entries(meta.seen).map(([who, ms]) => [who, new Date(ms).toISOString()]),
    ),
  };
  return [...shifts, { meta: wire }];
}

/**
 * A NEW ARRANGEMENT, replacing `replacing`. The writer's own phone has it — `seen` starts with
 * them — and the shifts it replaced ride along in `was` while any of them is still to run.
 *
 * UNLESS THE WRITER PUT THEMSELVES ON FROM A PHONE THAT CANNOT RING (`writerCanRing: false`;
 * 2026-09-29). A phone goes quiet for a stretch only once the phone of the person on for it can
 * ring and has the list — the rule every other named phone is held to (`confirmNeeded` asks for
 * `named` only where notifications are allowed). The writer was the one exception: counted as
 * confirmed by writing, so a parent whose phone had never been allowed to notify, taking the night
 * from the sheet, sent every other phone quiet for a night their own phone could not ring. Such a
 * writer's phone is left out of `seen`, and confirms like any named phone once it can ring.
 */
export function newDutyList(
  shifts: readonly DutyShift[],
  input: {
    rev: string;
    by: string;
    atMs: number;
    replacing: DutyList | null;
    /** Whether the writing phone can show a notification. Absent: it can. */
    writerCanRing?: boolean;
  },
): DutyList {
  const before = input.replacing;
  const named = shifts.some(s => s.userId === input.by && s.untilMs > input.atMs);
  return {
    shifts: [...shifts].sort((a, b) => a.fromMs - b.fromMs),
    meta: {
      rev: input.rev,
      base: before?.meta.rev ?? null,
      by: input.by,
      atMs: input.atMs,
      was: before === null ? [] : liveShifts(before.shifts, input.atMs),
      seen: named && input.writerCanRing === false ? {} : { [input.by]: input.atMs },
    },
  };
}

/**
 * When this person's phone confirmed the list, or null. A list with a record says so in `seen` —
 * the writer's own phone included, from the moment it wrote the list when it could ring. A list
 * from before 0115 has no record: its writer (the row's `updated_by`) is read as having it.
 */
export function confirmedAt(meta: DutyMeta, userId: string): number | null {
  const seen = meta.seen[userId];
  if (seen !== undefined) return seen;
  return meta.rev === null && meta.by === userId ? meta.atMs : null;
}

export const isConfirmed = (meta: DutyMeta, userId: string): boolean =>
  meta.seen[userId] !== undefined || (meta.rev === null && meta.by === userId);

/** The same list, confirmed by one more phone — what that phone writes back (the server merges). */
export function withSeen(list: DutyList, userId: string, atMs: number): DutyList {
  return {
    shifts: list.shifts,
    meta: { ...list.meta, base: list.meta.rev, seen: { ...list.meta.seen, [userId]: atMs } },
  };
}

/**
 * THE STRETCHES OF THE OLD ARRANGEMENT THE NEW ONE LEAVES UNCOVERED, from now: an "End now" at
 * 3 a.m. leaves the rest of Dana's night with nobody on, and a phone that still holds the old list
 * stays quiet through it until it syncs.
 */
function uncoveredWas(list: DutyList, nowMs: number): DutyShift[] {
  const first = list.shifts[0];
  const last = list.shifts[list.shifts.length - 1];
  return liveShifts(list.meta.was, nowMs).filter(w => {
    if (first === undefined || last === undefined) return true;
    return Math.max(w.fromMs, nowMs) < first.fromMs || w.untilMs > last.untilMs;
  });
}

export type DutyConfirmKind = 'named' | 'parent';

/**
 * WHETHER THIS PERSON'S PHONE SHOULD CONFIRM THE LIST IT HOLDS, and why — or null.
 *
 *   * `named` — they are on, now or later. Their confirmation is what lets everyone else's phone
 *     go quiet, so the caller writes it only when this phone can actually ring.
 *   * `parent` — a parent whose phone was quiet under the arrangement this one replaced, for a
 *     stretch the new one leaves with nobody on (an "End now"). Until they confirm, the phone
 *     that ended it keeps covering them.
 *
 * A caregiver who is not named is never asked: their phone rings nothing with nobody on, so no
 * list changes what it does. A list with no record (written before 0115) cannot be confirmed.
 */
export function confirmNeeded(
  list: DutyList,
  userId: string,
  role: Role | null,
  nowMs: number,
): DutyConfirmKind | null {
  const { meta } = list;
  if (meta.rev === null || isConfirmed(meta, userId) || !canBeOn(role)) return null;
  if (liveShifts(list.shifts, nowMs).some(s => s.userId === userId)) return 'named';
  if (remindedByDefault(role) && uncoveredWas(list, nowMs).some(w => w.userId !== userId))
    return 'parent';
  return null;
}

export interface DutyWait {
  /** The people named in the list whose phones have not confirmed it yet, the viewer aside. */
  unconfirmed: string[];
  /**
   * Whether THIS phone is covering for any of them — the phone that set the list, or the one that
   * was on before it — so it keeps ringing as if on until they confirm.
   */
  standingIn: boolean;
  /** Whom this phone is waiting for: the unconfirmed people it covers, then any parent an ended night leaves behind. */
  waitingFor: string[];
}

/** What the row says about confirmation, from this phone's side (`routeFor` is the same rule, per reminder). */
export function dutyWait(
  list: DutyList,
  viewerId: string | null,
  nowMs: number,
  parents: ReadonlySet<string>,
): DutyWait {
  const { meta } = list;
  const unconfirmed: string[] = [];
  const waiting: string[] = [];
  let standingIn = false;
  for (const s of liveShifts(list.shifts, nowMs)) {
    if (s.userId === viewerId || isConfirmed(meta, s.userId)) continue;
    if (!unconfirmed.includes(s.userId)) unconfirmed.push(s.userId);
    const covering =
      viewerId !== null &&
      (meta.by === viewerId ||
        meta.was.some(w => w.userId === viewerId && w.untilMs > s.fromMs && w.fromMs < s.untilMs));
    if (covering) {
      standingIn = true;
      if (!waiting.includes(s.userId)) waiting.push(s.userId);
    }
  }
  if (viewerId !== null) {
    for (const w of uncoveredWas(list, nowMs)) {
      if (meta.by !== viewerId && w.userId !== viewerId) continue;
      for (const p of parents) {
        if (p === w.userId || p === viewerId || isConfirmed(meta, p)) continue;
        standingIn = true;
        if (!waiting.includes(p)) waiting.push(p);
      }
    }
  }
  return { unconfirmed, standingIn, waitingFor: waiting };
}

/* ------------------------------------------------------------------ the decision */

/** A person's stored level for one kind of reminder (`notification_preferences`). */
export interface ReminderPref {
  enabled: boolean;
  sound: boolean;
  vibrate: boolean;
}

export type DeliveryLevel = 'sound' | 'vibrate' | 'silent';

export interface Delivery {
  level: DeliveryLevel;
  /** Whether this person's quiet hours may hold it back. Never while they're on. */
  quietHours: boolean;
  /** The shift that sent it here — its copy says so — or null for an ordinary reminder. */
  onShift: DutyShift | null;
}

export interface DeliveryInput {
  activity: string;
  /** The slot's own time, before any quiet hours. */
  atMs: number;
  /** The rule's `remind_user_ids` — read only for a parent's own reminders (rule 4). */
  audience: readonly string[];
  userId: string;
  role: Role | null;
  /** This person's row for the kind, or undefined when they never set one. */
  pref: ReminderPref | undefined;
  shifts: readonly DutyShift[];
}

/** A person's own level for a kind: sound, vibrate or silent, from their preference (on when none). */
export const levelOf = (
  pref: Pick<ReminderPref, 'sound' | 'vibrate'> | undefined,
): DeliveryLevel =>
  pref === undefined || pref.sound ? 'sound' : pref.vibrate ? 'vibrate' : 'silent';

/**
 * The level for the person ON at the slot: sound, whatever their everyday level — being on is
 * being woken — unless they chose vibrate-only, which is how they asked to be woken. The server's
 * push asks the same question (`supabase/functions/_shared/push.ts`), so it rings the same way.
 */
export const onShiftLevel = (
  pref: Pick<ReminderPref, 'sound' | 'vibrate'> | undefined,
): DeliveryLevel => (pref !== undefined && !pref.sound && pref.vibrate ? 'vibrate' : 'sound');

/**
 * WHETHER, AND HOW, ONE REMINDER REACHES ONE PERSON. Null when it does not. The phone asks it
 * for its own user; the server asks it for everyone in the household.
 *
 * While someone is on, the level is sound unless they keep this kind on vibrate — silent or off
 * would be a shift that wakes nobody. Off-shift, their own level stands, quiet hours included.
 */
export function deliveryFor(input: DeliveryInput): Delivery | null {
  if (!canBeOn(input.role)) return null;
  if (followsDuty(input.activity)) {
    const shift = shiftAt(input.shifts, input.atMs);
    if (shift !== null) {
      if (shift.userId !== input.userId) return null;
      return { level: onShiftLevel(input.pref), quietHours: false, onShift: shift };
    }
    if (!remindedByDefault(input.role)) return null;
    if (input.pref !== undefined && !input.pref.enabled) return null;
    return { level: levelOf(input.pref), quietHours: true, onShift: null };
  }
  if (!input.audience.includes(input.userId)) return null;
  if (input.pref !== undefined && !input.pref.enabled) return null;
  return { level: levelOf(input.pref), quietHours: true, onShift: null };
}

export interface RouteInput extends DeliveryInput {
  /**
   * The list's own record (`DutyMeta`). Absent, every shift counts as confirmed — the behavior
   * before 0115, and what the server decides with: its push reaches the phone on whatever it
   * knows, so confirmation is a phone's problem, not a slot's.
   */
  meta?: DutyMeta;
  /** The parents (OWNER, PARENT) who can be on — the phones an ended night must reach. */
  parents?: ReadonlySet<string>;
}

/**
 * `deliveryFor`, ON A PHONE THAT CANNOT KNOW WHAT THE OTHER PHONES KNOW — "twice, never missed"
 * (migration 0115; the handoff audit's H1). One reminder, one person, with the list's record:
 *
 *   1. The viewer is on at the slot: their phone rings, as ever.
 *   2. Someone else is on and their phone has CONFIRMED the list: this phone is quiet, as ever.
 *   3. Someone else is on and their phone has NOT confirmed it: the phone that set the list — or
 *      the one that was on for that stretch before it — rings as if it were on itself, because the
 *      person named may not know yet. Anyone else's phone does what it would with nobody on.
 *   4. Nobody is on at the slot, but somebody was under the list this one replaced (an "End now",
 *      or a night shortened): a parent whose phone has not confirmed the change may still be quiet
 *      for it, so the phone that ended it — and the one that was on — keep covering until every
 *      such parent has confirmed.
 *
 * Duplicates are the price, and they are the right one: a reminder rung on two phones is a
 * nuisance; a reminder rung on none is the failure this feature exists to prevent.
 */
export function routeFor(input: RouteInput): Delivery | null {
  const meta = input.meta;
  if (meta === undefined || !followsDuty(input.activity)) return deliveryFor(input);
  const me = input.userId;
  const on = shiftAt(input.shifts, input.atMs);
  const before = shiftAt(meta.was, input.atMs);
  const asIfOn = (s: DutyShift): Delivery | null => {
    const d = deliveryFor({ ...input, shifts: [{ ...s, userId: me }] });
    return d === null ? null : { ...d, onShift: s };
  };
  if (on !== null) {
    if (on.userId === me || isConfirmed(meta, on.userId)) return deliveryFor(input);
    if (meta.by === me || (before !== null && before.userId === me)) return asIfOn(on);
    return deliveryFor({ ...input, shifts: [] });
  }
  if (before !== null && input.parents !== undefined && (meta.by === me || before.userId === me)) {
    const left = [...input.parents].some(
      p => p !== before.userId && p !== me && !isConfirmed(meta, p),
    );
    if (left) return asIfOn(before);
  }
  return deliveryFor(input);
}

/* ------------------------------------------------------------------ when */

export interface DayWindowLike {
  wake: string;
  bed: string;
}

/** From an hour before the baby's bedtime until the morning — when "who's on tonight?" is asked. */
export function isTonight(nowMs: number, window: DayWindowLike, timeZone: string): boolean {
  const from = hhmmOf((hm(window.bed) - DUTY_EVENING_LEAD_MIN + 24 * 60) % (24 * 60));
  return inWindow(timeZone, nowMs, from, window.wake);
}

export type DutyEndKey = 'morning' | 'bedtime' | 'hours' | 'access';

export interface DutyEndOption {
  key: DutyEndKey;
  atMs: number;
}

/**
 * THE ENDS A SHIFT OFFERS, most useful first: the morning, at night; the baby's bedtime, by day
 * (a nanny until the evening); and a few hours, always. Anything under half an hour away or over
 * a day is left out. "Other time" is the screen's own, on top of these.
 *
 * FOR SOMEONE WHOSE ACCESS ENDS (`seatEndMs`, a temporary caregiver's seat), no preset runs past
 * it — the server refuses such a shift (`pastAccess`) — and "until their access ends" is offered
 * in their place, first: the sitter booked for the evening is on for the evening, and the parents'
 * phones take the reminders back the minute the seat closes (the handoff audit's H4).
 */
export function dutyEndOptions(
  nowMs: number,
  window: DayWindowLike,
  timeZone: string,
  seatEndMs?: number | null,
): DutyEndOption[] {
  const morning: DutyEndOption = {
    key: 'morning',
    atMs: atTimeAfter(timeZone, nowMs, window.wake),
  };
  const bedtime: DutyEndOption = { key: 'bedtime', atMs: atTimeAfter(timeZone, nowMs, window.bed) };
  const hours: DutyEndOption = { key: 'hours', atMs: nowMs + DUTY_HOURS_PRESET * HOUR };
  const order = isTonight(nowMs, window, timeZone) ? [morning, hours] : [bedtime, hours];
  const seat = seatEndMs ?? null;
  const fits = (o: DutyEndOption) =>
    o.atMs - nowMs >= DUTY_END_MIN_AHEAD_MS &&
    o.atMs - nowMs <= DUTY_MAX_MS &&
    (seat === null || o.atMs <= seat);
  const presets = order.filter(fits);
  if (seat === null) return presets;
  // the seat's own end: a hard edge rather than a preset, so it is offered down to a shift's own
  // minimum — and not twice when a preset already lands on it to the minute
  const offered =
    seat - nowMs >= DUTY_MIN_MS &&
    seat - nowMs <= DUTY_MAX_MS &&
    !presets.some(o => Math.abs(o.atMs - seat) < MIN);
  if (!offered) return presets;
  const access: DutyEndOption = { key: 'access', atMs: seat };
  // first when it cut a preset short (the evening sitter "until the morning"), last otherwise
  const cut = order.some(o => o.atMs > seat && o.atMs - nowMs >= DUTY_END_MIN_AHEAD_MS);
  return cut ? [access, ...presets] : [...presets, access];
}

/** Whether a stretch is long enough to split — a night, not an afternoon. */
export const canSplit = (fromMs: number, untilMs: number): boolean =>
  untilMs - fromMs >= DUTY_SPLIT_MIN_MS;

/**
 * WHERE A NIGHT SPLITS BY DEFAULT: the whole hour nearest its middle ("you until 2, then me"),
 * kept at least an hour from either end so neither half is a token.
 */
export function defaultSplitAt(fromMs: number, untilMs: number, timeZone: string): number {
  const mid = fromMs + (untilMs - fromMs) / 2;
  const m = wallMinutes(timeZone, mid);
  const rounded = Math.round(m / 60) * 60;
  const at = Math.floor(mid / MIN) * MIN + (rounded - m) * MIN;
  return Math.min(Math.max(at, fromMs + HOUR), untilMs - HOUR);
}
