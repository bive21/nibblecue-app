/**
 * AN INVITE HELD ON THIS PHONE, ON DISK (the first-day trace, 2026-09-25).
 *
 * The partner's path: the first screen's "Join a household" takes the code before any
 * account exists, so the invite is HELD (since 2026-09-29 as the claim the server's check made in
 * the code's place, with the names it answered; `auth/join.ts`); they create an account, wait on
 * Verify for the email, tap it, and the app opens signed in and joins on its own, on the join page
 * (`screens/onboarding/JoinStep.tsx`) and then the confirmation (`JoinedScreen`). The code
 * used to be a `useState` in `AuthContext`, so if Android killed the app during the wait — or the
 * emailed link opened it cold, which it usually does — the code was gone and the partner landed in
 * ordinary setup, whose last button makes a SECOND household. Both are the ordinary case on
 * Android, not the edge.
 *
 * So the invite lives here, in the preferences store like the onboarding draft
 * (`onboarding/draft-store.ts`) and the ticked terms box (`pending-terms.ts`). Two states:
 *
 *   held    the code or the link's token, and when this phone took it
 *   lapsed  what is left once it stops working — never the code itself, only which kind it was
 *           and why, so the join page can say "ask for a new one" after a restart too. A partner
 *           who switches to Messages to ask for a fresh code is exactly the person whose app
 *           Android kills next; coming back to plain setup would undo the whole point.
 *
 * It lasts until it is used (the account shows a household), refused or out of time (it becomes
 * `lapsed`), replaced (a new code), or the person signs out or says they are setting up a
 * household of their own. Signing out needs nothing here: `held_invite` is not a device-level key
 * (`prefs/index.ts`), so teardown step 10 sweeps it with the rest of the account's preferences.
 *
 * ONE KEY, NOT ONE PER USER. The draft is keyed by user id because it belongs to an account; an
 * invite is usually held before there IS an account, the way `pending-terms.ts` has to key by
 * address. Nothing here is sent anywhere by this module.
 *
 * PREFERENCES, NOT THE KEYSTORE. A code lives five minutes and a link 48 hours, each works once,
 * and each is useless without a verified account to redeem it with; the keystore is kept for the
 * three session-shaped secrets `keychain.ts` names, and the onboarding draft beside this holds a
 * baby's name and date of birth in the same store.
 *
 * WHAT THE CHECK SAID, KEPT BESIDE IT (the owner's report of 2026-09-29; `check_invite`, migration
 * 0139). A code typed on the first screen is checked there, before any account, and a right one
 * comes back as a TOKEN that lasts as long as a link — a claim, so the confirmation email no longer
 * outlives the code — with the household's name, the inviter's, the role and the seat length. All
 * of it is held, so AUTH can say "Create an account to join Dana's family", Verify can say the
 * invite is saved, and the confirmation after the join can name the household it went to. The
 * `origin` is what the person did — typed a code or opened a link — which the words and the
 * analytics channel follow, while the `kind` is what is held and so how long it lives.
 */
import {
  heldInviteExpired,
  isCompleteInviteCode,
  isRole,
  type InviteKind,
  type Role,
} from '@nibblecue/core';
import { z } from 'zod';
import type { KeyValueStore } from '../prefs';
import type { InvitePreview } from './providers/types';

/** The invite as the join page sends it: one of the two. */
export interface HeldInvite {
  code?: string;
  token?: string;
}

/**
 * Why the held invite stopped working, and which kind it was — the words depend on both.
 *
 *   expired     its lifetime passed on this phone's own clock
 *   refused     the server would not take it: wrong, used, revoked, gone (it never says which)
 *   own         it is the person's own invite
 *   needs_plus  a caregiver's or a viewer's seat, and the household has no Plus now (0139)
 */
export interface InviteLapse {
  reason: 'expired' | 'refused' | 'own' | 'needs_plus';
  kind: InviteKind;
  /** The household it was for, when a check named it; absent when nothing did. */
  household?: string;
  /** The seat it was for, when a check named it: what a Plus refusal names. */
  role?: Role;
}

/** How the person got the invite: typed the code, or opened a link. */
export type InviteOrigin = 'code' | 'link';

export type InviteHold =
  | {
      state: 'held';
      invite: HeldInvite;
      kind: InviteKind;
      heldAt: number;
      origin: InviteOrigin;
      /** What `check_invite` said about it; null when it was never checked (0139 not deployed). */
      preview: InvitePreview | null;
    }
  | { state: 'lapsed'; lapse: InviteLapse; at: number };

export const HELD_INVITE_KEY = 'held_invite';

/*
  A CODE IS SIX LETTERS FROM A TO Z since 0144 (core's `isCompleteInviteCode`). An eight-letter code
  an older build held (0140), or six digits (before 0140), no longer parses, so it is not sent: the
  server takes six letters only now, and a code lives five minutes anyway.
*/
/** What `openLink` takes out of `<scheme>://invite/<token>`; the server judges the rest. */
const TOKEN = /^[A-Za-z0-9_-]{1,256}$/;

/** A name as the server gave it, bounded so a foreign record cannot grow the store without end. */
const Name = z.string().max(200);
const StoredPreview = z.object({
  household_name: Name,
  inviter_name: Name,
  role: z.string().refine(isRole),
  seat_hours: z.number().positive().nullable(),
});
/** Absent in a record an older build wrote: an unchecked invite typed or opened, as it then was. */
const HeldExtras = {
  origin: z.enum(['code', 'link']).optional(),
  preview: StoredPreview.nullable().optional(),
};

