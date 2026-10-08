/**
 * The sentences the auth screens say for each provider failure. Plain, sentence case, a parent
 * at 3 a.m. is the reader (docs/DESIGN_SYSTEM.md). Every code has one; none names a system.
 */
import { INVITE_CODE_LIFETIME_MS, INVITE_LINK_LIFETIME_MS, type Role } from '@nibblecue/core';
import type { InviteLapse } from '../../auth/held-invite';
import type { CheckOutcome, JoinProblem } from '../../auth/join';
import { JOIN } from './joinCopy';
import type { AuthLinkProblem } from '../../auth/linkError';
import { AuthFailure, type AuthFailureCode } from '../../auth/providers/types';
import type { ForcedSignOut } from '../../auth/session';
import type { TermsStep } from '../../auth/terms-step';

/**
 * SIGNING IN AGAIN KEPT THE ACCOUNT (Privacy §7, Terms §12; `auth/keep-account.ts`). Said once, when
 * the server answers that this sign-in undid a pending deletion — the other half of the Delete
 * account page's own toast, "Sign in before then to keep it." Plain, and it says what happened.
 */
export const ACCOUNT_KEPT = "Welcome back. Your account won't be deleted.";

/**
 * THE TERMS STEP'S ONE LINE (`auth/terms-step.ts`): why the sign-up page's own checkbox is in front
 * of somebody already signed in. Over the box, which keeps its own words; the heading is the
 * sign-up page's own for a new account and the sign-in side's for everyone else.
 */
export const TERMS_STEP_LINE: Record<Exclude<TermsStep, 'none'>, string> = {
  new_account: 'One more step: please accept the terms to finish creating your account.',
  changed: 'We updated the terms. Please accept them to continue.',
};

/**
 * AN ADDRESS THE PROJECT'S EMAIL WILL NOT REACH YET, with the app's name in it (2026-09-25;
 * `auth/failureCode.ts` says where it comes from). The name is the CALLER's to supply: this file
 * is not a surface BRANDING.md §2 lets carry it (`packages/brand/src/placement.test.ts`), and the
 * sign-up page — the one screen this refusal can reach — is. `SENTENCES` keeps the same words
 * without the name, for any screen that is not the door in.
 */
export const emailNotAuthorized = (appName: string): string =>
  `This email can’t get sign-up emails${appName ? ` from ${appName}` : ''} yet. Ask the account owner to add it, or use another email.`;

const SENTENCES: Record<AuthFailureCode, string> = {
  invalid_credentials: 'That email and password did not match.',
  email_taken: 'There is already an account with that email. Sign in instead.',
  weak_password: 'Pick a password of at least 10 characters.',
  email_not_verified: 'Check your email to confirm your address first.',
  provider_not_configured: 'That sign-in is not set up yet. Use your email for now.',
  /*
    GOOGLE'S TWO ANSWERS THAT ARE NOT FAULTS (`auth/browserSignIn.ts`). A closed or refused sign-in
    page was the parent's choice: AUTH says nothing at all for it, as the paywall says nothing when
    the store sheet is backed out of, and this sentence is only here because every code has one.
    An address that already has an account is told the way that works for it.
  */
  cancelled: 'Sign-in was canceled. Nothing changed.',
  account_exists: 'This email already has an account. Sign in with your email and password.',
  rate_limited: 'Too many tries. Wait a few minutes and try again.',
  /*
    THE TWO EMAIL REFUSALS (2026-09-25; `auth/failureCode.ts` says where each comes from). Neither
    is the parent's mistake and both have a next step, so each says it. No sentence names the
    provider, its mailer or its account structure.
  */
  email_not_authorized: emailNotAuthorized(''),
  email_rate_limited:
    'Too many emails were sent in the last hour. Please wait an hour, then try again.',
  offline: 'No connection. Check your network and try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function failureSentence(err: unknown): string {
  if (err instanceof AuthFailure) return SENTENCES[err.code];
  return SENTENCES.unknown;
}

export const MIN_PASSWORD = 10;
/**
 * THE PASSWORD'S ONE RULE, in the words the row under the field says it (`PasswordRule.tsx`).
 * Length is the whole rule, with no forced capitals or symbols (NIST SP 800-63B advises against
 * composition rules), so one line is all of it.
 */
export const PASSWORD_RULE = `At least ${MIN_PASSWORD} characters`;
export const passwordRuleMet = (password: string): boolean => password.length >= MIN_PASSWORD;
export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * EMPTY vs a typed address that fails the shape. `name@gmailcom` (the dot before com left out)
 * used to get the empty-field sentence, so a parent had to hunt for the typo.
 */
export const EMAIL_NEEDED = 'Enter the email you use for your account.';
export const EMAIL_LOOKS_WRONG =
  'That does not look like an email. Use an address like name@email.com.';

