/**
 * The one label for each household role (docs/DESIGN_SYSTEM.md §21: an enum value is never
 * copy, and the rewrite lives beside the type so three screens cannot drift into "viewer",
 * "view only" and "VIEW_ONLY"). Sentence case; a screen that needs it mid-sentence lowercases.
 */
import type { Role } from '../domain/domain-types';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  PARENT: 'Parent',
  CAREGIVER: 'Caregiver',
  VIEW_ONLY: 'View only',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

/**
 * WHAT EACH ROLE MAY ACTUALLY DO, in one line, for the person choosing it.
 *
 * The invite screen's whole job is this decision — it hands a stranger a key to the household's
 * log — and it used to offer three bare pills under "Pick what they can do first" with nothing
 * saying what any of them can do. The sentences already existed, in `docs/PRODUCT_SPEC.md` §1222
 * and `docs/SECURITY.md` §4; they were simply never copy, so the one screen that needed them was
 * the one screen without them.
 *
 * Each says the CAPABILITY and then the one limit that matters, because "Caregiver" is the choice
 * a parent will make by default and the two things they would want to know are that a caregiver
 * can log and that a caregiver cannot rewrite anybody else's entries or the plan.
 */
export const ROLE_DETAILS: Record<Role, string> = {
  OWNER: 'Everything, including the plan and who owns the household.',
  PARENT:
    'Log and correct anything, set the routine, invite people. Gets the reminders they choose. No billing.',
  /*
    "GETS REMINDERS ONLY WHILE THEY'RE ON" (the handoff audit's U1). It is the one difference a
    parent inviting a partner cannot see from the pills: a partner invited as a caregiver logs
    exactly like a parent and is never reminded of anything unless someone puts them on — and the
    invite screen used to say nothing about reminders at all.
  */
  CAREGIVER:
    'Log, and correct their own entries. Gets reminders only while they’re on. Cannot change the routine or anyone else’s entries.',
  VIEW_ONLY: 'Can see the day. Cannot log or change anything, and never gets reminders.',
};

/**
 * THE ROLE AN INVITE STARTS ON (the handoff audit's U1). It was always Caregiver, so the other
 * parent — the person most households invite first — joined as a caregiver unless someone changed
 * the pill, and from then on was reminded only while "on". Now the second seat starts on Parent:
 * while the household has fewer than two parents (owner included), the person being invited is
 * most likely the other one. After that, Caregiver — the nanny, the grandparent, the night nurse.
 * Either way the pill is one tap from the other answer, and the line under it says what each does.
 */
export function defaultInviteRole(members: readonly { role: Role }[]): 'PARENT' | 'CAREGIVER' {
  const parents = members.filter(m => m.role === 'OWNER' || m.role === 'PARENT').length;
  return parents < 2 ? 'PARENT' : 'CAREGIVER';
}

export function roleDetail(role: Role): string {
  return ROLE_DETAILS[role];
}

/**
 * WHETHER THIS PERSON MAY WRITE ANYTHING NEW FOR THE FAMILY ON SCREEN: a log entry, a timer's start
 * or stop, a schedule slot's "Log it" or skip, a stash move, a shopping or supply line, a task's
 * tick (the 2026-10-08 scenario finding: a view only member's phone logged locally, the server
 * refused every op, and the entry lived on that one phone behind a failed outbox row).
 *
 * It is the server's rule, read on the phone: `app.can_write` is OWNER, PARENT or CAREGIVER
 * (0108), and `app.sync_apply_op` asks it before every op of every entity (0128, after 0120), so a
 * VIEW_ONLY member may push nothing at all. A role not loaded yet is NOT a refusal, as in
 * `canChangeEntry`: then the write goes ahead and the server decides, exactly as before.
 */
export function canLog(role: Role | null | undefined): boolean {
  return role !== 'VIEW_ONLY';
}

/**
 * WHAT A VIEW ONLY MEMBER IS TOLD when something they tapped would have logged (a widget link, a
 * coin, a reminder's "Log it", anything that reached the write funnel). One short sentence, and
 * nothing is written. The controls that log are hidden for them in the first place; this is the
 * answer for the doors that open from outside the app.
 */
export const VIEW_ONLY_NO_LOG = 'View only can look, not log.';

/** Whether a value read from the outside is a role at all; the label of anything else is never the raw value. */
export function isRole(value: string): value is Role {
  return value in ROLE_LABELS;
}
