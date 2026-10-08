/**
 * LOG TOGETHER: THE CARD ON TODAY FOR A PARENT WHO IS ALONE IN THE HOUSEHOLD (the owner, 2026-09-28,
 * of "Invite the other parent: a one-time card in week one": *"Yes agreed not just week 1"*;
 * docs/GROWTH_AND_RETENTION.md §8 item 2, docs/SHARED_CARE.md §6).
 *
 * Two-phone households are the ones that stay (GROWTH_AND_RETENTION §3), and both parents on their
 * own phones is the free plan's (CLAUDE.md §4). Nothing said so to a parent who set up alone except
 * a row in Family. So one card says it, and everything below is what keeps a question about
 * somebody's family from becoming a nag:
 *
 *   WHO IT IS FOR. The owner or a parent (the people who may invite a parent), with nobody else in
 *   the household now: the local mirror of `household_members`, less the removed and every seat
 *   that has ended. And never a household a parent has LEFT: the card asks whether someone parents
 *   with you, and asking that the week the other parent left is the wrong question to ask.
 *
 *   WHAT ENDS IT, for good on this phone. *Just me* (a single parent is never asked again), and an
 *   invite made on this phone (the app never reads `invites`, so it cannot see one waiting: the
 *   phone that made one is the phone that knows). Somebody else being in the household hides it on
 *   every phone at once, because it is read from the synced member list.
 *
 *   WHAT RESTS IT. *Not now*, for a month (`INVITE_CARD_RULES.notNowRestDays` says why a month).
 *   *Invite* opens Family, and the card steps aside for the rest of the day, so a parent who looked
 *   and came back without an invite is not asked again the moment they return.
 *
 *   WHEN IT MAY RISE. Never in the first session and never on the first day. In the daytime on the
 *   phone's clock only (core's `DAYTIME`), never in Night, never while anything is going on (a timer,
 *   a sheet, the tour, a celebration card), never over a higher card (it is the banner slot's last),
 *   and never on a day a growth prompt already asked. And only AS TODAY COMES TO THE FRONT: the card
 *   is in the slot above the Log tiles, and one that appeared in the middle of a visit would move
 *   them under a thumb. Once up it stays for the visit, as a card does, until it is answered.
 *
 * PURE. The app hands in every fact: the mirror's seats, the answer kept on this phone, the
 * launch's number, the phone's hour and the start of its day. Nothing here reads a clock or a store.
 */
import type { Role } from '../domain/domain-types';
import type { GrowthRecord } from '../growth';
import { isDaytimeHour } from '../today/daytime';

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ the answers */

/**
 * WHAT THIS PERSON DID WITH THE CARD, ON THIS PHONE. `OPENED` is *Invite* tapped (Family opened),
 * `INVITED` an invite made in Family, whether or not the card was the way there.
 */
export const INVITE_CARD_ANSWERS = ['OPENED', 'NOT_NOW', 'JUST_ME', 'INVITED'] as const;
export type InviteCardAnswer = (typeof INVITE_CARD_ANSWERS)[number];

export interface InviteCardRecord {
  answer: InviteCardAnswer;
  /** When, on this phone's clock. */
  atMs: number;
}

export const INVITE_CARD_RULES = {
  /**
   * NOT NOW RESTS IT FOR A MONTH. Long enough that the card is a question asked a few times a year
   * at most, never a fixture of Today; short enough that a household whose arrangement changes (a
   * partner's leave ending, a grandparent moving in to help, a co-parent's new phone) meets it again
   * while it can still help. It is the rhythm the monthly note already keeps with a family, and it
   * is twice the fortnight the growth prompts share, because this one asks about the family itself.
   * *Just me* is always beside it, for the parent who would rather not be asked at all.
   */
  notNowRestDays: 30,
  /** Never on the first day: a whole day since this person arrived. */
  firstDayMs: DAY_MS,
  /** Never in the first session: the launch counted first on this phone. */
  firstSession: 1,
} as const;

/** The answers that end it for good: *Just me*, and an invite made on this phone. */
export const inviteCardEnded = (record: InviteCardRecord | null): boolean =>
  record !== null && (record.answer === 'JUST_ME' || record.answer === 'INVITED');

