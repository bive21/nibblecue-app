import { BRAND } from '@nibblecue/brand';
import { describe, expect, it } from 'vitest';
import { clearForHouseholdEnd, clearForSignOut, memoryStore } from '../prefs';
import { checkAnswerOf } from './checkAnswer';
import { inviteTokenOf } from './inviteLink';
import {
  checkOutcomeOf,
  clearJoinNote,
  joinNoteKey,
  loadJoinNote,
  redeemInvite,
  saveJoinNote,
  seatHoursOf,
  sheetModeOf,
  type JoinNote,
  type RedeemDeps,
} from './join';
import {
  AuthFailure,
  type AcceptInviteResult,
  type AccountState,
  type InvitePreview,
} from './providers/types';

/**
 * THE JOIN'S PURE HALF (the owner's report of 2026-09-29): every answer a join can come back with
 * and what the phone does with it, what the code sheet does with a check's answer, the note the
 * joiner is owed, the three forms an invite link arrives in, and how the Supabase provider reads
 * `check_invite`. The whole path against the in-app test backend is `scenarios/join.scenario.test.ts`.
 */

const H = '11111111-2222-4333-8444-555555555555';
const T0 = Date.parse('2026-09-29T20:00:00Z');
const HOUR = 3_600_000;

const account = (memberships: AccountState['memberships'] = []): AccountState => ({
  profile: { id: 'u', display_name: 'sam', email: 'sam@example.test', terms_version: 2 },
  memberships,
  children: [],
  modules: [],
  entitlement: null,
  serverNow: T0,
  deletionPending: null,
});
const membership = (name: string): AccountState['memberships'][number] => ({
  household_id: H,
  household_name: name,
  role: 'PARENT',
  welcome_expires_at: null,
  heard_from: null,
  home_time_zone: null,
  household_created_at: null,
  joined_at: null,
  welcome_waits_for_birth: false,
});

/**
 * Deps that answer `accept` with `r` and a read with `read`, and remember what was sent. `held` is
 * the families the account was in before the try: none, the auto-join's case, unless a test says;
 * null leaves it unsaid, and the account is read first.
 */
function deps(
  r: AcceptInviteResult | Error,
  read: AccountState | null = account(),
  held: readonly string[] | null = [],
) {
  const sent: Parameters<RedeemDeps['accept']>[0][] = [];
  let reads = 0;
  const d: RedeemDeps = {
    ...(held === null ? {} : { held }),
    accept: async input => {
      sent.push(input);
      if (r instanceof Error) throw r;
      return r;
    },
    read: async () => {
      reads += 1;
      return read;
    },
  };
  return { d, sent, reads: () => reads };
}

