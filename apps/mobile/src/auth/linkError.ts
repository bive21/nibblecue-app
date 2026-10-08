/**
 * AN EMAILED LINK THAT DID NOT WORK (the first-day trace, 2026-09-25).
 *
 * Supabase Auth sends the parent back to `<scheme>://auth/callback` or `/auth/recovery` whether or
 * not the link worked. When it did not — expired, opened twice, or opened after a newer email
 * replaced it — the return address carries the reason instead of a code, in the query or in the
 * fragment depending on the flow:
 *
 *   cuddlecue://auth/callback?error=access_denied&error_code=otp_expired
 *                            &error_description=Email+link+is+invalid+or+has+expired
 *
 * and the exchange of a code that did arrive can still fail on the phone (`exchangeCodeForSession`:
 * the code expired in the minutes it took to tap, the verifier went with a reinstall, no signal).
 * The app used to treat all of it as "not a link for me" and did nothing at all, so a parent who
 * tapped a stale link watched the app open and sit there.
 *
 * Pure, so the node suite reads a return address exactly the way both providers do; the sentences
 * the screens say for each answer are `screens/auth/copy.ts` → `linkProblemNotice`.
 */
import { fragmentOf, queryOf } from '../lib/url';

export interface AuthLinkProblem {
  /** Which email it came from: a sign-in (the confirmation after sign-up, or a sign-in link), or a password reset. */
  flow: 'sign_in' | 'recovery';
  /**
   * `expired` — Auth says the link expired or was already used, or its one-time code has; a new
   *             email is the way on. Auth does not tell those two apart, so the words do not try.
   * `offline` — this phone could not reach Auth to finish; the same link can be opened again.
   * `failed`  — anything else: a link this phone could not finish signing in with.
   */
  reason: 'expired' | 'offline' | 'failed';
}

/**
 * The error codes that mean "this link's moment has passed". `otp_expired` is what `/verify`
 * redirects with for a link that is expired OR already used; the other three come from the code
 * exchange — the code's own few minutes ran out, it was already exchanged, or it belongs to an
 * older email that a newer one replaced.
 */
const EXPIRED_CODES: ReadonlySet<string> = new Set([
  'otp_expired',
  'flow_state_expired',
  'flow_state_not_found',
  'bad_code_verifier',
]);

/** A reset link comes back to `/auth/recovery`; every other auth link is a sign-in. */
export function linkFlow(url: string): AuthLinkProblem['flow'] {
  return /^[a-z][a-z0-9.+-]*:\/\/auth\/recovery(?:[/?#]|$)/i.test(url) ? 'recovery' : 'sign_in';
}

/**
 * The problem an auth return address reports, or null when it reports none — a link carrying a
 * code or tokens is left to the exchange. Reads the query and the fragment both.
 */
export function authLinkProblem(url: string): AuthLinkProblem | null {
  const query = queryOf(url);
  const fragment = fragmentOf(url);
  const error = query.error || fragment.error || '';
  const code = query.error_code || fragment.error_code || '';
  const description = query.error_description || fragment.error_description || '';
  if (!error && !code && !description) return null;
  const expired =
    EXPIRED_CODES.has(code) || error === 'access_denied' || /expired/i.test(description);
  return { flow: linkFlow(url), reason: expired ? 'expired' : 'failed' };
}

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

/**
 * Why exchanging a link's code (or setting its tokens) failed on this phone, from the error
 * supabase-js returned or threw. No status at all, a 5xx, or auth-js's retryable fetch error is
 * the network — the code is still good and the link can be opened again once there is signal.
 */
export function exchangeProblem(url: string, err: unknown): AuthLinkProblem {
  const e: ErrorLike = typeof err === 'object' && err !== null ? (err as ErrorLike) : {};
  const flow = linkFlow(url);
  const code = typeof e.code === 'string' ? e.code : '';
  if (EXPIRED_CODES.has(code)) return { flow, reason: 'expired' };
  const status = typeof e.status === 'number' ? e.status : 0;
  if (e.name === 'AuthRetryableFetchError' || status === 0 || status >= 500)
    return { flow, reason: 'offline' };
  return { flow, reason: 'failed' };
}