/**
 * A NEW ANSWER, KEPT: it replaces the one before, except that nothing replaces an answer that ended
 * the card. A *Not now* tapped on an older build's copy of the card, or an *Invite* whose Family
 * page is still open, never brings back a card the parent said *Just me* to.
 */
export function keepInviteAnswer(
  held: InviteCardRecord | null,
  next: InviteCardRecord,
): InviteCardRecord {
  return held !== null && inviteCardEnded(held) && !inviteCardEnded(next) ? held : next;
}

/**
 * TWO COPIES OF THE ANSWER, RECONCILED: the one in memory and the one read back from the phone's
 * preferences. A read that set off before a write landed would otherwise put the older answer back
 * (an *Invite* tapped, Family opened, and the re-read on leaving Today finding the tap not yet
 * written), and the card would be asked again on the way back. An answer that ended it wins, then
 * the later of the two; no answer loses to any.
 */
export function newerInviteRecord(
  a: InviteCardRecord | null,
  b: InviteCardRecord | null,
): InviteCardRecord | null {
  if (a === null) return b;
  if (b === null) return a;
  const endA = inviteCardEnded(a);
  const endB = inviteCardEnded(b);
  if (endA !== endB) return endA ? a : b;
  return b.atMs > a.atMs ? b : a;
}

/**
 * THE ANSWER AS THE PHONE KEPT IT, read back. Nothing stored is no answer (null). A value that is
 * there and does not read is taken as the answer that ENDS it: it can only have been written by
 * this file or a later build's, so the parent answered something, and silence is the safe
 * direction to be wrong in. An extra ask is the one mistake this card must not make.
 */
export function readInviteCardRecord(raw: string | null): InviteCardRecord | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { answer?: unknown; atMs?: unknown } | null;
    const answer = v?.answer;
    const atMs = v?.atMs;
    if (
      typeof answer === 'string' &&
      (INVITE_CARD_ANSWERS as readonly string[]).includes(answer) &&
      typeof atMs === 'number' &&
      Number.isFinite(atMs)
    ) {
      return { answer: answer as InviteCardAnswer, atMs };
    }
  } catch {
    // unreadable: the same answer as below
  }
  return { answer: 'JUST_ME', atMs: 0 };
}

/* ------------------------------------------------------------------ who else is here */

/** One row of `household_members` as the phone's mirror holds it, as much as the card reads. */
export interface HouseholdSeat {
  userId: string;
  role: Role;
  /** When they left or were removed. The row stays, so their entries keep their name. */
  removedAt: string | null;
  /** When a temporary caregiver's seat ends (migration 0101), or null for a permanent member. */
  expiresAt: string | null;
}

export interface HouseholdCompany {
  /** This person's own role, as the mirror holds it; null until their row has been pulled. */
  selfRole: Role | null;
  /** Everyone else in the household now: not removed, and not on a seat that has ended. */
  others: number;
  /** Parents, the owner included, who were in this household and have left it. */
  formerParents: number;
}

/**
 * WHO ELSE IS IN THE HOUSEHOLD, from the mirror. A seat that has ended is nobody (the babysitter's
 * evening is over), and so is a member who left. A seat whose end does not read is counted as
 * still running: the household is then not alone, which shows nothing, the safe direction.
 */
export function householdCompany(
  seats: readonly HouseholdSeat[],
  selfId: string,
  nowMs: number,
): HouseholdCompany {
  let selfRole: Role | null = null;
  let others = 0;
  let formerParents = 0;
  for (const seat of seats) {
    if (seat.userId === selfId) {
      if (seat.removedAt === null) selfRole = seat.role;
      continue;
    }
    if (seat.removedAt !== null) {
      if (seat.role === 'OWNER' || seat.role === 'PARENT') formerParents += 1;
      continue;
    }
    const end = seat.expiresAt === null ? null : Date.parse(seat.expiresAt);
    if (end !== null && Number.isFinite(end) && end <= nowMs) continue;
    others += 1;
  }
  return { selfRole, others, formerParents };
}

/* ------------------------------------------------------------------ whether it is owed */