describe('one join, and what it came to', () => {
  it('joined: the household, the seat, and the account’s own name sent with the invite', async () => {
    const { d, sent } = deps({
      ok: true,
      household_id: H,
      household_name: 'Dana’s family',
      role: 'CAREGIVER',
      welcome_expires_at: null,
      seat_expires_at: '2026-09-30T02:00:00Z',
    });
    expect(await redeemInvite(d, { token: 'x'.repeat(43) }, '  Sam ')).toEqual({
      kind: 'joined',
      household_id: H,
      household_name: 'Dana’s family',
      role: 'CAREGIVER',
      seat_expires_at: '2026-09-30T02:00:00Z',
    });
    expect(sent).toEqual([{ token: 'x'.repeat(43), display_name: 'Sam' }]);
  });

  it('sends no name when the account has none, and the token rather than a code when it holds both', async () => {
    const { d, sent } = deps({
      ok: true,
      household_id: H,
      household_name: 'Dana’s family',
      role: 'PARENT',
      welcome_expires_at: null,
    });
    const r = await redeemInvite(d, { code: 'WDJBMA', token: 'y'.repeat(43) }, null);
    // a server older than 0139 says nothing about the seat: read as none
    expect(r).toMatchObject({ kind: 'joined', seat_expires_at: null });
    expect(sent).toEqual([{ token: 'y'.repeat(43) }]);
  });

  it('a dead code: refused, unless the account now shows the household — the join landed before', async () => {
    const dead: AcceptInviteResult = {
      ok: false,
      status: 404,
      error: 'invalid_invite',
      attempts_left: 2,
    };
    const nobody = deps(dead, account());
    expect(await redeemInvite(nobody.d, { code: 'ZZZZZZ' }, null)).toEqual({
      kind: 'refused',
      reason: 'refused',
      attempts_left: 2,
    });
    expect(nobody.reads()).toBe(1);
    // the connection dropped between the join and the read after it: in is in (2026-09-27)
    const inAlready = deps(dead, account([membership('Dana’s family')]));
    expect(await redeemInvite(inAlready.d, { code: 'WDJBMA' }, null)).toEqual({
      kind: 'joined',
      household_id: H,
      household_name: 'Dana’s family',
      role: 'PARENT',
      seat_expires_at: null,
    });
    // a read that fails is no evidence of anything: the code is refused, as the server said
    const unread = deps(dead, null);
    expect((await redeemInvite(unread.d, { code: 'ZZZZZZ' }, null)).kind).toBe('refused');
  });

  it('their own invite: refused, with its own reason', async () => {
    const { d } = deps({ ok: false, status: 409, error: 'own_invite' });
    expect(await redeemInvite(d, { code: 'WDJBMA' }, null)).toEqual({
      kind: 'refused',
      reason: 'own',
    });
  });

  it('already in that household: joined, as the account reads', async () => {
    const { d } = deps(
      { ok: false, status: 409, error: 'already_member' },
      account([membership('Dana’s family')]),
    );
    expect(await redeemInvite(d, { code: 'WDJBMA' }, null)).toMatchObject({
      kind: 'joined',
      household_name: 'Dana’s family',
    });
  });

  it('in a family already (0153): a wrong, used or expired code is refused, never "joined" the family on screen', async () => {
    const dead: AcceptInviteResult = {
      ok: false,
      status: 404,
      error: 'invalid_invite',
      attempts_left: 4,
    };
    // the caller knows what the account held: the read after shows only that, so nothing was joined
    const known = deps(dead, account([membership('Dana’s family')]), [H]);
    expect(await redeemInvite(known.d, { code: 'QWZXQW' }, null)).toEqual({
      kind: 'refused',
      reason: 'refused',
      attempts_left: 4,
    });
    // the caller does not say: the account is read first, and the same answer comes back
    const unsaid = deps(dead, account([membership('Dana’s family')]), null);
    expect(await redeemInvite(unsaid.d, { code: 'QWZXQW' }, null)).toMatchObject({
      kind: 'refused',
    });
    expect(unsaid.reads()).toBe(2);
    // a code for a family already on the phone: not "joined" whichever family the read lists first
    const already = deps(
      { ok: false, status: 409, error: 'already_member' },
      account([membership('Dana’s family')]),
      [H],
    );
    expect(await redeemInvite(already.d, { code: 'WDJBMA' }, null)).toEqual({
      kind: 'kept',
      problem: 'failed',
    });
  });

  it('in another household: one account holds one household, named from the account (0139)', async () => {
    const { d } = deps(
      { ok: false, status: 409, error: 'in_another_household' },
      account([membership('Sam’s family')]),
    );
    expect(await redeemInvite(d, { code: 'WDJBMA' }, null)).toEqual({
      kind: 'in_household',
      current: 'Sam’s family',
    });
  });

  it('keeps the invite for everything that decides nothing about it', async () => {
    const kept = async (r: AcceptInviteResult | Error) =>
      redeemInvite(deps(r).d, { code: 'WDJBMA' }, null);
    expect(await kept({ ok: false, status: 403, error: 'needs_plus' })).toEqual({
      kind: 'kept',
      problem: 'needs_plus',
    });
    expect(await kept({ ok: false, status: 429, error: 'rate_limited' })).toEqual({
      kind: 'kept',
      problem: 'rate_limited',
    });
    expect(await kept({ ok: false, status: 401, error: 'unverified_email' })).toEqual({
      kind: 'kept',
      problem: 'unverified',
    });
    expect(await kept({ ok: false, status: 500, error: 'server_error' })).toEqual({
      kind: 'kept',
      problem: 'failed',
    });
    // no answer at all is the network, and it is sent again when the phone is back online
    expect(await kept(new AuthFailure('offline'))).toEqual({ kind: 'kept', problem: 'offline' });
    expect(await kept(new Error('boom'))).toEqual({ kind: 'kept', problem: 'failed' });
  });
});

