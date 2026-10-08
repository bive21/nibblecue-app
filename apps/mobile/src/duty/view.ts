/**
 * WHO'S ON, AS EVERY SCREEN AND THE PLANNER SEE IT — the arithmetic `useDuty` and `useDutyShifts`
 * do over the local mirror, with no React in it (2026-09-29, the owner: *"make sure the system is
 * running as they should"*). The hooks memoise these and nothing else, so what the scenario tests
 * compute for a phone (`scenarios/duty.scenario.test.ts`) is what that phone's screens and its
 * reminder planner compute, not a copy of it.
 *
 * The rules are core's (`packages/core/src/schedule/duty.ts`); the reads are `db/queries/duty.ts`.
 */
import {
  canBeOn,
  dutyEndsAt,
  dutyNow,
  dutyProblem,
  dutyWait,
  handOver,
  liveShifts,
  remindedByDefault,
  type DutyList,
  type DutyMeta,
  type DutyShift,
  type DutyWait,
  type Role,
} from '@nibblecue/core';
import type { DutyPersonRow, DutyRead } from '../db/queries/duty';
import { DUTY, dutyStatus } from './copy';
import { overruledBy } from './overruled';

/** What the mirror holds, and whether it has been read yet. */
export interface DutyRaw extends DutyRead {
  loaded: boolean;
}

export const seatEndOf = (p: DutyPersonRow): number | null => {
  if (p.expires_at === null || p.expires_at === undefined) return null;
  const ms = Date.parse(p.expires_at);
  return Number.isNaN(ms) ? null : ms;
};

/**
 * WHO CAN BE ON RIGHT NOW: everyone still in the household who logs, and whose seat has not run
 * out. A sitter's evening seat that ended at eleven used to keep counting on every phone — the
 * mirror did not hold the end — so a sitter put on until the morning kept the parents' phones
 * quiet all night (the handoff audit's H4). The end is mirrored now, and it is read at the
 * minute: the parents' phones take the reminders back the minute the seat closes, with no sync.
 */
export const eligibleOf = (people: readonly DutyPersonRow[], nowMs: number): Set<string> =>
  new Set(
    people
      .filter(p => canBeOn(p.role))
      .filter(p => {
        const end = seatEndOf(p);
        return end === null || end > nowMs;
      })
      .map(p => p.id),
  );

/** The household's parents who can be on — the phones an ended night must reach (`routeFor`). */
export const parentsOf = (
  people: readonly DutyPersonRow[],
  eligible: ReadonlySet<string>,
): Set<string> =>
  new Set(people.filter(p => remindedByDefault(p.role) && eligible.has(p.id)).map(p => p.id));

/**
 * THE VIEWER'S ROLE, FROM THE SYNCED MEMBER LIST (the handoff audit's M6). The account's copy is
 * refreshed once per launch, so a caregiver made a parent kept being reminded as a caregiver —
 * nothing when nobody is on — until the app was restarted, while the Reminders page, which read
 * the member list, already said "The reminders you chose below". The mirror is pulled every pass;
 * the account's copy is the fallback until the first pull has brought the member list.
 */
export function roleOf(
  people: readonly DutyPersonRow[],
  viewerId: string | null,
  fallback: Role | null,
): Role | null {
  if (viewerId === null) return fallback;
  return people.find(p => p.id === viewerId)?.role ?? fallback;
}

/**
 * THE RECORD A PHONE ROUTES BY: the list's own, with the shifts it replaced cut to the ones still
 * to run.
 *
 * NOT TO THE PEOPLE WHO CAN STILL BE ON (2026-09-29). `was` is what the OTHER phones may still
 * hold, and a phone that has not pulled the member list since somebody left still honors their
 * shift and stays quiet for it. Cut to the eligible, a night whose person was removed at 11 p.m.
 * left the phone that knew with nothing to cover, while the phone that did not know stayed quiet
 * all night. The shifts themselves are still cut (`liveShifts(…, eligible)`): nobody is ON who
 * can no longer be.
 */
const metaOf = (list: DutyList, nowMs: number): DutyMeta => ({
  ...list.meta,
  was: liveShifts(list.meta.was, nowMs),
});

/** The planner's half (`useDutyShifts`). */
export interface DutyShiftsView {
  loaded: boolean;
  shifts: DutyShift[];
  meta: DutyMeta;
  parents: ReadonlySet<string>;
  /** The viewer's role from the synced member list (M6), or null before anything has loaded. */
  role: Role | null;
  /** The list exactly as the mirror holds it — what a confirmation writes back. */
  stored: DutyList;
}

