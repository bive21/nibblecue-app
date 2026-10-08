import { describe, expect, it } from 'vitest';
import {
  classifyAuthError,
  effectOfClientSignOut,
  reduceRefresh,
  refreshBackoffMs,
  stateAtLaunch,
  type Session,
} from './session';

const session: Session = {
  user: { id: 'u1', email: 'dana@example.test', emailVerified: true },
  accessToken: 'expired.access.token',
  refreshToken: 'refresh',
  expiresAt: Date.parse('2026-09-01T00:00:00Z'), // long past: expiry never signs anyone out
};

describe('sessions (ACCOUNTS.md §6)', () => {
  it('renders from the cached session before any network call — no AUTH flash on cold start', () => {
    expect(stateAtLaunch(session)).toEqual({
      status: 'signed_in',
      session,
      online: true,
      refreshAttempts: 0,
    });
    expect(stateAtLaunch(null)).toEqual({ status: 'signed_out' });
  });

  it('stays signed in when the refresh cannot reach the server, and schedules a retry', () => {
    const start = stateAtLaunch(session);
    const first = reduceRefresh(start, { kind: 'offline' });
    expect(first.effect).toBe('schedule_retry');
    expect(first.state).toEqual({
      status: 'signed_in',
      session,
      online: false,
      refreshAttempts: 1,
    });
    const second = reduceRefresh(first.state, { kind: 'offline' });
    expect(second.state).toMatchObject({ status: 'signed_in', online: false, refreshAttempts: 2 });
    // a later success clears the offline tag and the attempt count
    const fresh = { ...session, accessToken: 'new' };
    expect(reduceRefresh(second.state, { kind: 'ok', session: fresh })).toEqual({
      state: { status: 'signed_in', session: fresh, online: true, refreshAttempts: 0 },
      effect: 'none',
    });
  });

  it('forces a sign-out only when the server says the session is gone', () => {
    const start = stateAtLaunch(session);
    expect(reduceRefresh(start, { kind: 'invalid' })).toEqual({
      state: { status: 'signed_out' },
      effect: 'forced_sign_out',
    });
    expect(reduceRefresh(start, { kind: 'none' })).toEqual({
      state: { status: 'signed_out' },
      effect: 'forced_sign_out',
    });
    // a signed-out app never "forces" anything; it can only become signed in
    expect(reduceRefresh({ status: 'signed_out' }, { kind: 'invalid' })).toEqual({
      state: { status: 'signed_out' },
      effect: 'none',
    });
    expect(reduceRefresh({ status: 'signed_out' }, { kind: 'ok', session }).state.status).toBe(
      'signed_in',
    );
  });

  it('backs off 1 s, 2 s, 4 s … capped at 5 min, with full jitter up to half', () => {
    const noJitter = () => 0;
    const maxJitter = () => 0.999999;
    expect(refreshBackoffMs(0, noJitter)).toBe(1000);
    expect(refreshBackoffMs(1, noJitter)).toBe(2000);
    expect(refreshBackoffMs(2, noJitter)).toBe(4000);
    expect(refreshBackoffMs(20, noJitter)).toBe(300_000);
    expect(refreshBackoffMs(0, maxJitter)).toBe(1499);
    expect(refreshBackoffMs(20, maxJitter)).toBe(449_999);
  });

  it('reads Supabase Auth errors the cautious way: network is offline, a dead session is invalid', () => {
    expect(classifyAuthError(new TypeError('Network request failed'))).toBe('offline');
    expect(classifyAuthError({ status: 503, message: 'Service Unavailable' })).toBe('offline');
    expect(classifyAuthError({ status: 429, message: 'Too many requests' })).toBe('offline');
    expect(
      classifyAuthError({ status: 400, code: 'invalid_grant', message: 'Invalid Refresh Token' }),
    ).toBe('invalid');
    expect(
      classifyAuthError({
        status: 400,
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
      }),
    ).toBe('invalid');
    expect(
      classifyAuthError({
        status: 401,
        message: 'Session from session_id claim in JWT does not exist',
      }),
    ).toBe('invalid');
    expect(classifyAuthError({ status: 403, message: 'User is banned' })).toBe('invalid');
    expect(classifyAuthError({ status: 400, message: 'some other validation' })).toBe('offline');
    expect(classifyAuthError(undefined)).toBe('offline');
  });
});

describe('the auth client signing itself out (the first-day trace, 2026-09-25)', () => {
  const live = { status: 'signed_in' as const, tearingDown: false };

  it('is the forced sign-out a refused refresh already gets', () => {
    expect(effectOfClientSignOut('SIGNED_OUT', live)).toBe('forced_sign_out');
    // the same answer the reducer gives the same fact, reached from the other side
    expect(reduceRefresh(stateAtLaunch(session), { kind: 'invalid' }).effect).toBe(
      'forced_sign_out',
    );
  });

  it('is not a second teardown when it is our own teardown’s step 7 talking', () => {
    expect(effectOfClientSignOut('SIGNED_OUT', { ...live, tearingDown: true })).toBe('none');
  });

  it('ends nothing when there is nothing to end, or nothing read yet', () => {
    expect(effectOfClientSignOut('SIGNED_OUT', { status: 'signed_out', tearingDown: false })).toBe(
      'none',
    );
    // booting: the launch refresh finds the storage empty (`none`) and forces it from there
    expect(effectOfClientSignOut('SIGNED_OUT', { status: 'booting', tearingDown: false })).toBe(
      'none',
    );
    expect(reduceRefresh(stateAtLaunch(session), { kind: 'none' }).effect).toBe('forced_sign_out');
  });

  it('reads every other event as ordinary life', () => {
    expect(effectOfClientSignOut('SIGNED_IN', live)).toBe('none');
    expect(effectOfClientSignOut('TOKEN_REFRESHED', live)).toBe('none');
  });
});