describe('the code sheet, and a check’s answer', () => {
  const preview: InvitePreview = {
    household_name: 'Dana’s family',
    inviter_name: 'Dana',
    role: 'CAREGIVER',
    seat_hours: 6,
  };

  it('does what the phase needs: check signed out, join with no household, explain in one', () => {
    expect(sheetModeOf('signed_out')).toBe('check');
    expect(sheetModeOf('onboarding')).toBe('join');
    expect(sheetModeOf('ended')).toBe('join');
    expect(sheetModeOf('ready')).toBe('in_household');
  });

  it('holds what a right code answered, holds the digits when there was no check, and says any no', () => {
    expect(
      checkOutcomeOf({
        ok: true,
        token: 't'.repeat(43),
        expires_at: '2026-10-01T20:00:00Z',
        preview,
      }),
    ).toEqual({ kind: 'found', token: 't'.repeat(43), preview });
    expect(checkOutcomeOf({ ok: false, status: 0, error: 'unavailable' })).toEqual({
      kind: 'unchecked',
    });
    expect(checkOutcomeOf({ ok: false, status: 404, error: 'invalid_invite' })).toEqual({
      kind: 'refused',
      reason: 'wrong',
      preview: null,
    });
    expect(checkOutcomeOf({ ok: false, status: 403, error: 'needs_plus', preview })).toEqual({
      kind: 'refused',
      reason: 'needs_plus',
      preview,
    });
    expect(checkOutcomeOf({ ok: false, status: 429, error: 'rate_limited' })).toMatchObject({
      reason: 'rate_limited',
    });
    expect(checkOutcomeOf({ ok: false, status: 500, error: 'server_error' })).toMatchObject({
      reason: 'failed',
    });
  });
});

describe('what `check_invite` answered, read the way the Supabase provider reads it', () => {
  const answer = {
    ok: true,
    token: 'c'.repeat(43),
    expires_at: '2026-10-01T20:00:00+00:00',
    household_name: ' Dana’s family ',
    inviter_name: 'Dana',
    role: 'CAREGIVER',
    seat_hours: 6,
  };

  it('a right code: the token to hold and what it said', () => {
    expect(checkAnswerOf({ data: answer, error: null, status: 200 })).toEqual({
      ok: true,
      token: 'c'.repeat(43),
      expires_at: '2026-10-01T20:00:00+00:00',
      preview: {
        household_name: 'Dana’s family',
        inviter_name: 'Dana',
        role: 'CAREGIVER',
        seat_hours: 6,
      },
    });
    // a permanent seat, and an inviter with no name yet
    expect(
      checkAnswerOf({ data: { ...answer, seat_hours: null, inviter_name: '' }, error: null }),
    ).toMatchObject({ ok: true, preview: { seat_hours: null, inviter_name: '' } });
  });

  it('a wrong code and a seat Plus holds: the two answers a person is told', () => {
    expect(
      checkAnswerOf({ data: { ok: false, error: 'invalid_invite' }, error: null, status: 200 }),
    ).toEqual({ ok: false, status: 404, error: 'invalid_invite' });
    expect(
      checkAnswerOf({
        data: {
          ok: false,
          error: 'needs_plus',
          household_name: 'Dana’s family',
          inviter_name: 'Dana',
          role: 'VIEW_ONLY',
        },
        error: null,
      }),
    ).toMatchObject({ ok: false, error: 'needs_plus', preview: { role: 'VIEW_ONLY' } });
  });

  it('a project with no check, or one that took it back from signed-out callers: unavailable, never a dead code', () => {
    for (const code of ['PGRST202', '42501'])
      expect(checkAnswerOf({ data: null, error: { code, message: 'no' }, status: 404 })).toEqual({
        ok: false,
        status: 0,
        error: 'unavailable',
      });
  });

  it('the limiter and a malformed shape, from the database', () => {
    expect(
      checkAnswerOf({
        data: null,
        error: { code: 'CC429', message: 'rate_limited', details: 'invite_redeem' },
        status: 400,
      }),
    ).toMatchObject({ ok: false, status: 429, error: 'rate_limited' });
    expect(
      checkAnswerOf({
        data: null,
        error: { code: 'CC422', message: 'validation_error' },
        status: 400,
      }),
    ).toMatchObject({ ok: false, status: 422 });
  });

  it('nothing answered: offline, thrown like every account call', () => {
    expect(() =>
      checkAnswerOf({
        data: null,
        error: { code: '', message: 'TypeError: Network request failed' },
        status: 0,
      }),
    ).toThrow(AuthFailure);
    try {
      checkAnswerOf({ data: null, error: { code: '', message: 'x' }, status: 0 });
    } catch (e) {
      expect((e as AuthFailure).code).toBe('offline');
    }
  });

  it('a shape the function never sends is a fault, never a join', () => {
    expect(
      checkAnswerOf({ data: { ok: true, token: '', role: 'PARENT' }, error: null }),
    ).toMatchObject({
      ok: false,
      status: 500,
    });
    expect(checkAnswerOf({ data: { ...answer, role: 'ADMIN' }, error: null })).toMatchObject({
      ok: false,
      status: 500,
    });
    expect(checkAnswerOf({ data: 'nonsense', error: null })).toMatchObject({
      ok: false,
      status: 500,
    });
  });
});