const Stored = z.union([
  z.object({
    state: z.literal('held'),
    code: z.string().refine(isCompleteInviteCode),
    held_at: z.number(),
    ...HeldExtras,
  }),
  z.object({
    state: z.literal('held'),
    token: z.string().regex(TOKEN),
    held_at: z.number(),
    ...HeldExtras,
  }),
  z.object({
    state: z.literal('lapsed'),
    reason: z.enum(['expired', 'refused', 'own', 'needs_plus']),
    kind: z.enum(['code', 'link']),
    at: z.number(),
    household: Name.optional(),
    role: z.string().refine(isRole).optional(),
  }),
]);

export const inviteKindOf = (invite: HeldInvite): InviteKind => (invite.token ? 'link' : 'code');

/**
 * A new hold, or null for something that is not an invite at all. A token wins over a code, as the
 * server reads them; anything else is refused here rather than stored and sent to fail later.
 *
 * `origin` is what the person did, when it is not what is held: a code checked before the account
 * is held as the claim's token (`kind: 'link'`) but was typed (`origin: 'code'`).
 */
export function holdOf(
  invite: HeldInvite,
  now: number,
  more: { origin?: InviteOrigin; preview?: InvitePreview | null } = {},
): InviteHold | null {
  const preview = more.preview ?? null;
  if (invite.token !== undefined && TOKEN.test(invite.token))
    return {
      state: 'held',
      invite: { token: invite.token },
      kind: 'link',
      heldAt: now,
      origin: more.origin ?? 'link',
      preview,
    };
  if (invite.code !== undefined && isCompleteInviteCode(invite.code))
    return {
      state: 'held',
      invite: { code: invite.code },
      kind: 'code',
      heldAt: now,
      origin: 'code',
      preview,
    };
  return null;
}

/** A held invite with what a later check said about it; anything else comes back as it was. */
export const withPreview = (hold: InviteHold | null, preview: InvitePreview): InviteHold | null =>
  hold === null || hold.state !== 'held' ? hold : { ...hold, preview };

/** The household a hold is for, when a check named it; '' when nothing did. */
export const heldHousehold = (hold: InviteHold | null): string =>
  hold === null
    ? ''
    : hold.state === 'held'
      ? (hold.preview?.household_name ?? '')
      : (hold.lapse.household ?? '');

/** What remains of a hold once it stops working: the kind, the reason and the household's name — never the secret. */
export const lapseOf = (
  hold: InviteHold,
  reason: InviteLapse['reason'],
  now: number,
): InviteHold => {
  if (hold.state === 'lapsed') return hold;
  const household = hold.preview?.household_name ?? '';
  const role = hold.preview?.role;
  return {
    state: 'lapsed',
    lapse: {
      reason,
      kind: hold.kind,
      ...(household !== '' ? { household } : {}),
      ...(role !== undefined ? { role } : {}),
    },
    at: now,
  };
};

/** The role a check said the seat is, or null when nothing checked it. */
export const heldRole = (hold: InviteHold | null): Role | null =>
  hold?.state === 'held' ? (hold.preview?.role ?? null) : null;

/**
 * A held invite whose lifetime has passed (core's `heldInviteExpired`) becomes a lapse; anything
 * else comes back as it was — the same object, so a caller can tell nothing changed.
 */
export function withLifetime(hold: InviteHold | null, now: number): InviteHold | null {
  if (hold === null || hold.state !== 'held') return hold;
  return heldInviteExpired(hold.kind, hold.heldAt, now) ? lapseOf(hold, 'expired', now) : hold;
}

export async function saveInviteHold(store: KeyValueStore, hold: InviteHold): Promise<void> {
  const stored =
    hold.state === 'lapsed'
      ? {
          state: 'lapsed',
          reason: hold.lapse.reason,
          kind: hold.lapse.kind,
          at: hold.at,
          ...(hold.lapse.household ? { household: hold.lapse.household } : {}),
          ...(hold.lapse.role ? { role: hold.lapse.role } : {}),
        }
      : {
          state: 'held',
          ...hold.invite,
          held_at: hold.heldAt,
          origin: hold.origin,
          preview: hold.preview,
        };
  await store.set(HELD_INVITE_KEY, JSON.stringify(stored));
}

/** The hold on disk, or null for none — and for a record that does not parse, which is the same. */
export async function loadInviteHold(store: KeyValueStore): Promise<InviteHold | null> {
  const raw = await store.get(HELD_INVITE_KEY);
  if (!raw) return null;
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const r = parsed.data;
    if (r.state === 'lapsed')
      return {
        state: 'lapsed',
        lapse: {
          reason: r.reason,
          kind: r.kind,
          ...(r.household ? { household: r.household } : {}),
          ...(r.role ? { role: r.role as Role } : {}),
        },
        at: r.at,
      };
    const preview: InvitePreview | null = r.preview
      ? { ...r.preview, role: r.preview.role as Role }
      : null;
    return 'token' in r
      ? {
          state: 'held',
          invite: { token: r.token },
          kind: 'link',
          heldAt: r.held_at,
          origin: r.origin ?? 'link',
          preview,
        }
      : {
          state: 'held',
          invite: { code: r.code },
          kind: 'code',
          heldAt: r.held_at,
          origin: 'code',
          preview,
        };
  } catch {
    return null;
  }
}

export const clearInviteHold = (store: KeyValueStore): Promise<void> =>
  store.remove(HELD_INVITE_KEY);