/**
 * THE PLANNER'S HALF: the shifts still in force or to come, for people who can still be on, and
 * the record `routeFor` needs to know which of them are confirmed.
 */
export function dutyShiftsOf(
  raw: DutyRaw,
  viewerId: string | null,
  fallbackRole: Role | null,
  nowMs: number,
): DutyShiftsView {
  const eligible = eligibleOf(raw.people, nowMs);
  return {
    loaded: raw.loaded,
    shifts: liveShifts(raw.list.shifts, nowMs, eligible),
    meta: metaOf(raw.list, nowMs),
    parents: parentsOf(raw.people, eligible),
    role: roleOf(raw.people, viewerId, fallbackRole),
    stored: raw.list,
  };
}

export interface DutyPerson {
  id: string;
  /** Their display name, or null until their profile arrives. */
  name: string | null;
  role: Role;
  isViewer: boolean;
  /** When their access ends — a temporary caregiver's seat — or null. */
  seatEndMs: number | null;
}

/** Everything the screens read about who's on, without the things a person can do with it. */
export interface DutyState {
  loaded: boolean;
  nowMs: number;
  /** The shifts in force or still to come. */
  shifts: DutyShift[];
  /**
   * THE LIST AS IT IS STORED, ended shifts included — until somebody writes a new one. Today
   * reads it to know that tonight was already answered: a parent who was on until 3 is not asked
   * "who's on tonight?" at 3:05 when they open the app to log the feed.
   */
  recorded: DutyShift[];
  /**
   * THE SHIFTS OF THE ARRANGEMENT THIS ONE REPLACED, as stored (`DutyMeta.was`), ended ones too:
   * the look-back reads back through them to when the viewer was last on (`lookBack.ts`).
   */
  replaced: DutyShift[];
  /** The list with its record (0115): who set it, when, and whose phones have it. */
  list: DutyList;
  current: DutyShift | null;
  next: DutyShift | null;
  /** When the whole arrangement ends, or null when nobody is on. */
  endsAt: number | null;
  /** Everyone who can be on, the viewer first. */
  people: DutyPerson[];
  /** The view-only members, who are never reminded — listed so a page can say so. */
  viewOnly: DutyPerson[];
  viewerId: string | null;
  viewerRole: Role | null;
  /** Whether the viewer may start, change or end a shift — anyone who logs. */
  canChange: boolean;
  /** Two or more people who can be on: with one, there is nobody to hand the night to. */
  worthOffering: boolean;
  /** The people who can be on right now, by id. */
  eligible: ReadonlySet<string>;
  /** The parents who can be on — whose phones an ended night must reach. */
  parents: ReadonlySet<string>;
  /** When each temporary member's access ends. */
  seatEnds: ReadonlyMap<string, number>;
  /** Whose phones have not confirmed, and whether this one is covering for them (H1). */
  wait: DutyWait;
  /**
   * SOMEONE CHANGED WHO'S ON WITHOUT SEEING THIS PHONE'S CHANGE (M1): the server kept theirs, and
   * this is who, and when — so the screen can say so rather than silently showing something the
   * parent did not choose. Null otherwise.
   */
  overruled: { by: string; atMs: number | null; rev: string } | null;
}

const personOf = (p: DutyPersonRow, viewerId: string | null): DutyPerson => ({
  id: p.id,
  name: p.name,
  role: p.role,
  isViewer: p.id === viewerId,
  seatEndMs: seatEndOf(p),
});

export function dutyStateOf(
  raw: DutyRaw,
  viewerId: string | null,
  fallbackRole: Role | null,
  nowMs: number,
): DutyState {
  const viewerRole = roleOf(raw.people, viewerId, fallbackRole);
  const eligible = eligibleOf(raw.people, nowMs);
  const seatEnds = new Map<string, number>();
  for (const p of raw.people) {
    const end = seatEndOf(p);
    if (end !== null) seatEnds.set(p.id, end);
  }
  const everyone = raw.people.filter(p => eligible.has(p.id)).map(p => personOf(p, viewerId));
  // the viewer first: "Me" is the most common answer to "who's on tonight?"
  const people = [...everyone.filter(p => p.isViewer), ...everyone.filter(p => !p.isViewer)];
  const viewOnly = raw.people.filter(p => !canBeOn(p.role)).map(p => personOf(p, viewerId));
  const parents = parentsOf(raw.people, eligible);
  const shifts = liveShifts(raw.list.shifts, nowMs, eligible);
  const list: DutyList = { shifts, meta: metaOf(raw.list, nowMs) };
  const { current, next } = dutyNow(shifts, nowMs);
  return {
    loaded: raw.loaded,
    nowMs,
    shifts,
    recorded: raw.list.shifts,
    replaced: raw.list.meta.was,
    list,
    current,
    next,
    endsAt: dutyEndsAt(shifts, nowMs),
    people,
    viewOnly,
    viewerId,
    viewerRole,
    canChange: canBeOn(viewerRole),
    worthOffering: people.length >= 2,
    eligible,
    parents,
    seatEnds,
    wait: dutyWait(list, viewerId, nowMs, parents),
    overruled: overruledBy(raw.lastWrite, raw.list, viewerId, nowMs),
  };
}