describe('the note the joiner is owed', () => {
  const joined: JoinNote = {
    kind: 'joined',
    household_id: H,
    household_name: 'Dana’s family',
    role: 'CAREGIVER',
    seat_hours: 6,
    at: T0,
  };

  it('outlives a killed app, per account, and is gone once read', async () => {
    const store = memoryStore();
    await saveJoinNote(store, 'u1', joined);
    expect(await loadJoinNote(store, 'u1')).toEqual(joined);
    // another account on the same phone never reads it
    expect(await loadJoinNote(store, 'u2')).toBeNull();
    await clearJoinNote(store, 'u1');
    expect(await loadJoinNote(store, 'u1')).toBeNull();
    const notUsed: JoinNote = {
      kind: 'not_used',
      current: 'Sam’s family',
      invited: 'Dana’s family',
      at: T0,
    };
    await saveJoinNote(store, 'u1', notUsed);
    expect(await loadJoinNote(store, 'u1')).toEqual(notUsed);
  });

  it('reads a record that does not parse as nothing owed, never as a crash', async () => {
    const store = memoryStore();
    for (const raw of [
      '{nope',
      JSON.stringify({ kind: 'joined', household_name: 'x' }),
      JSON.stringify({ ...joined, role: 'ADMIN' }),
      JSON.stringify({ kind: 'maybe', at: T0 }),
    ]) {
      await store.set(joinNoteKey('u1'), raw);
      expect(await loadJoinNote(store, 'u1'), raw).toBeNull();
    }
  });

  it('is swept by sign-out, and by a household leaving the phone: a note about a gone household says nothing true', async () => {
    const store = memoryStore({ theme: 'dark' });
    await saveJoinNote(store, 'u1', joined);
    await clearForHouseholdEnd(store, 'u1');
    expect(await loadJoinNote(store, 'u1')).toBeNull();
    await saveJoinNote(store, 'u1', joined);
    await clearForSignOut(store);
    expect(await store.keys()).toEqual(['theme']);
  });

  it('says a seat’s length from what the check said, or from when the server says it ends', () => {
    expect(seatHoursOf(6, null, T0)).toBe(6);
    expect(seatHoursOf(null, new Date(T0 + 6 * HOUR).toISOString(), T0)).toBe(6);
    // a moment after the join, still six hours as a person says it
    expect(seatHoursOf(undefined, new Date(T0 + 6 * HOUR - 40_000).toISOString(), T0)).toBe(6);
    expect(seatHoursOf(null, null, T0)).toBeNull();
    expect(seatHoursOf(null, new Date(T0 - HOUR).toISOString(), T0)).toBeNull();
    expect(seatHoursOf(null, 'not a date', T0)).toBeNull();
  });
});

describe('an invite link, in each of the forms it can arrive in', () => {
  const ctx = { scheme: BRAND.urlScheme, host: BRAND.universalLinkHost };
  const own = `${BRAND.urlScheme}://`;
  const site = `https://${BRAND.universalLinkHost}`;
  const T = 'AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789abcde';

  it('the app’s own scheme, and the in-app test backend’s', () => {
    expect(inviteTokenOf(`${own}invite/${T}`, ctx)).toBe(T);
    expect(inviteTokenOf(`${BRAND.urlScheme}-mock://invite/${T}`, ctx)).toBe(T);
  });

  it('Expo Go’s form, which is the only one an invite can take on the phone the owner tests with', () => {
    expect(inviteTokenOf(`exp://192.168.1.5:8081/--/invite/${T}`, ctx)).toBe(T);
  });

  it('the universal link, which a message app shows as a link', () => {
    expect(inviteTokenOf(`${site}/app/invite/${T}`, ctx)).toBe(T);
    // someone else's host is not ours
    expect(inviteTokenOf(`https://evil.example/app/invite/${T}`, ctx)).toBeNull();
  });

  it('takes nothing else for one: an auth link, a short or a strange token, a path with more in it', () => {
    expect(inviteTokenOf(`${own}auth/callback?code=abc`, ctx)).toBeNull();
    expect(inviteTokenOf(`${own}invite/short`, ctx)).toBeNull();
    expect(inviteTokenOf(`${own}invite/${T}!`, ctx)).toBeNull();
    expect(inviteTokenOf(`${site}/app/invite/${T}/more`, ctx)).toBeNull();
    expect(inviteTokenOf(`${own}today`, ctx)).toBeNull();
  });
});