export function emailEntryError(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0) return EMAIL_NEEDED;
  if (isEmail(s)) return null;
  return EMAIL_LOOKS_WRONG;
}

/**
 * Identical for wrong, expired, revoked, used and unknown codes (docs/ACCOUNTS.md §3.5): the server
 * never says which. The words are the join's one table (`joinCopy.ts`, 2026-09-29), which says what
 * to do next without a dash in it.
 */
export const INVITE_FAILED = JOIN.refusal.wrongCode;

/**
 * HOW LONG AN EMAILED LINK WORKS: an hour (the first-day trace, 2026-09-25). Supabase Auth's
 * "Email OTP Expiration" is 3600 seconds by default, the owner's setup checklist keeps the default,
 * and the one setting covers all three emails — the confirmation after sign-up, a sign-in link and
 * a password reset. Two screens said "15 minutes", which was an INVITE CODE's lifetime then (five
 * minutes since 0144) and nothing to do with email; a parent reading it would give up on a link
 * that still had 45 minutes left.
 * Every sentence that states the lifetime reads it from here, and `copy.test.ts` holds them to it.
 */
export const EMAIL_LINK_LIFETIME = 'an hour';

/**
 * THE ONE SENTENCE AUTH SHOWS AFTER A SIGN-OUT NOBODY ASKED FOR (the first-day trace,
 * 2026-09-25). The server stopped honoring this phone's sign-in — a password changed elsewhere,
 * "Sign out everywhere", a revoked or replayed refresh token — and the app signed out on its own,
 * keeping whatever had not synced (the quarantine line under this one says how much). It says
 * why in the parent's terms; the form below it is what to do.
 */
export const FORCED_SIGN_OUT =
  'You were signed out because your sign-in on this phone is no longer valid.';

/**
 * THE OTHER SIGN-OUT NOBODY ASKED FOR (2026-09-25; `auth/mirror.ts`). The household's entries were
 * refused to this phone, and the account could not be read to say why — which is what an invite
 * running out looks like, and a parent removing someone, and also a fault on the server's side.
 * So, like the Ended screen, it asserts none of them and blames nobody: it says what the parent
 * saw stop, and what to do. Signing in again shows where things stand — the household, if it is
 * still theirs, or the Ended screen that names it — and the quarantine line under this one says
 * what was kept.
 */
export const FORCED_SIGN_OUT_HOUSEHOLD =
  'You were signed out because this phone could no longer get your household’s entries. Sign in again to check your access.';

/** The sentence for why this phone was signed out (`auth/session.ts` `ForcedSignOut`). */
export const forcedSignOutSentence = (why: ForcedSignOut): string =>
  why === 'household' ? FORCED_SIGN_OUT_HOUSEHOLD : FORCED_SIGN_OUT;

/**
 * AN EMAILED LINK THAT DID NOT WORK (`auth/linkError.ts`): what happened, then what to do next,
 * in two short sentences. On Verify the way on is the resend button right under the notice; on
 * AUTH, which switches to its sign-in side when this shows, it is signing in or a new link.
 */
const LINK_WHAT: Record<AuthLinkProblem['flow'], Record<AuthLinkProblem['reason'], string>> = {
  sign_in: {
    expired: 'That link has expired or was already used.',
    offline: 'That link needs a connection to sign you in.',
    failed: 'That link could not sign you in on this phone.',
  },
  recovery: {
    expired: 'That reset link has expired or was already used.',
    offline: 'That reset link needs a connection to work.',
    failed: 'That reset link could not be opened on this phone.',
  },
};

export function linkProblemNotice(problem: AuthLinkProblem, on: 'auth' | 'verify'): string {
  const what = LINK_WHAT[problem.flow][problem.reason];
  // the link itself is still good: the same tap works once there is signal
  if (problem.reason === 'offline') return `${what} Connect, then open the link again.`;
  if (problem.flow === 'recovery') return `${what} Tap Forgot password? to get a new one.`;
  // Verify: sign-in first — the link often already confirmed the address (prefetch / double open),
  // and iPhone has no system Back; Resend is for a truly stale email.
  return on === 'verify'
    ? `${what} Sign in with your password, or tap Resend the email.`
    : `${what} Sign in, or tap Forgot password? for a new link.`;
}

/**
 * The lifetimes the join's words state, read from core so a sentence can never promise a length the
 * server does not keep (`copy.test.ts` holds each sentence to them).
 */
export const CODE_MINUTES = INVITE_CODE_LIFETIME_MS / 60_000;
export const LINK_HOURS = INVITE_LINK_LIFETIME_MS / 3_600_000;