/** One person the view knows, by id, or null. */
export const personIn = (state: Pick<DutyState, 'people'>, userId: string): DutyPerson | null =>
  state.people.find(p => p.id === userId) ?? null;

/** A person as the row names them: "You", their name, or "Someone" until their profile arrives. */
export const nameIn = (state: Pick<DutyState, 'people'>, userId: string): string => {
  const p = personIn(state, userId);
  return p === null ? DUTY.someone : p.isViewer ? DUTY.you : (p.name ?? DUTY.someone);
};

/**
 * WHETHER "TAKE OVER" IS OFFERED (the handoff audit's M3). To someone who may put people on, while
 * somebody ELSE is on now, and only while what is left of it is a shift the rules allow: at 6:50,
 * with the shift ending at 7:00, there is nothing to take, and the tap used to be refused with
 * "check the times" said to a parent who had chosen none. A sitter whose access ends before the
 * shift does is not offered it either (`pastAccess`).
 *
 * ONE RULE WHEREVER THE BUTTON IS (the owner, 2026-09-29: *"should we also enable it in family …
 * think about what's easiest for user"*): Today's row and the Reminders card, on the Reminders page
 * and on Family, all ask this, so no two of them can disagree; the scenarios ask it of each phone.
 */
export function canTakeOver(
  state: Pick<
    DutyState,
    'viewerId' | 'canChange' | 'current' | 'shifts' | 'nowMs' | 'eligible' | 'seatEnds'
  >,
): boolean {
  const uid = state.viewerId;
  const { current, nowMs } = state;
  if (uid === null || !state.canChange || current === null || current.userId === uid) return false;
  const list = handOver(state.shifts, uid, nowMs);
  return (
    list.some(s => s.userId === uid && s.fromMs <= nowMs && s.untilMs > nowMs) &&
    dutyProblem(list, nowMs, state.eligible, state.seatEnds) === null
  );
}

/** What Today's row and the Reminders card say about this phone (`useWhoIsOn`). */
export interface DutyRowView {
  /** The two lines, or null when nobody is on or due. */
  status: { title: string; line: string } | null;
  /** The viewer is on now, or takes over later tonight. */
  viewerOnOrNext: boolean;
  /** Whom this phone is ringing in place of, by name — "Waiting for Sam's phone" — or null. */
  waitingFor: string[] | null;
}

export function dutyRowOf(
  state: DutyState,
  input: {
    clock: (ms: number) => string;
    /** "Ada", "Emma and Liam" (`babyWord`). */
    baby: string;
    /** This phone cannot show a notification (`useNotificationPermission().off`). */
    permissionOff: boolean;
  },
): DutyRowView {
  const uid = state.viewerId;
  const nameOf = (userId: string) => nameIn(state, userId);
  const viewerOnOrNext =
    (state.current !== null && state.current.userId === uid) ||
    (state.next !== null && state.next.userId === uid);
  const waitingFor =
    state.wait.standingIn && state.wait.waitingFor.length > 0
      ? state.wait.waitingFor.map(nameOf)
      : null;
  const notYet =
    !state.wait.standingIn &&
    state.current !== null &&
    state.wait.unconfirmed.includes(state.current.userId)
      ? nameOf(state.current.userId)
      : null;
  const status =
    state.endsAt === null
      ? null
      : dutyStatus({
          current: state.current,
          next: state.next,
          viewerId: uid,
          nameOf,
          clock: input.clock,
          endsAt: state.endsAt,
          baby: input.baby,
          waitingFor,
          notYet,
          osOff: viewerOnOrNext && input.permissionOff,
          ownReminders: remindedByDefault(state.viewerRole),
        });
  return { status, viewerOnOrNext, waitingFor };
}
