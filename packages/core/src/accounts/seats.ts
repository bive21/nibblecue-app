/**
 * TEMPORARY SEATS — a caregiver who is here for an evening, a week or a month, and whose
 * access ends WITHOUT ANYONE HAVING TO REMEMBER (the owner, 2026-09-22: *"build the module to
 * give access to temporary caregiver. The list of caregiver currently active need to be shown
 * with it's expiry date"*).
 *
 * The whole feature is the end date. A seat somebody must remember to revoke is a seat that
 * never gets revoked, and the babysitter from March is still reading the household's log in
 * November. So the expiry is a column the server enforces (migration 0101: `app.is_member` and
 * `app.role_in` both carry the clause, which is every policy in the schema at once) and this
 * file is only the words and the arithmetic the screens need — pure, RN-free, testable in node.
 *
 * NOTHING HERE DECIDES ENTITLEMENT. `seatsLeft` and `canInviteRole` take what the plan matrix
 * handed them (`limitFor('caregivers', tier)`, `can('caregivers', tier)`) and count; they never
 * read a tier name (CLAUDE.md §4).
 */
import type { Role } from '../domain/domain-types';

/**
 * The lengths the invite offers, beside "Until I turn it off". Hours, because that is what the
 * server's `seat_hours` is. THREE SINCE 2026-10-08 (the owner: *"Simplify the inviting caregiver to
 * household period options, this evening is not needed. Do 24 hour 1 week 1 month and until I turn
 * off"*): the six-hour evening went. A seat made before then still counts down as it was
 * (`seatLabel` reads any length), and the server takes any length up to a year.
 */
export interface SeatDuration {
  hours: number;
  /** The chip, in the app's voice: a length of time, not a number of hours. */
  label: string;
  /** What the parent is told the code will do, once it is redeemed. */
  detail: string;
}

export const SEAT_DURATIONS: readonly SeatDuration[] = [
  { hours: 24, label: '24 hours', detail: '24 hours from the moment they join' },
  { hours: 24 * 7, label: '1 week', detail: 'one week from the moment they join' },
  { hours: 24 * 30, label: '1 month', detail: 'thirty days from the moment they join' },
];

/** The chip for a seat with no end: it lasts until a parent removes them on Family. */
export const SEAT_UNTIL_OFF = 'Until I turn it off';

/** The server's own bound (`invites.seat_hours` check). A year is not "temporary" past this. */
export const MAX_SEAT_HOURS = 24 * 365;

export const isSeatLength = (hours: number): boolean =>
  Number.isInteger(hours) && hours > 0 && hours <= MAX_SEAT_HOURS;

/**
 * How long a seat has left, as something a screen can put into a sentence. `null` in means a
 * permanent member and `null` out: the row says nothing, which is right — "forever" is not a
 * fact a parent needs told about the person they live with.
 */
export type SeatRemaining =
  | { kind: 'ended' }
  | { kind: 'minutes'; n: number }
  | { kind: 'hours'; n: number }
  | { kind: 'days'; n: number };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function seatRemaining(expiresAt: string | null, now: number): SeatRemaining | null {
  if (expiresAt === null) return null;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0) return { kind: 'ended' };
  // Rounded UP at every step, because a seat that says "1 hour left" and has 61 minutes is
  // honest, and one that says "0" while it still works is a lie about access.
  if (left < HOUR) return { kind: 'minutes', n: Math.ceil(left / MIN) };
  if (left < DAY) return { kind: 'hours', n: Math.ceil(left / HOUR) };
  return { kind: 'days', n: Math.ceil(left / DAY) };
}

/** The line beside a temporary member's role, or null for a permanent one. */
export function seatLabel(expiresAt: string | null, now: number): string | null {
  const r = seatRemaining(expiresAt, now);
  if (r === null) return null;
  if (r.kind === 'ended') return 'Access ended';
  const unit =
    r.kind === 'minutes'
      ? r.n === 1
        ? 'minute'
        : 'minutes'
      : r.kind === 'hours'
        ? r.n === 1
          ? 'hour'
          : 'hours'
        : r.n === 1
          ? 'day'
          : 'days';
  return `${r.n} ${unit} left`;
}

/**
 * HOW MANY MORE PARENTS THIS HOUSEHOLD MAY HAVE. `limit` is what the matrix returned: a number
 * on the free plan, `null` when the capability is not counted for this tier (Plus). The caller
 * hands in the LIVE count of parents, owner included (`parentsIn`), which is exactly what the
 * server's roster returns.
 */
export function seatsLeft(liveParents: number, limit: number | null): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - liveParents);
}

/** The household's parents, owner included: the people the free plan holds. */
export const parentsIn = (members: readonly { role: Role }[]): number =>
  members.filter(m => m.role === 'OWNER' || m.role === 'PARENT').length;

/**
 * WHO THIS HOUSEHOLD MAY INVITE NOW (the owner, 2026-09-27: *"caretaker only avail on plus"*).
 *
 * The free plan is the two parents, each on their own phone: a parent's invite is open while the
 * household has fewer than `limit` parents. A caregiver's or a viewer's needs the plan that holds
 * `caregivers`, whatever the count. Both numbers come from the matrix (`limitFor` and `can` for
 * `caregivers`), never from a tier name.
 *
 * A CAREGIVER NEVER TAKES A PARENT'S PLACE. One who joined during the preview keeps their seat
 * when it ends (nothing is taken away), and does not count against the two, so the other parent
 * can still join on the free plan.
 */
export function canInviteRole(
  role: Exclude<Role, 'OWNER'>,
  members: readonly { role: Role }[],
  plan: { limit: number | null; extra: boolean },
): boolean {
  if (role !== 'PARENT') return plan.extra;
  return plan.extra || plan.limit === null || parentsIn(members) < plan.limit;
}