/**
 * WHY THE JOIN PAGE IS ASKING FOR A NEW CODE (`auth/held-invite.ts`). A refused code keeps the
 * sheet's own sentence, identical for every reason the server has (ACCOUNTS.md §3.5); one that
 * ran out of time on this phone can say so, because the phone's own clock is what decided it. A
 * link — or a code checked before the account, which the phone holds as a link (0139) — speaks of
 * "this invite", never of a mechanism the person did not use.
 */
export function inviteLapseSentence(lapse: InviteLapse): string {
  switch (lapse.reason) {
    case 'own':
      return JOIN.refusal.own;
    case 'needs_plus':
      return JOIN.refusal.needsPlus(lapse.household ?? '', lapse.role ?? null);
    case 'refused':
      return lapse.kind === 'code' ? INVITE_FAILED : JOIN.refusal.link;
    case 'expired':
      return lapse.kind === 'code' ? JOIN.refusal.codeExpired : JOIN.refusal.linkExpired;
  }
}

/**
 * WHAT THE CODE SHEET SAYS WHEN A CHECK SAYS NO, signed out (`auth/join.ts` `checkOutcomeOf`):
 * nothing was held, so each sentence ends in what to try next.
 */
export function checkRefusalSentence(outcome: Extract<CheckOutcome, { kind: 'refused' }>): string {
  switch (outcome.reason) {
    case 'wrong':
      return INVITE_FAILED;
    case 'needs_plus':
      return JOIN.refusal.needsPlus(
        outcome.preview?.household_name ?? '',
        outcome.preview?.role ?? null,
      );
    case 'rate_limited':
      return JOIN.refusal.rateLimited;
    case 'connection_limited':
      return JOIN.refusal.connectionLimited;
    case 'codes_paused':
      return JOIN.refusal.codesPaused;
    case 'failed':
      return JOIN.refusal.failed;
  }
}

/**
 * WHAT A JOIN THAT DID NOT LAND SAYS, while the invite is kept (`auth/join.ts` `JoinProblem`): the
 * sentence, then the next step, which the page draws as a button under it.
 */
export function joinProblemSentence(
  problem: JoinProblem,
  household: string,
  role: Role | null,
): string {
  switch (problem) {
    case 'offline':
      return JOIN.refusal.offlineHeld(household);
    case 'rate_limited':
      return JOIN.refusal.rateLimited;
    case 'codes_paused':
      return JOIN.refusal.codesPaused;
    case 'needs_plus':
      return JOIN.refusal.needsPlus(household, role);
    case 'unverified':
      return JOIN.refusal.unverified;
    case 'household_limit':
      return JOIN.refusal.householdLimit;
    case 'admin_elsewhere':
      return JOIN.refusal.parentElsewhere;
    case 'failed':
      return JOIN.refusal.failed;
  }
}

/**
 * WHAT A REFUSED JOIN MEANS FOR THE INVITE BEING HELD, and the sentence for it — one table for the
 * code sheet and the join page, so the two never answer the same refusal two ways.
 *
 *   refused  the server will never take this invite from this person: it is cleared
 *   joined   they are already in that household: nothing to hold, read the account again
 *   kept     nothing was decided about the invite (a limit, an unconfirmed address, no signal)
 */
export interface InviteRefusal {
  sentence: string;
  invite: 'refused' | 'joined' | 'kept';
}

export function inviteRefusal(r: {
  status: number;
  error: string;
  detail?: string;
}): InviteRefusal {
  switch (r.error) {
    case 'invalid_invite':
      return { sentence: INVITE_FAILED, invite: 'refused' };
    case 'own_invite':
      return { sentence: JOIN.refusal.own, invite: 'refused' };
    case 'already_member':
      return { sentence: 'You are already in that household.', invite: 'joined' };
    case 'rate_limited':
      return {
        sentence:
          r.detail === 'invite_codes_paused' ? JOIN.refusal.codesPaused : JOIN.refusal.rateLimited,
        invite: 'kept',
      };
    // 0139: nothing about the invite is decided by either, so it is kept
    case 'in_another_household':
      return { sentence: JOIN.inHousehold.body(''), invite: 'kept' };
    case 'needs_plus':
      return { sentence: JOIN.refusal.needsPlus('', null), invite: 'kept' };
    // 0153: nothing about the invite is decided by either
    case 'household_limit':
      return { sentence: JOIN.refusal.householdLimit, invite: 'kept' };
    case 'admin_elsewhere':
      return { sentence: JOIN.refusal.parentElsewhere, invite: 'kept' };
  }
  // only an unconfirmed address is sent to the inbox: a join is only offered to a confirmed one, so
  // any other 401 is a token that lapsed, and the next try goes with a fresh one (2026-09-27)
  if (r.status === 401 && r.error === 'unverified_email')
    return { sentence: JOIN.refusal.unverified, invite: 'kept' };
  return { sentence: JOIN.refusal.failed, invite: 'kept' };
}
