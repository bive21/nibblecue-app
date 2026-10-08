/**
 * Sessions (docs/ACCOUNTS.md §6, docs/AUTH_AND_TRIAL.md §2). Pure: no supabase-js, no React.
 *
 * Two facts decide everything here. A cached session renders the app immediately — cold start
 * with a session lands on Today, never on a spinner, never on AUTH for a frame (§6.2). And an
 * expired access token with a refresh token that cannot reach the server is a NETWORK state,
 * not an auth failure: the app stays signed in, shows the offline tag and retries with capped
 * backoff. Only the server saying the session is gone (`invalid_grant`, a revoked or reused
 * refresh token, a deleted user) forces a sign-out, and that runs the full teardown (§6.3).
 */

export interface SessionUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
}

export interface Session {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
  /** Unix ms; informational only — expiry never signs anyone out on the device. */
  expiresAt: number | null;
}

export type RefreshOutcome =
  { kind: 'ok'; session: Session } | { kind: 'offline' } | { kind: 'invalid' } | { kind: 'none' };

export type SessionState =
  | { status: 'signed_out' }
  | { status: 'signed_in'; session: Session; online: boolean; refreshAttempts: number };

export type SessionEffect = 'none' | 'schedule_retry' | 'forced_sign_out';

/**
 * WHY THE APP SIGNED SOMEBODY OUT WITHOUT BEING ASKED, for the one sentence AUTH shows
 * (`screens/auth/copy.ts` `forcedSignOutSentence`):
 *
 *   session    the server stopped honoring this phone's sign-in (a refused refresh, or the auth
 *              client dropping its session on its own)
 *   household  the household's pull was refused and the account could not be read to say why
 *              (`mirror.ts`'s `sign_out`) — the one forced sign-out that remembers the household,
 *              so signing in again opens on Ended if that is where things stand
 */
export type ForcedSignOut = 'session' | 'household';

/** The state to render BEFORE any network call: a cached session is a signed-in app. */
export function stateAtLaunch(cached: Session | null): SessionState {
  return cached
    ? { status: 'signed_in', session: cached, online: true, refreshAttempts: 0 }
    : { status: 'signed_out' };
}

export function reduceRefresh(
  state: SessionState,
  outcome: RefreshOutcome,
): { state: SessionState; effect: SessionEffect } {
  if (state.status === 'signed_out') {
    return outcome.kind === 'ok'
      ? {
          state: {
            status: 'signed_in',
            session: outcome.session,
            online: true,
            refreshAttempts: 0,
          },
          effect: 'none',
        }
      : { state, effect: 'none' };
  }
  switch (outcome.kind) {
    case 'ok':
      return {
        state: { status: 'signed_in', session: outcome.session, online: true, refreshAttempts: 0 },
        effect: 'none',
      };
    case 'offline':
      // stay signed in, keep the cached session, try again later
      return {
        state: { ...state, online: false, refreshAttempts: state.refreshAttempts + 1 },
        effect: 'schedule_retry',
      };
    case 'invalid':
    case 'none':
      // the server no longer knows this session: no silent retry loop, no half-authenticated state
      return { state: { status: 'signed_out' }, effect: 'forced_sign_out' };
  }
}

/**
 * THE AUTH CLIENT SIGNING ITSELF OUT (the first-day trace, 2026-09-25).
 *
 * supabase-js does not only refresh when the app asks: with `autoRefreshToken` it refreshes on its
 * own, and a refresh the server refuses — a revoked refresh token, or one replayed outside the 10 s
 * reuse window because the app was killed mid-refresh — makes it delete the session from storage
 * and emit `SIGNED_OUT`. That event was the ONLY word of it: nothing subscribed, so the app went on
 * showing Today with no session behind it and every sync failed.
 *
 * It is the same fact `reduceRefresh` answers with `forced_sign_out` — the server no longer knows
 * this session — so it gets the same answer, with three exceptions:
 *
 *  - our own teardown emits it too (step 7 calls `auth.signOut`), and a sign-out already under way
 *    must not be started twice;
 *  - signed out, there is nothing to end;
 *  - booting, the session is not read yet. The launch refresh that follows finds the storage empty
 *    (`kind: 'none'`) and forces the sign-out from there, so nothing is left hanging.
 */
export function effectOfClientSignOut(
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
  now: { status: 'booting' | SessionState['status']; tearingDown: boolean },
): SessionEffect {
  if (event !== 'SIGNED_OUT' || now.tearingDown) return 'none';
  return now.status === 'signed_in' ? 'forced_sign_out' : 'none';
}

const REFRESH_BACKOFF_CAP_MS = 300_000;

/** min(2^attempt s, 5 min) plus full jitter up to half of it — the same schedule as the outbox. */
export function refreshBackoffMs(attempt: number, rng: () => number = Math.random): number {
  const base = Math.min(2 ** Math.max(0, attempt) * 1000, REFRESH_BACKOFF_CAP_MS);
  return base + Math.floor(rng() * (base / 2));
}

/** The error codes Supabase Auth uses when a session is gone for good. */
const INVALID_CODES = new Set([
  'invalid_grant',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
  'bad_jwt',
]);

export interface AuthErrorLike {
  code?: string | null;
  status?: number | null;
  message?: string;
  name?: string;
}

/**
 * Network / 5xx → offline (retry, stay signed in). A 4xx that names the session, or one of
 * the codes above → invalid (forced sign-out). Anything else is treated as offline: the
 * cautious reading, because signing a parent out by mistake loses more than a retry does.
 */
export function classifyAuthError(err: unknown): 'offline' | 'invalid' {
  const e = (typeof err === 'object' && err !== null ? err : {}) as AuthErrorLike;
  if (e.code && INVALID_CODES.has(e.code)) return 'invalid';
  const status = e.status ?? 0;
  if (status >= 500 || status === 0) return 'offline';
  if (status === 400 || status === 401 || status === 403) {
    const msg = (e.message ?? '').toLowerCase();
    if (/refresh token|invalid_grant|session|not found|banned|revoked/.test(msg)) return 'invalid';
  }
  if (status === 429) return 'offline';
  return 'offline';
}
