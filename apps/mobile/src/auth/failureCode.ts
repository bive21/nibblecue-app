/**
 * WHICH SENTENCE AN AUTH ERROR GETS (`screens/auth/copy.ts` `failureSentence`).
 *
 * Pure, so the node suite classifies an error exactly the way `SupabaseAuthProvider` does — the
 * provider itself imports the keystore and cannot load here. It reads the stable `code` Auth sends
 * and, where an older server or a 5xx leaves the code out, the message.
 *
 * TWO OF THEM WERE "SOMETHING WENT WRONG" (the first sign-ups on the production project,
 * 2026-09-25). Supabase's built-in email sender mails only the members of the project's
 * organization, so anybody else's sign-up fails with *Email address not authorized*; and the
 * same sender allows two emails an hour for the whole project (RELEASES.md), so a second sign-up,
 * a resend or a reset inside the hour fails with *email rate limit exceeded*. Neither is the
 * parent's mistake, and the generic sentence told them nothing about what to do next. Each has its
 * own code now, and its own sentence.
 */
import type { AuthFailureCode } from './providers/types';
import { classifyAuthError } from './session';

/** The fields an auth-js error carries that matter here — a structural type, no import needed. */
export interface AuthErrorShape {
  code?: string | null | undefined;
  status?: number | null | undefined;
  message?: string | undefined;
}

const NOT_AUTHORIZED = /email address not authori[sz]ed/i;
const EMAIL_RATE_LIMIT = /email rate limit exceeded/i;

export function authFailureCodeOf(err: AuthErrorShape | null | undefined): AuthFailureCode {
  const code = err?.code ?? '';
  const message = err?.message ?? '';
  // first: both arrive as ordinary 4xx errors, and the 429 below would otherwise swallow the second
  if (code === 'email_address_not_authorized' || NOT_AUTHORIZED.test(message))
    return 'email_not_authorized';
  if (code === 'over_email_send_rate_limit' || EMAIL_RATE_LIMIT.test(message))
    return 'email_rate_limited';
  if (code === 'invalid_credentials') return 'invalid_credentials';
  if (code === 'email_not_confirmed') return 'email_not_verified';
  if (code === 'user_already_exists' || code === 'email_exists') return 'email_taken';
  if (code === 'weak_password') return 'weak_password';
  if (code === 'over_request_rate_limit' || err?.status === 429) return 'rate_limited';
  if (classifyAuthError(err) === 'offline' && (err?.status ?? 0) === 0) return 'offline';
  return 'unknown';
}