export interface InviteCardFacts {
  /** The owner or a parent, from the account (`usePlan().decides`): who may invite a parent. */
  decides: boolean;
  /** Who else is here, from the mirror (`householdCompany`); null until it has been read. */
  company: HouseholdCompany | null;
  /** This person's answer on this phone, or null for none. */
  record: InviteCardRecord | null;
  /** This launch's number on this phone, counted once per launch; 1 is the first session. */
  session: number;
  /** When this person arrived: the day they joined the household, or it began (`arrivedMs`). */
  arrivedMs: number;
  nowMs: number;
  /** Midnight at the start of today, on the phone's own clock. */
  phoneDayStartMs: number;
}

export type InviteCardOwed = { owed: true } | { owed: false; because: string };

/**
 * WHETHER THE CARD IS OWED TO THIS PERSON, whatever the moment. The reason is returned rather than
 * logged, because "why is it not showing" is the question every test of it asks.
 */
export function inviteCardOwed(f: InviteCardFacts): InviteCardOwed {
  const no = (because: string): InviteCardOwed => ({ owed: false, because });
  if (!f.decides) return no('not a parent');
  if (f.record !== null && inviteCardEnded(f.record)) {
    return no(f.record.answer === 'JUST_ME' ? 'just me' : 'invited');
  }
  if (f.company === null || f.company.selfRole === null) return no('members not read');
  // the account's copy of the role is read once a launch; the mirror's is pulled every pass
  if (f.company.selfRole !== 'OWNER' && f.company.selfRole !== 'PARENT') {
    return no('not a parent here');
  }
  if (f.company.others > 0) return no('not alone');
  if (f.company.formerParents > 0) return no('a parent was here');
  if (f.session <= INVITE_CARD_RULES.firstSession) return no('first session');
  if (f.nowMs - f.arrivedMs < INVITE_CARD_RULES.firstDayMs) return no('first day');
  if (f.record !== null) {
    const rest = INVITE_CARD_RULES.notNowRestDays * DAY_MS;
    if (f.record.answer === 'NOT_NOW' && f.nowMs - f.record.atMs < rest) return no('resting');
    if (f.record.answer === 'OPENED' && f.record.atMs >= f.phoneDayStartMs) {
      return no('opened today');
    }
  }
  return { owed: true };
}

/* ------------------------------------------------------------------ when it may rise */

export interface InviteCardMoment {
  /** The phone's local hour, 0 to 23. */
  hour: number;
  /** Night, the amber theme, is what is painted. */
  night: boolean;
  /** A timer running anywhere in the household, a sheet, popover or gate up, the tour or a tip. */
  busy: boolean;
  /** Nothing above it in the banner slot drew: no travel, plan, team or growth card. */
  slotFree: boolean;
  /** A growth prompt asked today, on the phone's calendar (`growthAskedSince`). */
  growthAskedToday: boolean;
}

export function inviteCardMayRise(m: InviteCardMoment): boolean {
  if (!m.slotFree || m.busy || m.night || m.growthAskedToday) return false;
  return isDaytimeHour(m.hour);
}

/** A growth prompt asked since `sinceMs`: an impression is the ask (docs/GROWTH_PROMPTS.md §5). */
export const growthAskedSince = (
  history: readonly Pick<GrowthRecord, 'event' | 'atMs'>[],
  sinceMs: number,
): boolean => history.some(r => r.event === 'IMPRESSION' && r.atMs >= sinceMs);

/* ------------------------------------------------------------------ up, or not */

export interface InviteCardShowing {
  /** The card was up a moment ago, in this visit. */
  wasUp: boolean;
  /** Today came to the front with this render: the moment the page is drawn for the parent. */
  arriving: boolean;
  /** `inviteCardOwed`, now. */
  owed: boolean;
  /** `inviteCardMayRise`, now. */
  may: boolean;
  /** Today is in front and the app is open. */
  awake: boolean;
  /** Nothing above it in the banner slot drew. */
  slotFree: boolean;
}

/**
 * WHETHER THE CARD IS UP, from one moment to the next. It RISES only as Today comes to the front,
 * and only when it may; once up it STAYS for the visit, whatever starts meanwhile, because a card
 * that vanished when a timer started would be the page moving under the parent. It goes the moment
 * it is answered, the moment somebody else is in the household, when a higher card takes the slot,
 * and when Today is left, and it is decided afresh on the next arrival.
 */
export function inviteCardShown(s: InviteCardShowing): boolean {
  if (!s.owed || !s.awake || !s.slotFree) return false;
  return s.wasUp || (s.arriving && s.may);
}
