import {
  cachedPlan,
  INVITE_CODE_ALPHABET,
  inviteCodeHasBlockedWord,
  MODULES,
  planSnapshot,
  type ModuleId,
} from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../prefs';
import { reduceRefresh, stateAtLaunch, type Session } from '../session';
import {
  drawInviteCode,
  MOCK_CODE_TTL_MS,
  MockAccountsApi,
  MockAuthProvider,
  MockBackend,
} from './mock';
import { AuthFailure, type SessionStore } from './types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-14T12:00:00Z');
const PAYLOAD = (op = '6f5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f') => ({
  client_op_id: op,
  profile: { display_name: 'Dana', locale: 'en-US', time_zone: 'America/Chicago' },
  household: { name: 'The Iversen family', home_time_zone: 'America/Chicago' },
  child: { name: 'Emma', birth_date: '2026-06-01' },
  modules: ['bottle', 'diaper', 'sleep', 'vaccine', 'growth', 'temp'] as ModuleId[],
  age_gate: { region: 'US', threshold: 13 as const, passed: true as const },
});

function sessionStore(): SessionStore {
  let s: Session | null = null;
  return {
    load: async () => s,
    save: async v => {
      s = v;
    },
    clear: async () => {
      s = null;
    },
  };
}

/** One backend, any number of devices; the clock is the server's. */
function world() {
  let now = T0;
  const backend = new MockBackend({ now: () => now });
  const device = () => {
    const store = sessionStore();
    const auth = new MockAuthProvider(backend, store);
    return { auth, api: new MockAccountsApi(backend, auth), store };
  };
  return { backend, device, advance: (ms: number) => (now += ms), now: () => now };
}

async function signedUp(
  w: ReturnType<typeof world>,
  email: string,
  password = 'correct horse battery',
) {
  const d = w.device();
  const r = await d.auth.signUpWithPassword(email, password);
  expect(r).toEqual({ session: null, needsVerification: true });
  const link = await d.auth.handleAuthLink(w.backend.lastLink ?? '');
  expect(link.kind).toBe('signed_in');
  return d;
}

