/**
 * THE SIGN-UP PAGE'S CHECKBOX, FOR WHOEVER REACHED THE APP WITHOUT A RECORDED "YES" TO THE CURRENT
 * TERMS (found 2026-09-27). Two ways in, and both were open:
 *
 *   - "Continue with Google" on the SIGN-IN side, for an address with no account: Supabase makes
 *     the account, and nothing on that side ever showed the box, so no acceptance was recorded.
 *   - the Terms moving to a new version (version 2 on 2026-09-27, for the Community rules): Terms
 *     §11 and Privacy §11 promise to ask again, and nothing asked.
 *
 * WHAT IT IS NOT: a separate acceptance screen, or a phase. The owner deleted both on 2026-09-22
 * ("it does not need an individual page"). It is AUTH — the sign-up page itself — drawing its own
 * checkbox, with its own words, a line saying why, and Continue; the Phase union is unchanged, and
 * the navigator shows AUTH while this says so (`app/navigation.tsx`).
 *
 * WHO NEVER SEES IT, which matters as much as who does:
 *   - anyone whose account has not been READ yet — a cold launch must not flash it at somebody who
 *     accepted long ago;
 *   - an account state cached by a build from before `terms_version` existed: an ABSENT key means
 *     "not known yet", never "not accepted" (`AccountState.profile`); the next read decides;
 *   - whoever ticked the box ON THIS PHONE for this address and whose acceptance is still on its way
 *     to the server (`auth/pending-terms.ts`): an email sign-up whose drain failed offline must not
 *     be asked twice for the same "yes";
 *   - anyone who accepted the current version. Returning users see nothing.
 *
 * Pure, so every one of those is a node test (`terms-step.test.ts`).
 */
import type { AccountState } from './providers/types';

/**
 * `none` — nothing owed. `new_account` — no acceptance recorded at all and no household: the
 * account was made without the box (the Google sign-in side). `changed` — an older version was
 * accepted, or an account with a household never recorded one: the Terms moved on since.
 */
export type TermsStep = 'none' | 'new_account' | 'changed';

export function termsStepFor(input: {
  /** The signed-in person, or null when nobody is. An unconfirmed address is Verify's, not this. */
  session: { emailVerified: boolean } | null;
  /** The account as last read, or null before the first read. */
  account: Pick<AccountState, 'profile' | 'memberships'> | null;
  /** A ticked box for this address is waiting on this phone for the server (`pending-terms.ts`). */
  tickedHere: boolean;
  /** `LEGAL_VERSION`: the version the sign-up page's box accepts today. */
  current: number;
}): TermsStep {
  const { session, account, tickedHere, current } = input;
  if (session === null || !session.emailVerified) return 'none';
  if (account === null) return 'none';
  if (tickedHere) return 'none';
  const profile = account.profile;
  // an older build's cache: the key is absent, which is "not known yet" — the next read decides
  if (profile !== null && !('terms_version' in profile)) return 'none';
  // no profile row means accept_terms never ran for this account (it creates the row, 0100)
  const accepted = profile?.terms_version ?? null;
  if (accepted !== null && accepted >= current) return 'none';
  if (accepted === null && account.memberships.length === 0) return 'new_account';
  return 'changed';
}