describe('the mock provider follows the server rules (ACCOUNTS.md, AUTH_AND_TRIAL.md §6)', () => {
  it('sign-up needs verification: no session, sign-in refused, the emailed link verifies and signs in', async () => {
    const w = world();
    const d = w.device();
    expect(await d.auth.signUpWithPassword('dana@example.test', 'correct horse battery')).toEqual({
      session: null,
      needsVerification: true,
    });
    await expect(
      d.auth.signUpWithPassword('dana@example.test', 'correct horse battery'),
    ).rejects.toMatchObject({ code: 'email_taken' });
    await expect(d.auth.signUpWithPassword('x@example.test', 'short')).rejects.toMatchObject({
      code: 'weak_password',
    });
    await expect(
      d.auth.signInWithPassword('dana@example.test', 'correct horse battery'),
    ).rejects.toMatchObject({ code: 'email_not_verified' });
    await expect(
      d.auth.signInWithPassword('dana@example.test', 'wrong password!!'),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(await d.api.createHousehold(PAYLOAD())).toMatchObject({
      ok: false,
      status: 401,
      error: 'unauthenticated',
    });
    expect(w.backend.sent).toEqual([{ to: 'dana@example.test', kind: 'verify' }]);
    const link = await d.auth.handleAuthLink(w.backend.lastLink ?? '');
    expect(link).toMatchObject({
      kind: 'signed_in',
      session: { user: { email: 'dana@example.test', emailVerified: true } },
    });
    expect(await d.auth.handleAuthLink('https://example.test/not-ours')).toEqual({
      kind: 'ignored',
    });
    // the mock never keeps the password
    expect(JSON.stringify(w.backend.state)).not.toContain('correct horse battery');
  });

  it('create-household is one transaction, idempotent, validated, and grants 14 days of Plus once', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    const r = await d.api.createHousehold(PAYLOAD());
    expect(r).toMatchObject({
      ok: true,
      role: 'OWNER',
      created: true,
      welcome_granted: true,
      welcome_expires_at: new Date(T0 + 14 * DAY).toISOString(),
    });
    const state = await d.api.bootstrapState();
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      household_name: 'The Iversen family',
      role: 'OWNER',
      // when the household began: the Schedule's first day runs from here (`Membership` says why
      // the account carries it — the dev build's mirror never has the row)
      household_created_at: new Date(T0).toISOString(),
      // and when this person joined, for the plan cards (core's `joinedDuringPreview`)
      joined_at: new Date(T0).toISOString(),
    });
    expect(state.children).toHaveLength(1);
    expect(state.modules).toHaveLength(MODULES.length); // one row per registry entry
    expect(
      state.modules
        .filter(m => m.enabled)
        .map(m => m.module_id)
        .sort(),
    ).toEqual(['bottle', 'diaper', 'growth', 'sleep', 'temp', 'vaccine']);
    const plan = planSnapshot(state.entitlement, state.serverNow);
    expect(plan).toMatchObject({ status: 'WELCOME', tier: 'PLUS', daysLeft: 14 });

    // a retried Finish returns the same household; different data is a 409
    expect(await d.api.createHousehold(PAYLOAD())).toMatchObject({
      ok: true,
      created: false,
      household_id: (r as { household_id: string }).household_id,
    });
    expect(
      await d.api.createHousehold(PAYLOAD('11111111-1111-4111-8111-111111111111')),
    ).toMatchObject({ ok: false, status: 409, error: 'already_owns_household' });

    const other = await signedUp(w, 'sam@example.test');
    expect(
      await other.api.createHousehold({
        ...PAYLOAD(),
        child: { name: 'Mia', birth_date: '2030-01-01' },
      }),
    ).toEqual({
      ok: false,
      status: 422,
      error: 'validation_error',
      detail: 'child.birth_date',
    });
  });

  it('delete the account, sign up again with the same email: no second welcome grant', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    expect(await d.api.createHousehold(PAYLOAD())).toMatchObject({ welcome_granted: true });
    const del = await d.api.requestAccountDeletion();
    expect(del).toMatchObject({ ok: true, purge_at: new Date(T0 + 14 * DAY).toISOString() });
    // the sessions are revoked: this device's next refresh forces a sign-out
    expect(await d.auth.refreshSession()).toEqual({ kind: 'invalid' });
    w.advance(15 * DAY);
    expect(w.backend.purgeDue()).toBe(1);
    const again = await signedUp(w, 'Dana@Example.test'); // same address, different case
    const r = await again.api.createHousehold(PAYLOAD('22222222-2222-4222-8222-222222222222'));
    expect(r).toMatchObject({
      ok: true,
      created: true,
      welcome_granted: false,
      welcome_expires_at: null,
    });
    const state = await again.api.bootstrapState();
    expect(state.entitlement).toBeNull();
    expect(planSnapshot(state.entitlement, state.serverNow)).toMatchObject({
      status: 'FREE',
      tier: 'FREE',
      daysLeft: null,
    });
  });

  it('signing back in inside the window is the undo — made by the app’s own call, as on a real project', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    await d.api.createHousehold(PAYLOAD());
    await d.api.requestAccountDeletion();
    expect((await d.api.bootstrapState()).deletionPending).toBeNull(); // no session any more: nothing to read
    // the phone that asked cannot take it back: its session went with the request
    expect(await d.api.cancelAccountDeletion()).toMatchObject({ ok: false, status: 401 });
    w.advance(3 * DAY);
    const back = w.device();
    await back.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    // signing in alone changes nothing on the server — Supabase Auth knows nothing of the queue,
    // and this backend used to cancel inside its sign-in, which is how the real gap hid
    expect((await back.api.bootstrapState()).deletionPending).toEqual({
      purge_at: new Date(T0 + 14 * DAY).toISOString(),
    });
    expect(await back.api.cancelAccountDeletion()).toEqual({ ok: true, cancelled: true });
    expect((await back.api.bootstrapState()).deletionPending).toBeNull();
    expect((await back.api.bootstrapState()).memberships).toHaveLength(1);
    // idempotent: nothing left to undo, and it says so
    expect(await back.api.cancelAccountDeletion()).toEqual({ ok: true, cancelled: false });
    w.advance(15 * DAY);
    expect(w.backend.purgeDue()).toBe(0);
  });

  it('every sign-in leaves the queue alone: Google and the emailed link as well as the password', async () => {
    const w = world();
    const g = w.device();
    await g.auth.signInWithGoogle();
    await g.api.requestAccountDeletion();
    w.advance(DAY);
    const again = w.device();
    await again.auth.signInWithGoogle();
    expect((await again.api.bootstrapState()).deletionPending).not.toBeNull();
    expect(await again.api.cancelAccountDeletion()).toEqual({ ok: true, cancelled: true });

    const e = await signedUp(w, 'sam@example.test');
    await e.api.requestAccountDeletion();
    w.advance(DAY);
    const reset = w.device();
    await reset.auth.sendPasswordReset('sam@example.test');
    const link = await reset.auth.handleAuthLink(w.backend.lastLink ?? '');
    expect(link.kind).toBe('recovery');
    expect((await reset.api.bootstrapState()).deletionPending).not.toBeNull();
    expect(await reset.api.cancelAccountDeletion()).toEqual({ ok: true, cancelled: true });
  });

  it('the purge keeps an account that signed in again and is still signed in, though the app never called (0131)', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    await d.api.createHousehold(PAYLOAD());
    await d.api.requestAccountDeletion();
    w.advance(DAY);
    const back = w.device();
    await back.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    // …and the phone never reached the server with its call
    w.advance(14 * DAY);
    expect(w.backend.purgeDue()).toBe(0);
    expect((await back.api.bootstrapState()).deletionPending).toBeNull();
    expect((await back.api.bootstrapState()).memberships).toHaveLength(1);
  });

  it('…but purges one that signed in again and then signed out everywhere before the window closed', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    await d.api.createHousehold(PAYLOAD());
    await d.api.requestAccountDeletion();
    w.advance(DAY);
    const back = w.device();
    await back.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    await back.auth.signOut('global');
    w.advance(14 * DAY);
    expect(w.backend.purgeDue()).toBe(1);
  });

  it('a caregiver joining on day 9 inherits 5 days and is granted nothing of their own', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const created = await owner.api.createHousehold(PAYLOAD());
    const householdId = (created as { household_id: string }).household_id;
    w.advance(9 * DAY);
    const inv = await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE');
    expect(inv).toMatchObject({
      ok: true,
      kind: 'CODE',
      expires_at: new Date(w.now() + MOCK_CODE_TTL_MS).toISOString(),
    });
    const code = (inv as { code: string }).code;
    // six letters from A to Z (0144), for five minutes, and never a rude word
    expect(code).toMatch(/^[A-Z]{6}$/);
    expect(inviteCodeHasBlockedWord(code)).toBe(false);
    expect(MOCK_CODE_TTL_MS).toBe(5 * 60_000);

    const mia = await signedUp(w, 'mia@example.test');
    // as a person types it: lower case, with the dash it is read out with
    const joined = await mia.api.acceptInvite({
      code: `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase(),
      display_name: 'Mia',
    });
    expect(joined).toEqual({
      ok: true,
      household_id: householdId,
      household_name: 'The Iversen family',
      role: 'CAREGIVER',
      welcome_expires_at: new Date(T0 + 14 * DAY).toISOString(),
      // a permanent seat: nothing ends (0139 says when a temporary one does)
      seat_expires_at: null,
    });
    const state = await mia.api.bootstrapState();
    expect(planSnapshot(state.entitlement, state.serverNow)).toMatchObject({
      status: 'WELCOME',
      tier: 'PLUS',
      daysLeft: 5,
    });
    expect(w.backend.state.welcome_ledger).toEqual(['dana@example.test']); // no grant of Mia's own
    expect(
      (await owner.api.listMembers(householdId)).map(m => [m.display_name, m.role, m.is_self]),
    ).toEqual([
      ['Dana', 'OWNER', true],
      ['Mia', 'CAREGIVER', false],
    ]);
  });

  it('a code works once, every failure looks the same, and five wrong guesses stop the guesser, never the code', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const householdId = ((await owner.api.createHousehold(PAYLOAD())) as { household_id: string })
      .household_id;
    const code = ((await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string })
      .code;
    const wrong = code === 'ZZZZZZ' ? 'XXXXXX' : 'ZZZZZZ';

    expect(await owner.api.acceptInvite({ code })).toMatchObject({
      ok: false,
      status: 409,
      error: 'own_invite',
    });

    const guesser = await signedUp(w, 'guess@example.test');
    const left: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await guesser.api.acceptInvite({ code: wrong });
      expect(r).toMatchObject({ ok: false, status: 404, error: 'invalid_invite' });
      left.push((r as { attempts_left: number }).attempts_left);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect(await guesser.api.acceptInvite({ code: wrong })).toMatchObject({
      ok: false,
      status: 429,
      error: 'rate_limited',
    });
    // 0008's burn is gone (0140): somebody else's wrong guesses leave the code working
    const honest = await signedUp(w, 'sam@example.test');
    expect(await honest.api.acceptInvite({ code })).toMatchObject({ ok: true, role: 'PARENT' });

    // a fresh code, used once; expired codes fail the same way
    const fresh = (
      (await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string }
    ).code;
    const rose = await signedUp(w, 'rose@example.test');
    expect(await rose.api.acceptInvite({ code: fresh })).toMatchObject({
      ok: true,
      role: 'PARENT',
    });
    const late = await signedUp(w, 'late@example.test');
    expect(await late.api.acceptInvite({ code: fresh })).toMatchObject({
      ok: false,
      status: 404,
      error: 'invalid_invite',
    });
    const expiring = (
      (await owner.api.createInvite(householdId, 'VIEW_ONLY', 'CODE')) as { code: string }
    ).code;
    w.advance(MOCK_CODE_TTL_MS + 1);
    expect(await late.api.acceptInvite({ code: expiring })).toMatchObject({
      ok: false,
      status: 404,
      error: 'invalid_invite',
    });
    expect(await honest.api.acceptInvite({ code: expiring })).toMatchObject({
      ok: false,
      status: 404,
    }); // already a member, but the reply never says so for a dead code
  });

  it('links are the same function with a token; a link is 48 hours and single use', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const householdId = ((await owner.api.createHousehold(PAYLOAD())) as { household_id: string })
      .household_id;
    const inv = await owner.api.createInvite(householdId, 'CAREGIVER', 'LINK');
    expect(inv).toMatchObject({ ok: true, kind: 'LINK' });
    const token = (inv as { url: string }).url.split('/invite/')[1] ?? '';
    expect(token).toHaveLength(43);
    const mia = await signedUp(w, 'mia@example.test');
    expect(await mia.api.acceptInvite({ token })).toMatchObject({ ok: true, role: 'CAREGIVER' });
    const sam = await signedUp(w, 'sam@example.test');
    expect(await sam.api.acceptInvite({ token })).toMatchObject({
      ok: false,
      status: 404,
      error: 'invalid_invite',
    });
  });

  it('the caregiver boundary, roles, removal and the last-owner guard', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const householdId = ((await owner.api.createHousehold(PAYLOAD())) as { household_id: string })
      .household_id;
    const mia = await signedUp(w, 'mia@example.test');
    const code = (
      (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE')) as { code: string }
    ).code;
    await mia.api.acceptInvite({ code, display_name: 'Mia' });
    const miaId = (await mia.api.bootstrapState()).profile?.id ?? '';

    // a caregiver cannot change settings, invite, or manage roles
    expect(await mia.api.setModuleEnabled(householdId, 'pump', false)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await mia.api.createInvite(householdId, 'CAREGIVER', 'CODE')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await mia.api.setRole(householdId, miaId, 'PARENT')).toMatchObject({
      ok: false,
      status: 403,
    });
    // the owner can; a toggle writes the flag and nothing else
    const before = JSON.stringify({ c: w.backend.state.children, m: w.backend.state.members });
    expect(await owner.api.setModuleEnabled(householdId, 'pump', false)).toEqual({ ok: true });
    expect(
      (await owner.api.bootstrapState()).modules.find(m => m.module_id === 'pump')?.enabled,
    ).toBe(false);
    expect(JSON.stringify({ c: w.backend.state.children, m: w.backend.state.members })).toBe(
      before,
    );
    // ownership moves only by transfer; a household always has an owner
    expect(await owner.api.setRole(householdId, miaId, 'OWNER')).toMatchObject({
      ok: false,
      status: 422,
    });
    const ownerId = (await owner.api.bootstrapState()).profile?.id ?? '';
    expect(await owner.api.removeMember(householdId, ownerId)).toMatchObject({
      ok: false,
      status: 409,
      error: 'last_owner',
    });
    expect(await owner.api.setRole(householdId, miaId, 'PARENT')).toEqual({ ok: true });
    expect(await owner.api.transferOwnership(householdId, miaId)).toEqual({ ok: true });
    expect((await owner.api.listMembers(householdId)).map(m => [m.display_name, m.role])).toEqual([
      ['Dana', 'PARENT'],
      ['Mia', 'OWNER'],
    ]);
    // the new owner removes the old one: reads end, the membership row stays (removed_at)
    expect(await mia.api.removeMember(householdId, ownerId)).toEqual({ ok: true });
    expect((await owner.api.bootstrapState()).memberships).toEqual([]);
    expect(w.backend.state.members.find(m => m.user_id === ownerId)?.removed_at).toBeTruthy();
    expect(await owner.api.listMembers(householdId)).toEqual([]);
  });

  it('a second child: a parent adds one, a caregiver cannot, and it is in the next account read', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.com');
    const made = await owner.api.createHousehold(PAYLOAD());
    expect(made.ok).toBe(true);
    const hh = (made as { household_id: string }).household_id;

    // validation is the same as setup's: no name, no date, no future date
    expect(
      await owner.api.addChild(hh, { name: '', birth_date: '2026-06-01', due_date: null }),
    ).toMatchObject({
      ok: false,
      status: 422,
      detail: 'child.name',
    });
    expect(
      await owner.api.addChild(hh, { name: 'Liam', birth_date: '2099-01-01', due_date: null }),
    ).toMatchObject({ ok: false, status: 422, detail: 'child.birth_date' });

    const added = await owner.api.addChild(hh, {
      name: ' Liam ',
      birth_date: '2026-06-01',
      due_date: null,
    });
    expect(added).toMatchObject({
      ok: true,
      child: { name: 'Liam', birth_date: '2026-06-01', household_id: hh },
    });
    const state = await owner.api.bootstrapState();
    expect(state.children.map(c => c.name)).toEqual(['Emma', 'Liam']);

    // a caregiver may log for both babies and add neither (children_write is app.can_admin)
    const inv = await owner.api.createInvite(hh, 'CAREGIVER', 'CODE');
    const sitter = await signedUp(w, 'sitter@example.com');
    expect(await sitter.api.acceptInvite({ code: (inv as { code: string }).code })).toMatchObject({
      ok: true,
    });
    expect(
      await sitter.api.addChild(hh, { name: 'Ava', birth_date: '2026-06-01', due_date: null }),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
    expect((await sitter.api.bootstrapState()).children).toHaveLength(2);
  });

  it('sign out everywhere ends the other device; a local sign-out does not', async () => {
    const w = world();
    const phone = await signedUp(w, 'dana@example.test');
    const tablet = w.device();
    await tablet.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    await phone.auth.signOut('local');
    expect(await tablet.auth.refreshSession()).toMatchObject({ kind: 'ok' });
    await tablet.auth.signOut('global');
    const laptop = w.device();
    await laptop.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    const watch = w.device();
    await watch.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    await laptop.auth.signOut('global');
    const cached = await watch.store.load(); // what the watch renders from at its next launch
    const outcome = await watch.auth.refreshSession();
    expect(outcome).toEqual({ kind: 'invalid' });
    expect(await watch.store.load()).toBeNull(); // the dead session is not kept around
    // and the app's session reducer turns that into the forced sign-out (ACCOUNTS.md §6.3)
    expect(reduceRefresh(stateAtLaunch(cached), outcome).effect).toBe('forced_sign_out');
  });

  it('a new password keeps this session and ends every other one', async () => {
    const w = world();
    const phone = await signedUp(w, 'dana@example.test');
    const tablet = w.device();
    await tablet.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    await phone.auth.sendPasswordReset('nobody@example.test'); // same silence for an unknown address
    await phone.auth.sendPasswordReset('dana@example.test');
    expect(w.backend.sent.filter(s => s.kind === 'recovery')).toHaveLength(1);
    expect(await phone.auth.handleAuthLink(w.backend.lastLink ?? '')).toMatchObject({
      kind: 'recovery',
    });
    await phone.auth.updatePassword('a brand new passphrase');
    expect(await phone.auth.refreshSession()).toMatchObject({ kind: 'ok' });
    expect(await tablet.auth.refreshSession()).toEqual({ kind: 'invalid' });
    const laptop = w.device();
    await expect(
      laptop.auth.signInWithPassword('dana@example.test', 'correct horse battery'),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await laptop.auth.signInWithPassword('dana@example.test', 'a brand new passphrase');
  });

  it('a signed-in change checks the current password, and an OAuth account has none', async () => {
    const w = world();
    const phone = await signedUp(w, 'dana@example.test');
    expect(await phone.auth.hasPassword()).toBe(true);
    await expect(phone.auth.updatePassword('another long passphrase')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await expect(
      phone.auth.updatePassword('another long passphrase', 'wrong password!!'),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await phone.auth.updatePassword('another long passphrase', 'correct horse battery');
    const again = w.device();
    await again.auth.signInWithPassword('dana@example.test', 'another long passphrase');

    const apple = w.device();
    await apple.auth.signInWithApple();
    expect(await apple.auth.hasPassword()).toBe(false);
    await expect(
      apple.auth.updatePassword('a password they never had', 'nope'),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('offline: the cached session stays signed in and every call says offline instead of failing', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    await d.api.createHousehold(PAYLOAD());
    w.backend.online = false;
    expect(await d.auth.restoreSession()).toMatchObject({ user: { email: 'dana@example.test' } });
    expect(await d.auth.refreshSession()).toEqual({ kind: 'offline' });
    await expect(d.api.bootstrapState()).rejects.toBeInstanceOf(AuthFailure);
    await expect(d.api.createHousehold(PAYLOAD())).rejects.toMatchObject({ code: 'offline' });
    await expect(
      d.auth.signInWithPassword('dana@example.test', 'correct horse battery'),
    ).rejects.toMatchObject({ code: 'offline' });
    w.backend.online = true;
    expect(await d.auth.refreshSession()).toMatchObject({ kind: 'ok' });
  });

  it('the device clock never ends the preview; day 15 offline stays entitled; reconnect makes it FREE with nothing deleted', async () => {
    const w = world();
    const d = await signedUp(w, 'dana@example.test');
    await d.api.createHousehold(PAYLOAD());
    const state = await d.api.bootstrapState();
    const snapshot = planSnapshot(state.entitlement, state.serverNow);
    const deviceThen = 5_000;
    expect(cachedPlan(snapshot, deviceThen + 30 * DAY, deviceThen)).toMatchObject({
      status: 'WELCOME',
      tier: 'PLUS',
      daysLeft: 0,
    });
    // day 15, offline: the last snapshot is what the app shows
    w.advance(15 * DAY);
    w.backend.online = false;
    expect(await d.auth.refreshSession()).toEqual({ kind: 'offline' });
    expect(cachedPlan(snapshot, deviceThen + 15 * DAY, deviceThen).tier).toBe('PLUS');
    // reconnect: the server's word is FREE, and every row is still there
    w.backend.online = true;
    const after = await d.api.bootstrapState();
    expect(planSnapshot(after.entitlement, after.serverNow)).toMatchObject({
      status: 'FREE',
      tier: 'FREE',
    });
    expect(after.children).toHaveLength(1);
    expect(after.memberships).toHaveLength(1);
    expect(after.modules).toHaveLength(MODULES.length);
  });

  it('persists its server state so a killed app resumes with its household', async () => {
    const store = memoryStore();
    let now = T0;
    const first = new MockBackend({ now: () => now, store });
    const d = { store: sessionStore() };
    const auth = new MockAuthProvider(first, d.store);
    const api = new MockAccountsApi(first, auth);
    await auth.signUpWithPassword('dana@example.test', 'correct horse battery');
    await auth.handleAuthLink(first.lastLink ?? '');
    await api.createHousehold(PAYLOAD());
    await first.save();

    now += DAY;
    const second = new MockBackend({ now: () => now, store });
    await second.load();
    const auth2 = new MockAuthProvider(second, d.store);
    expect(await auth2.restoreSession()).toMatchObject({ user: { email: 'dana@example.test' } });
    const api2 = new MockAccountsApi(second, auth2);
    const state = await api2.bootstrapState();
    expect(state.memberships[0]?.household_name).toBe('The Iversen family');
    expect(planSnapshot(state.entitlement, state.serverNow).daysLeft).toBe(13);
  });
});

/**
 * TEMPORARY SEATS (migration 0101, the owner 2026-09-22). The mock has to enforce this exactly
 * as the server does, because it is what runs on the owner's phone until the Supabase project
 * exists — a mock that is laxer here would show a feature working that does not.
 */
describe('a caregiver who is here for an evening', () => {
  const setUp = async (w: ReturnType<typeof world>) => {
    const owner = await signedUp(w, 'dana@example.test');
    const created = await owner.api.createHousehold(PAYLOAD());
    return { owner, householdId: (created as { household_id: string }).household_id };
  };

  it('ends the seat by itself, counting from when they joined and not from when the code was made', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const inv = await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6);
    expect(inv).toMatchObject({ ok: true, seat_hours: 6 });

    // the code is made now and used two days later: the evening runs from the joining
    w.advance(2 * DAY);
    const sitter = await signedUp(w, 'sitter@example.test');
    // …so a fresh code, since a 5-minute one is long gone
    const fresh = (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6)) as {
      code: string;
    };
    expect(await sitter.api.acceptInvite({ code: fresh.code, display_name: 'Sam' })).toMatchObject({
      ok: true,
      role: 'CAREGIVER',
    });

    const joined = w.now();
    const roster = await owner.api.listMembers(householdId);
    expect(roster).toHaveLength(2);
    expect(roster[1]).toMatchObject({
      display_name: 'Sam',
      role: 'CAREGIVER',
      expires_at: new Date(joined + 6 * 3_600_000).toISOString(),
    });
    // permanent first, temporary after
    expect(roster[0]?.expires_at).toBeNull();

    // five hours in they are still here; seven hours in they are not, with no job having run
    w.advance(5 * 3_600_000);
    expect(await owner.api.listMembers(householdId)).toHaveLength(2);
    expect((await sitter.api.bootstrapState()).memberships).toHaveLength(1);
    w.advance(2 * 3_600_000);
    expect(await owner.api.listMembers(householdId)).toHaveLength(1);
    expect((await sitter.api.bootstrapState()).memberships).toHaveLength(0);
  });

  it('clears the old end date when the same person is invited back permanently', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const sitter = await signedUp(w, 'sitter@example.test');
    const first = (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6)) as {
      code: string;
    };
    await sitter.api.acceptInvite({ code: first.code, display_name: 'Sam' });
    w.advance(7 * 3_600_000); // lapsed

    // not "already_member": the seat stopped counting, so neither may the guard
    const second = (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE')) as {
      code: string;
    };
    expect(await sitter.api.acceptInvite({ code: second.code })).toMatchObject({ ok: true });
    const roster = await owner.api.listMembers(householdId);
    expect(roster).toHaveLength(2);
    expect(roster.find(m => m.display_name === 'Sam')?.expires_at).toBeNull();
  });

  it('keeps nobody from deleting their account once the seat has lapsed (0145)', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const sitter = await signedUp(w, 'sitter@example.test');
    const code = (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6)) as {
      code: string;
    };
    await sitter.api.acceptInvite({ code: code.code, display_name: 'Sam' });
    // while the evening lasts there is somebody to hand the household to
    expect(await owner.api.requestAccountDeletion()).toMatchObject({
      ok: false,
      status: 409,
      error: 'transfer_or_delete_household_first',
    });
    w.advance(7 * 3_600_000); // lapsed: nobody, and the roster offers nobody to hand it to
    expect(await owner.api.listMembers(householdId)).toHaveLength(1);
    expect(await owner.api.requestAccountDeletion()).toMatchObject({ ok: true });
  });

  it('refuses a length for anyone but a caregiver, and refuses a length the server would', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    expect(await owner.api.createInvite(householdId, 'PARENT', 'CODE', 6)).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 0)).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(
      await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 24 * 365 + 1),
    ).toMatchObject({ ok: false, status: 422 });
  });

  it('never lets a temporary member hand out a seat — an invite outlives its maker', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const guest = await signedUp(w, 'guest@example.test');
    const inv = (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 24)) as {
      code: string;
    };
    await guest.api.acceptInvite({ code: inv.code, display_name: 'Guest' });
    const guestState = await guest.api.bootstrapState();
    const guestId = guestState.profile?.id ?? '';
    // a seat that ends is never an admin's (0109): no promotion to parent, no ownership
    expect(await owner.api.setRole(householdId, guestId, 'PARENT')).toMatchObject({
      ok: false,
      status: 422,
      detail: 'temporary_seat',
    });
    expect(await owner.api.transferOwnership(householdId, guestId)).toMatchObject({
      ok: false,
      status: 422,
      detail: 'temporary_seat',
    });
    // a viewer gives nothing new, so that stays open
    expect(await owner.api.setRole(householdId, guestId, 'VIEW_ONLY')).toEqual({ ok: true });
    expect(await guest.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

/**
 * THE JOIN, CHECKED BEFORE THE ACCOUNT (migration 0139; the owner's report of 2026-09-29). The
 * in-app test backend follows the server exactly here too: it is what the owner's Expo Go ran on
 * before staging existed, and a mock that is laxer shows a join working that a project refuses.
 */
describe('an invite checked before the account, and the join that follows it (0139)', () => {
  const setUp = async (w: ReturnType<typeof world>) => {
    const owner = await signedUp(w, 'dana@example.test');
    const created = await owner.api.createHousehold(PAYLOAD());
    return { owner, householdId: (created as { household_id: string }).household_id };
  };

  it('answers a right code signed out with whose household it is, and a claim that outlives the email', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const code = ((await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string })
      .code;
    // a phone with nobody signed in
    const stranger = w.device();
    const checked = await stranger.api.checkInvite({ code });
    expect(checked).toMatchObject({
      ok: true,
      preview: {
        household_name: 'The Iversen family',
        inviter_name: 'Dana',
        role: 'PARENT',
        seat_hours: null,
      },
    });
    if (!checked.ok) return;
    expect(checked.token).toHaveLength(43);
    expect(Date.parse(checked.expires_at)).toBe(w.now() + 48 * 3_600_000);
    // the code stops working the moment it is claimed
    expect(await stranger.api.checkInvite({ code })).toMatchObject({
      ok: false,
      error: 'invalid_invite',
    });
    // the confirmation email takes an hour; the claim does not care
    w.advance(60 * 60_000);
    const sam = await signedUp(w, 'sam@example.test');
    expect(await sam.api.acceptInvite({ token: checked.token })).toMatchObject({
      ok: true,
      household_id: householdId,
      role: 'PARENT',
    });
    // and it works once
    const late = await signedUp(w, 'late@example.test');
    expect(await late.api.acceptInvite({ token: checked.token })).toMatchObject({
      ok: false,
      error: 'invalid_invite',
    });
  });

  it('says a wrong code is wrong and counts it against the phone, never the code; a link is checked for free', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const code = ((await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string })
      .code;
    const wrong = code === 'ZZZZZZ' ? 'XXXXXX' : 'ZZZZZZ';
    const phone = w.device();
    for (let i = 0; i < 10; i++)
      expect(await phone.api.checkInvite({ code: wrong })).toEqual({
        ok: false,
        status: 404,
        error: 'invalid_invite',
      });
    // ten wrong codes an hour from one signed-out connection (0140), then its codes wait, right
    // or wrong, and say which limit it was
    expect(await phone.api.checkInvite({ code })).toEqual({
      ok: false,
      status: 429,
      error: 'rate_limited',
      detail: 'invite_guess_conn',
    });
    // the code itself was never touched: the hour turns, and it is still there to check
    w.advance(60 * 60_000);
    const fresh = (
      (await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string }
    ).code;
    expect(await phone.api.checkInvite({ code: fresh })).toMatchObject({ ok: true });

    const link = (await owner.api.createInvite(householdId, 'PARENT', 'LINK')) as { url: string };
    const token = link.url.split('/invite/')[1] ?? '';
    const first = await phone.api.checkInvite({ token });
    const again = await phone.api.checkInvite({ token });
    expect(first).toMatchObject({
      ok: true,
      token,
      preview: { household_name: 'The Iversen family' },
    });
    expect(again).toMatchObject({ ok: true, token });
    // a malformed code is not a guess and is not sent anywhere
    expect(await phone.api.checkInvite({ code: '123' })).toMatchObject({ ok: false, status: 422 });
    // no connection: offline, thrown like every account call
    w.backend.online = false;
    await expect(phone.api.checkInvite({ code })).rejects.toBeInstanceOf(AuthFailure);
  });

  it('a caregiver’s seat needs the household’s Plus: said at the check with nothing spent, refused at the join', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    // the preview is on: a caregiver code checks out and joins
    const during = (
      (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE')) as {
        code: string;
      }
    ).code;
    expect(await w.device().api.checkInvite({ code: during })).toMatchObject({ ok: true });
    // fifteen days on the preview has ended, and nothing was bought
    w.advance(15 * DAY);
    const after = (
      (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE')) as {
        code: string;
      }
    ).code;
    const phone = w.device();
    expect(await phone.api.checkInvite({ code: after })).toMatchObject({
      ok: false,
      status: 403,
      error: 'needs_plus',
      preview: { household_name: 'The Iversen family', role: 'CAREGIVER' },
    });
    // nothing spent: the code is still live, and the join says the same
    const mia = await signedUp(w, 'mia@example.test');
    expect(await mia.api.acceptInvite({ code: after })).toMatchObject({
      ok: false,
      status: 403,
      error: 'needs_plus',
    });
    // a parent's seat is the free plan's own, and is never asked for Plus
    const partner = (
      (await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as {
        code: string;
      }
    ).code;
    expect(await mia.api.acceptInvite({ code: partner })).toMatchObject({
      ok: true,
      role: 'PARENT',
    });
  });

  it('a parent’s seat in a second household is refused before anything is written (0153), and a lapsed seat is no household', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    // Sam already has a household of his own
    const sam = await signedUp(w, 'sam@example.test');
    const own = await sam.api.createHousehold({
      ...PAYLOAD('7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f'),
      household: { name: 'Sam’s family', home_time_zone: 'America/Chicago' },
    });
    expect(own).toMatchObject({ ok: true });
    const code = ((await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string })
      .code;
    expect(await sam.api.acceptInvite({ code })).toMatchObject({
      ok: false,
      status: 409,
      error: 'admin_elsewhere',
    });
    // nothing was written, and the code is still live for the join that can go through
    expect((await sam.api.bootstrapState()).memberships.map(m => m.household_name)).toEqual([
      'Sam’s family',
    ]);
    const partner = await signedUp(w, 'partner@example.test');
    expect(await partner.api.acceptInvite({ code })).toMatchObject({ ok: true });

    // a sitter whose evening ran out is in no household, and joins another freely
    const sitter = await signedUp(w, 'sitter@example.test');
    const evening = (
      (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6)) as {
        code: string;
      }
    ).code;
    expect(await sitter.api.acceptInvite({ code: evening })).toMatchObject({ ok: true });
    w.advance(7 * 3_600_000);
    const samCode = (
      (await sam.api.createInvite(
        (own as { household_id: string }).household_id,
        'PARENT',
        'CODE',
      )) as { code: string }
    ).code;
    expect(await sitter.api.acceptInvite({ code: samCode })).toMatchObject({
      ok: true,
      household_name: 'Sam’s family',
    });
  });

  it('a babysitter in several families: a caregiver’s seat beside one’s own, each with its own plan, five at most (0153)', async () => {
    const w = world();
    // five families, each in its welcome preview (Plus), each with a code for a caregiver
    const families: { owner: Awaited<ReturnType<typeof signedUp>>; id: string }[] = [];
    for (let i = 0; i < 6; i += 1) {
      const owner = await signedUp(w, `owner${i}@example.test`);
      const made = await owner.api.createHousehold({
        ...PAYLOAD(`7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e${String(i).padStart(2, '0')}`),
        household: { name: `Family ${i}`, home_time_zone: 'America/Chicago' },
      });
      families.push({ owner, id: (made as { household_id: string }).household_id });
    }
    const codeFor = async (f: (typeof families)[number]) =>
      ((await f.owner.api.createInvite(f.id, 'CAREGIVER', 'CODE')) as { code: string }).code;
    // the sitter has a family of their own first
    const sitter = await signedUp(w, 'sitter@example.test');
    expect(
      await sitter.api.createHousehold({
        ...PAYLOAD('7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5eff'),
        household: { name: 'Sitter family', home_time_zone: 'America/Chicago' },
      }),
    ).toMatchObject({ ok: true });
    for (const f of families.slice(0, 4)) {
      expect(await sitter.api.acceptInvite({ code: await codeFor(f) })).toMatchObject({
        ok: true,
        role: 'CAREGIVER',
      });
      w.advance(11 * 60_000); // past the redemption limiter's ten minutes
    }
    const state = await sitter.api.bootstrapState();
    expect(state.memberships).toHaveLength(5);
    // every family's plan is in the one read
    expect(Object.keys(state.plans ?? {}).sort()).toEqual(
      state.memberships.map(m => m.household_id).sort(),
    );
    // a sixth is refused, and nothing is written
    expect(await sitter.api.acceptInvite({ code: await codeFor(families[5]!) })).toMatchObject({
      ok: false,
      status: 409,
      error: 'household_limit',
    });
    expect((await sitter.api.bootstrapState()).memberships).toHaveLength(5);
  });

  it('a family of your own beside the ones you help in (0154): a caregiver may, a parent may not, nor a sixth', async () => {
    const w = world();
    const families: { owner: Awaited<ReturnType<typeof signedUp>>; id: string }[] = [];
    for (let i = 0; i < 5; i += 1) {
      const owner = await signedUp(w, `owner${i}@example.test`);
      const made = await owner.api.createHousehold({
        ...PAYLOAD(`7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5f${String(i).padStart(2, '0')}`),
        household: { name: `Family ${i}`, home_time_zone: 'America/Chicago' },
      });
      families.push({ owner, id: (made as { household_id: string }).household_id });
    }
    const codeFor = async (f: (typeof families)[number], role: 'CAREGIVER' | 'PARENT') =>
      ((await f.owner.api.createInvite(f.id, role, 'CODE')) as { code: string }).code;

    // Nana is a caregiver in the first family, and starts her own: OWNER of it, the seat kept
    const nana = await signedUp(w, 'nana@example.test');
    expect(
      await nana.api.acceptInvite({ code: await codeFor(families[0]!, 'CAREGIVER') }),
    ).toMatchObject({ ok: true });
    const op = '7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5faa';
    const own = await nana.api.createHousehold({
      ...PAYLOAD(op),
      profile: { display_name: 'Nana', locale: 'en-US', time_zone: 'America/Chicago' },
      household: { name: 'Nana’s family', home_time_zone: 'America/Chicago' },
    });
    expect(own).toMatchObject({ ok: true, role: 'OWNER', created: true, welcome_granted: true });
    const ownId = (own as { household_id: string }).household_id;
    const state = await nana.api.bootstrapState();
    expect(state.memberships.map(m => [m.household_name, m.role])).toEqual([
      ['Family 0', 'CAREGIVER'],
      ['Nana’s family', 'OWNER'],
    ]);
    // the 14 days are the new family's own; the family she helps in keeps its owner's
    expect(planSnapshot(state.plans?.[ownId] ?? null, state.serverNow)).toMatchObject({
      status: 'WELCOME',
      tier: 'PLUS',
    });
    expect(planSnapshot(state.plans?.[families[0]!.id] ?? null, state.serverNow)).toMatchObject({
      tier: 'PLUS',
    });
    // a lost answer sent again is the same household, never one of the refusals
    expect(
      await nana.api.createHousehold({
        ...PAYLOAD(op),
        profile: { display_name: 'Nana', locale: 'en-US', time_zone: 'America/Chicago' },
      }),
    ).toMatchObject({ ok: true, created: false, household_id: ownId });

    // Sam is a PARENT in the second family: one family of your own, so no second
    const sam = await signedUp(w, 'sam@example.test');
    expect(
      await sam.api.acceptInvite({ code: await codeFor(families[1]!, 'PARENT') }),
    ).toMatchObject({ ok: true });
    expect(await sam.api.createHousehold(PAYLOAD('7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5fbb'))).toEqual({
      ok: false,
      status: 409,
      error: 'admin_elsewhere',
    });
    expect((await sam.api.bootstrapState()).memberships).toHaveLength(1);

    // Kim helps in all five: a sixth family, her own, is refused, and nothing is written
    const kim = await signedUp(w, 'kim@example.test');
    for (const f of families) {
      expect(await kim.api.acceptInvite({ code: await codeFor(f, 'CAREGIVER') })).toMatchObject({
        ok: true,
      });
      w.advance(11 * 60_000); // past the redemption limiter's ten minutes
    }
    expect(await kim.api.createHousehold(PAYLOAD('7a5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5fcc'))).toEqual({
      ok: false,
      status: 409,
      error: 'household_limit',
    });
    expect((await kim.api.bootstrapState()).memberships).toHaveLength(5);
  });

  it('says when a temporary seat ends, from the join', async () => {
    const w = world();
    const { owner, householdId } = await setUp(w);
    const code = (
      (await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6)) as {
        code: string;
      }
    ).code;
    const sitter = await signedUp(w, 'sitter@example.test');
    expect(await sitter.api.acceptInvite({ code })).toMatchObject({
      ok: true,
      seat_expires_at: new Date(w.now() + 6 * 3_600_000).toISOString(),
    });
  });

  it('writes the caller’s own name, and refuses one the rule refuses', async () => {
    const w = world();
    const sam = await signedUp(w, 'sam@example.test');
    expect(await sam.api.setDisplayName('  Sam  ')).toEqual({ ok: true });
    expect((await sam.api.bootstrapState()).profile?.display_name).toBe('Sam');
    expect(await sam.api.setDisplayName('S')).toMatchObject({ ok: false, status: 422 });
    expect(await sam.api.setDisplayName('see https://x.example')).toMatchObject({
      ok: false,
      status: 422,
    });
    // signed out, there is nobody to name
    await sam.auth.signOut('local');
    expect(await sam.api.setDisplayName('Sam')).toMatchObject({ ok: false, status: 401 });
  });
});

/**
 * PLUS BELONGS TO THE HOUSEHOLD (migration 0101, the owner 2026-09-22). One parent buys it and
 * the other, on their own phone, meets no paywall — in a product whose two free seats are the
 * point, the other shape produces refunds and one-star reviews.
 */
describe('the plan belongs to the household', () => {
  it('gives the second parent the plan the first one bought', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const created = await owner.api.createHousehold(PAYLOAD());
    const householdId = (created as { household_id: string }).household_id;
    const partner = await signedUp(w, 'sam@example.test');
    const inv = (await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string };
    await partner.api.acceptInvite({ code: inv.code, display_name: 'Sam' });

    // the welcome ends, and only the OWNER buys
    w.advance(15 * DAY);
    expect(planSnapshot((await partner.api.bootstrapState()).entitlement, w.now()).tier).toBe(
      'FREE',
    );
    w.backend.state.entitlements.push({
      user_id: (await owner.api.bootstrapState()).profile?.id ?? '',
      household_id: householdId,
      source: 'store',
      status: 'ACTIVE',
      current_period_end: new Date(w.now() + 30 * DAY).toISOString(),
    });

    const state = await partner.api.bootstrapState();
    expect(planSnapshot(state.entitlement, state.serverNow)).toMatchObject({
      status: 'ACTIVE',
      tier: 'PLUS',
    });
  });
});

/**
 * HOME MOVES WITH A FAMILY THAT MOVED (migration 0107, the owner 2026-09-23). The mock enforces the
 * server's rule — the owner alone, and only a zone the platform knows — because it is what runs on
 * the owner's phone until the Supabase project exists, and a laxer mock would show a parent a
 * button that the real server refuses.
 */
describe('the household’s home time zone', () => {
  it('is in every account read, and the owner alone can move it', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const created = await owner.api.createHousehold(PAYLOAD());
    const householdId = (created as { household_id: string }).household_id;
    expect((await owner.api.bootstrapState()).memberships[0]?.home_time_zone).toBe(
      'America/Chicago',
    );

    const partner = await signedUp(w, 'sam@example.test');
    const inv = (await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string };
    await partner.api.acceptInvite({ code: inv.code, display_name: 'Sam' });
    const stranger = await signedUp(w, 'stranger@example.test');

    // a parent is refused, and so is someone from outside — and neither changed anything
    expect(await partner.api.setHomeTimeZone(householdId, 'Europe/Paris')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await stranger.api.setHomeTimeZone(householdId, 'Europe/Paris')).toMatchObject({
      ok: false,
      status: 403,
    });
    // a name no clock knows is refused before it can reach the materialiser
    expect(await owner.api.setHomeTimeZone(householdId, 'Mars/Olympus_Mons')).toMatchObject({
      ok: false,
      status: 422,
    });
    expect((await partner.api.bootstrapState()).memberships[0]?.home_time_zone).toBe(
      'America/Chicago',
    );

    // the owner moves it, and the other parent's next read has it
    expect(await owner.api.setHomeTimeZone(householdId, 'Europe/Paris')).toEqual({ ok: true });
    expect((await partner.api.bootstrapState()).memberships[0]?.home_time_zone).toBe(
      'Europe/Paris',
    );
  });
});

/**
 * THE HOUSEHOLD'S NAME AFTER SETUP (migration 0151). The mock enforces the server's rule — the
 * owner alone, trimmed, 2 to 60 characters — because it is what runs until the project has the
 * function, and a laxer mock would show a parent a field the real server refuses.
 */
describe('the household’s name', () => {
  it('is changed by the owner alone, and the other parent’s next read has it', async () => {
    const w = world();
    const owner = await signedUp(w, 'dana@example.test');
    const created = await owner.api.createHousehold(PAYLOAD());
    const householdId = (created as { household_id: string }).household_id;
    expect((await owner.api.bootstrapState()).memberships[0]?.household_name).toBe(
      'The Iversen family',
    );

    const partner = await signedUp(w, 'sam@example.test');
    const inv = (await owner.api.createInvite(householdId, 'PARENT', 'CODE')) as { code: string };
    await partner.api.acceptInvite({ code: inv.code, display_name: 'Sam' });
    const stranger = await signedUp(w, 'stranger@example.test');

    expect(await partner.api.renameHousehold(householdId, 'The Rivera house')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await stranger.api.renameHousehold(householdId, 'The Rivera house')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await owner.api.renameHousehold(householdId, ' x ')).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(await owner.api.renameHousehold(householdId, 'a'.repeat(61))).toMatchObject({
      ok: false,
      status: 422,
    });
    expect((await partner.api.bootstrapState()).memberships[0]?.household_name).toBe(
      'The Iversen family',
    );

    expect(await owner.api.renameHousehold(householdId, '  The Rivera house ')).toEqual({
      ok: true,
    });
    expect((await owner.api.bootstrapState()).memberships[0]?.household_name).toBe(
      'The Rivera house',
    );
    expect((await partner.api.bootstrapState()).memberships[0]?.household_name).toBe(
      'The Rivera house',
    );
  });
});

/**
 * "START FRESH" (the owner, 2026-09-17: "how do i reset my expo history i want to start fresh
 * like i would just have downloaded the app").
 *
 * Signing out deliberately leaves this fake server standing — signing out of an app does not
 * delete your account, and the store it persists to is explicitly not a preference for that
 * reason. So a first-run test needs something that DOES delete it, and the one way that can go
 * wrong is timing: the backend keeps its world in memory and writes a snapshot on every change,
 * so a wipe that only removed the stored key, or that removed it while a save was in flight,
 * would find the old household back on the next launch.
 */
describe('the fake server can be wiped back to nothing', () => {
  it('forgets the accounts in memory and on disk', async () => {
    const store = memoryStore();
    const backend = new MockBackend({ now: () => T0, store });
    backend.createUser('dana@example.com', 'hunter2hunter2', 'email', true);
    await backend.save();
    expect(await store.get('mock_backend_state')).not.toBeNull();
    expect(backend.userByEmail('dana@example.com')).toBeDefined();

    await backend.reset();

    expect(backend.userByEmail('dana@example.com')).toBeUndefined();
    expect(backend.state.users).toEqual([]);
    expect(await store.get('mock_backend_state')).toBeNull();
  });

  it('is not undone by a save that was already in flight', async () => {
    const store = memoryStore();
    const backend = new MockBackend({ now: () => T0, store });
    backend.createUser('dana@example.com', 'hunter2hunter2', 'email', true);
    // no await: the snapshot is queued and lands DURING the reset, which is the real race —
    // the app saves on every change and a reset arrives while one is still settling
    void backend.save();
    await backend.reset();
    expect(await store.get('mock_backend_state')).toBeNull();
  });

  it('leaves a backend a sign-in can use again, rather than a broken one', async () => {
    const store = memoryStore();
    const backend = new MockBackend({ now: () => T0, store });
    backend.createUser('dana@example.com', 'hunter2hunter2', 'email', true);
    await backend.reset();
    // the same address is free again: that is the point of the reset for a first-run test
    const again = backend.createUser('dana@example.com', 'hunter2hunter2', 'email', true);
    expect(again.email).toBe('dana@example.com');
    expect(backend.state.users).toHaveLength(1);
  });
});

/**
 * THE SERVER'S PUSH, AS THE TEST BACKEND PLAYS IT (migration 0121). The rules that matter are the
 * server's — a phone registers only itself, and claims only for an install it registered — so the
 * mock keeps them, and a development build on the mock behaves as it will against Supabase.
 */
describe('a phone registers for push and claims its reminders (0121)', () => {
  const RULE = 'ffffffff-0000-4000-8000-000000000001';
  const phone = (deviceId: string, token: string | null = `fcm-${deviceId}`) => ({
    deviceId,
    platform: 'ANDROID' as const,
    pushToken: token,
    pushProvider: token === null ? null : ('FCM' as const),
    appVersion: '1.0.0',
    osVersion: '35',
    timeZone: 'America/Chicago',
    clock24h: false,
    volumeUnit: 'oz',
  });

  it('registers the caller’s own install, and never takes over somebody else’s', async () => {
    const w = world();
    const dana = await signedUp(w, 'dana@example.test');
    const brad = await signedUp(w, 'brad@example.test');
    expect(await dana.api.registerDevice(phone('d-dana'))).toEqual({ ok: true });
    expect(await brad.api.registerDevice(phone('d-dana'))).toMatchObject({
      ok: false,
      status: 403,
    });
    // with no token at all it still registers: its claims count
    expect(await brad.api.registerDevice(phone('d-brad', null))).toEqual({ ok: true });
    expect(w.backend.devices.get('d-brad')?.pushToken).toBeNull();
  });

  it('a token that moved to another install is let go by the one that had it', async () => {
    const w = world();
    const dana = await signedUp(w, 'dana@example.test');
    await dana.api.registerDevice(phone('d-old', 'shared'));
    await dana.api.registerDevice(phone('d-new', 'shared'));
    expect(w.backend.devices.get('d-old')?.pushToken).toBeNull();
    expect(w.backend.devices.get('d-new')?.pushToken).toBe('shared');
  });

  it('claims only for an install it registered, and sign-out forgets token and claims', async () => {
    const w = world();
    const dana = await signedUp(w, 'dana@example.test');
    const slots = [{ ruleId: RULE, scheduledForMs: T0 + DAY }];
    expect(await dana.api.claimLocalReminders('d-dana', slots)).toMatchObject({ status: 403 });
    await dana.api.registerDevice(phone('d-dana'));
    expect(await dana.api.claimLocalReminders('d-dana', slots)).toEqual({ ok: true });
    expect(w.backend.claims.get('d-dana')).toEqual(slots);
    // the whole claim, every time: an empty one lets every slot go
    await dana.api.claimLocalReminders('d-dana', []);
    expect(w.backend.claims.get('d-dana')).toEqual([]);

    await dana.api.claimLocalReminders('d-dana', slots);
    expect(await dana.api.forgetDevice('d-dana')).toEqual({ ok: true });
    expect(w.backend.devices.get('d-dana')?.pushToken).toBeNull();
    expect(w.backend.claims.has('d-dana')).toBe(false);
  });
});

/**
 * THE TEST SERVER ANSWERS A BAD LINK AND A DEAD SESSION THE WAY A REAL PROJECT DOES (the first-day
 * trace, 2026-09-25), so Expo Go walks the same paths a Play build does: `auth/linkError.ts` for
 * the link, and SIGNED_OUT from the client itself for a refresh the server refuses.
 */
describe('emailed links and a session the server has ended', () => {
  it('a link works once: opened again it is expired-or-used, as /verify says', async () => {
    const w = world();
    const d = w.device();
    await d.auth.signUpWithPassword('mia@example.test', 'correct horse battery');
    const link = w.backend.lastLink ?? '';
    expect((await d.auth.handleAuthLink(link)).kind).toBe('signed_in');
    // same phone already confirmed: a second open recovers the live session (cold-start race)
    expect((await d.auth.handleAuthLink(link)).kind).toBe('signed_in');
    // a different phone with no session still gets expired-or-used
    expect(await w.device().auth.handleAuthLink(link)).toEqual({
      kind: 'link_error',
      problem: { flow: 'sign_in', reason: 'expired' },
    });
  });

  it('otp_expired after this phone already confirmed recovers the session, not Verify', async () => {
    const w = world();
    const d = w.device();
    await d.auth.signUpWithPassword('mia@example.test', 'correct horse battery');
    const link = w.backend.lastLink ?? '';
    expect((await d.auth.handleAuthLink(link)).kind).toBe('signed_in');
    expect(
      await d.auth.handleAuthLink(
        'cuddlecue-mock://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toMatchObject({ kind: 'signed_in', session: { user: { emailVerified: true } } });
  });

  it('a resend replaces the earlier link, and the earlier one stops working', async () => {
    const w = world();
    const d = w.device();
    await d.auth.signUpWithPassword('mia@example.test', 'correct horse battery');
    const first = w.backend.lastLink ?? '';
    await d.auth.resendVerification('mia@example.test');
    const second = w.backend.lastLink ?? '';
    expect(second).not.toBe(first);
    expect(await d.auth.handleAuthLink(first)).toMatchObject({
      kind: 'link_error',
      problem: { reason: 'expired' },
    });
    expect((await d.auth.handleAuthLink(second)).kind).toBe('signed_in');
  });

  it('a reset link comes back to the recovery route, and says so when it is stale', async () => {
    const w = world();
    const d = await signedUp(w, 'mia@example.test');
    await d.auth.sendPasswordReset('mia@example.test');
    const reset = w.backend.lastLink ?? '';
    expect(reset).toMatch(/^cuddlecue-mock:\/\/auth\/recovery\?/);
    expect((await d.auth.handleAuthLink(reset)).kind).toBe('recovery');
    expect(await d.auth.handleAuthLink(reset)).toEqual({
      kind: 'link_error',
      problem: { flow: 'recovery', reason: 'expired' },
    });
  });

  it('reads Auth’s own reason off the return address, exactly as the real provider does', async () => {
    const w = world();
    const d = w.device();
    expect(
      await d.auth.handleAuthLink(
        'cuddlecue-mock://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ kind: 'link_error', problem: { flow: 'sign_in', reason: 'expired' } });
    // a link for an account that is not there is refused, not silently dropped
    expect(
      await d.auth.handleAuthLink('cuddlecue-mock://auth/callback?type=signup&user=nobody&n=1'),
    ).toEqual({ kind: 'link_error', problem: { flow: 'sign_in', reason: 'failed' } });
    // and a link that is not an auth link at all is still nobody's business here
    expect(await d.auth.handleAuthLink('cuddlecue-mock://today')).toEqual({ kind: 'ignored' });
  });

  it('signs itself out on a refresh the server refuses, and says SIGNED_OUT before answering', async () => {
    const w = world();
    const phone = await signedUp(w, 'dana@example.test');
    const events: string[] = [];
    const off = phone.auth.onAuthStateChange(e => events.push(e));
    // a healthy refresh is a TOKEN_REFRESHED, and no network is nothing at all
    expect((await phone.auth.refreshSession()).kind).toBe('ok');
    w.backend.online = false;
    expect(await phone.auth.refreshSession()).toEqual({ kind: 'offline' });
    w.backend.online = true;
    expect(events).toEqual(['TOKEN_REFRESHED']);
    // "sign out everywhere" on another phone revokes this one's session
    const tablet = w.device();
    await tablet.auth.signInWithPassword('dana@example.test', 'correct horse battery');
    await tablet.auth.signOut('global');
    expect(await phone.auth.refreshSession()).toEqual({ kind: 'invalid' });
    expect(events).toEqual(['TOKEN_REFRESHED', 'SIGNED_OUT']);
    expect(await phone.store.load()).toBeNull();
    off();
  });
});

describe('the codes the in-app test backend makes, as the server makes them (0144)', () => {
  /** The draws that pick these letters, one per letter, as `rng` hands them out. */
  const drawsFor = (...codes: string[]): (() => number) => {
    const draws = codes.flatMap(c =>
      [...c].map(ch => (INVITE_CODE_ALPHABET.indexOf(ch) + 0.5) / INVITE_CODE_ALPHABET.length),
    );
    return () => draws.shift() ?? 0;
  };

  it('draws again, whole, when a code holds a rude word anywhere, across the dash too', () => {
    expect(drawInviteCode(drawsFor('WDJBMA'), () => false)).toBe('WDJBMA');
    expect(drawInviteCode(drawsFor('XKILLX', 'WDJBMA'), () => false)).toBe('WDJBMA');
    // "QDI-EXR" reads as two harmless threes, and still holds DIE
    expect(drawInviteCode(drawsFor('QDIEXR', 'ASSQTV', 'KQRSTV'), () => false)).toBe('KQRSTV');
  });

  it('never makes one another live code already is', () => {
    expect(drawInviteCode(drawsFor('WDJBMA', 'NGZBFC'), c => c === 'WDJBMA')).toBe('NGZBFC');
  });
});
