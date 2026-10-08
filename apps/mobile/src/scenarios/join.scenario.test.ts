/**
 * EVERY WAY INTO SOMEBODY ELSE'S HOUSEHOLD, AS A PERSON LIVES IT (the owner's report of 2026-09-29:
 * *"the join household button from sign in does not work. and even joining household after signing
 * up feels like its incomplete. there was no text saying if i joined or not, or even for me that i
 * needed to sign up … check also how does if caregiver takes care of more than 2 babies from
 * different households? will this work?"*).
 *
 * Each step is a call the app makes, in the order it makes it, against the in-app test backend
 * (`auth/providers/mock.ts`, which follows migration 0139), with the phone's own pure pieces
 * deciding what happens: the code sheet's reading of a check (`checkOutcomeOf`), the invite held on
 * disk (`held-invite.ts`), the one join (`redeemInvite`), the note the joiner is owed, and the
 * words each screen shows (`screens/auth/copy.ts`, `joinCopy.ts`). Where `AuthContext` decides
 * inline — the auto-join's conditions, the `ready` effect's "not used" — the helper says which
 * lines it repeats.
 *
 *   A. the owner's path: the code first, on the sign-in screen; an account; the email an hour
 *      later; in on its own; "You joined Dana's family"; the joiner's name; Today
 *   B. a link, opened signed out, named before the account
 *   C. every way it can go wrong, and what the person is told
 *   D. two households: why one account holds one, and what happens if they try
 */
import { BRAND, LEGAL_VERSION } from '@nibblecue/brand';
import { canJoinAnother, focusAccount, zonedToUtc, type Role } from '@nibblecue/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  holdOf,
  lapseOf,
  loadInviteHold,
  saveInviteHold,
  withLifetime,
  type InviteHold,
} from '../auth/held-invite';
import { inviteShareLink, inviteTokenIn, inviteTokenOf } from '../auth/inviteLink';
import {
  checkOutcomeOf,
  clearJoinNote,
  loadJoinNote,
  redeemInvite,
  saveJoinNote,
  seatHoursOf,
  type JoinNote,
  type RedeemOutcome,
} from '../auth/join';
import {
  savePendingTermsAcceptance,
  loadPendingTermsAcceptance,
  clearPendingTermsAcceptance,
} from '../auth/pending-terms';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import {
  AuthFailure,
  type AccountState,
  type AccountsApi,
  type SessionStore,
} from '../auth/providers/types';
import type { Session } from '../auth/session';
import { setIdSource } from '../data/ids';
import { memoryStore, type KeyValueStore } from '../prefs';
import {
  checkRefusalSentence,
  inviteLapseSentence,
  joinProblemSentence,
  INVITE_FAILED,
} from '../screens/auth/copy';
import { JOIN } from '../screens/auth/joinCopy';
import { seededIds } from '../testing/fixtures';

const TZ = 'America/Chicago';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Tuesday 2026-09-29, 7:30 PM in Chicago: the owner's evening test. */
const EVENING = zonedToUtc(TZ, 2026, 9, 29, 19, 30);
const PASSWORD = 'correct horse battery';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(EVENING);
});
afterEach(() => {
  vi.useRealTimers();
  setIdSource(null);
});
const later = (ms: number): void => {
  vi.setSystemTime(Date.now() + ms);
};

const server = (prefix = 'cdcdcdcd'): MockBackend =>
  new MockBackend({ now: () => Date.now(), newId: seededIds(prefix) });

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

interface Phone {
  prefs: KeyValueStore;
  auth: MockAuthProvider;
  api: AccountsApi;
}

function phone(backend: MockBackend, keep?: { prefs: KeyValueStore; keychain: SessionStore }) {
  const prefs = keep?.prefs ?? memoryStore();
  const keychain = keep?.keychain ?? sessionStore();
  const auth = new MockAuthProvider(backend, keychain);
  return { prefs, keychain, auth, api: new MockAccountsApi(backend, auth) as AccountsApi };
}

const PAYLOAD = (name: string, op = crypto.randomUUID()) => ({
  client_op_id: op,
  profile: { display_name: name, locale: 'en-US', time_zone: TZ },
  household: { name: `${name}’s family`, home_time_zone: TZ },
  child: { name: 'Ada', birth_date: '2026-08-20' },
  modules: ['bottle', 'diaper', 'sleep'] as const,
});

/** An owner with a household made through setup's last button, and the preview it grants. */
async function household(backend: MockBackend, name: string, email: string) {
  const p = phone(backend);
  await p.auth.signUpWithPassword(email, PASSWORD);
  await p.auth.handleAuthLink(backend.lastLink ?? '');
  const made = await p.api.createHousehold({
    ...PAYLOAD(name),
    modules: [...PAYLOAD(name).modules],
  });
  if (!made.ok) throw new Error('no household');
  return { owner: p, householdId: made.household_id };
}

/** AUTH's create side with the box ticked, Verify, then the emailed link opening the app (`signedIn`). */
async function signUp(backend: MockBackend, p: Phone, email: string) {
  await p.auth.signUpWithPassword(email, PASSWORD);
  await savePendingTermsAcceptance(p.prefs, email, LEGAL_VERSION);
  return backend.lastLink ?? '';
}
async function openEmail(p: Phone, link: string) {
  const opened = await p.auth.handleAuthLink(link);
  expect(opened.kind).toBe('signed_in');
  // `drainPendingTerms`, before anything reads the account
  const email = p.auth.current()?.user.email ?? '';
  const pending = await loadPendingTermsAcceptance(p.prefs, email);
  if (pending !== null && (await p.api.acceptTerms(pending.version)).ok)
    await clearPendingTermsAcceptance(p.prefs, email);
  return p.api.bootstrapState();
}

/** The code sheet, signed out: the check, and what `JoinCodeSheet` `check` does with it. */
async function sheetCheck(p: Phone, code: string) {
  const outcome = checkOutcomeOf(await p.api.checkInvite({ code }));
  if (outcome.kind === 'found') {
    const hold = holdOf({ token: outcome.token }, Date.now(), {
      origin: 'code',
      preview: outcome.preview,
    });
    if (hold) await saveInviteHold(p.prefs, hold);
    return { outcome, said: JOIN.found.title(outcome.preview.household_name) };
  }
  if (outcome.kind === 'unchecked') {
    const hold = holdOf({ code }, Date.now(), { origin: 'code' });
    if (hold) await saveInviteHold(p.prefs, hold);
    return { outcome, said: JOIN.found.title('') };
  }
  return { outcome, said: checkRefusalSentence(outcome) };
}

/**
 * `AuthContext`'s auto-join, the moment an account READ in this run shows no household
 * (`heldKey` effect → `redeemHeld` → `settleJoin`): the clock first, then the one join, then the
 * note and the read — or the lapse, or the kept problem.
 */
async function autoJoin(p: Phone, read: AccountState) {
  expect(read.memberships, 'the auto-join only runs for an account with no household').toEqual([]);
  const uid = read.profile?.id ?? '';
  const stored = await loadInviteHold(p.prefs);
  const hold = withLifetime(stored, Date.now());
  if (hold !== stored && hold !== null) await saveInviteHold(p.prefs, hold);
  if (hold?.state !== 'held') return { outcome: null, hold };
  const name = read.profile?.display_name?.trim() ?? '';
  const outcome = await redeemInvite(
    {
      accept: input => p.api.acceptInvite(input),
      read: () => p.api.bootstrapState().catch(() => null),
    },
    hold.invite,
    name === '' ? null : name,
  );
  await settle(p, uid, hold, outcome);
  return { outcome, hold };
}

/** `settleJoin`, as the context writes it. */
async function settle(p: Phone, uid: string, hold: InviteHold, outcome: RedeemOutcome) {
  if (hold.state !== 'held') return;
  if (outcome.kind === 'joined') {
    const note: JoinNote = {
      kind: 'joined',
      household_id: outcome.household_id,
      household_name: outcome.household_name || (hold.preview?.household_name ?? ''),
      role: outcome.role,
      seat_hours: seatHoursOf(hold.preview?.seat_hours, outcome.seat_expires_at, Date.now()),
      at: Date.now(),
    };
    await saveJoinNote(p.prefs, uid, note);
  } else if (outcome.kind === 'refused') {
    await saveInviteHold(p.prefs, lapseOf(hold, outcome.reason, Date.now()));
  } else if (outcome.kind === 'in_household') {
    await saveJoinNote(p.prefs, uid, {
      kind: 'not_used',
      current: outcome.current,
      invited: hold.preview?.household_name ?? '',
      at: Date.now(),
    });
  }
}

/* ================================================================== A. the owner's path */

describe('A. the code first, on the sign-in screen, and in on its own', () => {
  it('names the household before the account, keeps the invite through an hour-long email, joins, and says so', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');

    // Sam's phone, signed out: "Join a household", six letters
    const sam = phone(backend);
    const checked = await sheetCheck(sam, made.code);
    // the sheet names the household and says an account comes next — it used to close silently
    expect(checked.said).toBe('This code is for Dana’s family');
    expect(checked.outcome).toMatchObject({
      kind: 'found',
      preview: { inviter_name: 'Dana', role: 'PARENT' },
    });
    if (checked.outcome.kind !== 'found') return;
    expect(JOIN.found.invited(checked.outcome.preview.inviter_name, 'PARENT')).toBe(
      'Dana invited you as a parent.',
    );
    // AUTH, with the invite held: "Your invite to Dana's family is saved." over "Create an account to join"
    const held = await loadInviteHold(sam.prefs);
    expect(held).toMatchObject({ state: 'held', kind: 'link', origin: 'code' });
    expect(JOIN.auth.saved(checked.outcome.preview.household_name)).toBe(
      'Your invite to Dana’s family is saved.',
    );

    // "Create an account to join", then Verify — and the email takes an hour (the project's own
    // sender sends two an hour). A 5-minute code would be dead by now; the claim is not.
    const link = await signUp(backend, sam, 'sam@example.test');
    later(58 * MIN);
    // Android killed the app meanwhile; the email opens it cold with the invite still on disk
    const cold = phone(backend, { prefs: sam.prefs, keychain: sessionStore() });
    const read = await openEmail(cold, link);
    const joined = await autoJoin(cold, read);
    expect(joined.outcome).toMatchObject({
      kind: 'joined',
      household_id: householdId,
      household_name: 'Dana’s family',
      role: 'PARENT',
    });

    // the first page in the household is the confirmation, never a silent landing on Today
    const uid = read.profile?.id ?? '';
    const note = await loadJoinNote(cold.prefs, uid);
    expect(note).toMatchObject({
      kind: 'joined',
      household_name: 'Dana’s family',
      seat_hours: null,
    });
    expect(JOIN.joined.title(note?.kind === 'joined' ? note.household_name : '')).toBe(
      'You joined Dana’s family',
    );
    const after = await cold.api.bootstrapState();
    expect(after.memberships[0]).toMatchObject({ household_id: householdId, role: 'PARENT' });
    // named from the address until they say otherwise; the confirmation asks, and Continue saves
    expect(after.profile?.display_name).toBe('sam');
    expect(await cold.api.setDisplayName('Sam')).toEqual({ ok: true });
    await clearJoinNote(cold.prefs, uid);
    const today = await cold.api.bootstrapState();
    expect(today.profile?.display_name).toBe('Sam');
    expect(await loadJoinNote(cold.prefs, uid)).toBeNull();
    // Dana's Family page lists Sam by the name he chose
    expect((await owner.api.listMembers(householdId)).map(m => m.display_name)).toEqual([
      'Dana',
      'Sam',
    ]);
  });

  it('signs in to an account with no household yet, and joins the same way', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    // Sam made an account last week and never finished setup
    const earlier = phone(backend);
    await openEmail(earlier, await signUp(backend, earlier, 'sam@example.test'));
    const code = await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 24);
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');

    const sam = phone(backend);
    await sheetCheck(sam, code.code);
    // "Sign in to join"
    await sam.auth.signInWithPassword('sam@example.test', PASSWORD);
    const read = await sam.api.bootstrapState();
    const { outcome } = await autoJoin(sam, read);
    expect(outcome).toMatchObject({ kind: 'joined', role: 'CAREGIVER' });
    const note = await loadJoinNote(sam.prefs, read.profile?.id ?? '');
    // a day's seat, said in a person's words
    expect(note).toMatchObject({ kind: 'joined', seat_hours: 24 });
    expect(JOIN.joined.seat(24)).toBe('Your access lasts one day from now, then ends by itself.');
    expect(JOIN.joined.role('CAREGIVER')).toMatch(/^You’re in as a caregiver\./);
  });

  it('a code typed after signing up (setup’s "Invited? Use a code instead") joins at once', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const sam = phone(backend);
    const read = await openEmail(sam, await signUp(backend, sam, 'sam@example.test'));
    expect(read.memberships).toEqual([]);
    const code = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    // `joinWithCode`: the account has been read, so the one join goes straight out
    const outcome = await redeemInvite(
      { accept: i => sam.api.acceptInvite(i), read: () => sam.api.bootstrapState() },
      { code: code.code },
      null,
    );
    expect(outcome).toMatchObject({ kind: 'joined', household_name: 'Dana’s family' });
  });
});

/* ================================================================== B. a link */

describe('B. an invite link, opened while signed out', () => {
  it('is held, checked for free so AUTH can name the household, and joined after the account', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'LINK');
    if (!made.ok || made.kind !== 'LINK') throw new Error('no link');
    // `openLink`: any of the link's forms
    const token = inviteTokenOf(made.url, {
      scheme: BRAND.urlScheme,
      host: BRAND.universalLinkHost,
    });
    expect(token).not.toBeNull();
    const sam = phone(backend);
    const held = holdOf({ token: token ?? '' }, Date.now(), { origin: 'link' }) as InviteHold;
    await saveInviteHold(sam.prefs, held);
    // `checkHeldLink`: the check costs nothing and changes nothing
    const checked = await sam.api.checkInvite({ token: token ?? '' });
    expect(checked).toMatchObject({
      ok: true,
      token,
      preview: { household_name: 'Dana’s family' },
    });
    later(DAY);
    const read = await openEmail(sam, await signUp(backend, sam, 'sam@example.test'));
    const { outcome } = await autoJoin(sam, read);
    expect(outcome).toMatchObject({ kind: 'joined', household_id: householdId });
  });

  it('goes out in a message by email, and joins with nothing typed: tapped, or the message pasted', async () => {
    // the owner, 2026-09-29: "Make sure the email invite also works, and bypasses the need to
    // enter 6 random digit"
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'LINK');
    if (!made.ok || made.kind !== 'LINK') throw new Error('no link');
    const ctx = { scheme: BRAND.urlScheme, host: BRAND.universalLinkHost };
    // Family: the message the share sheet hands to Mail, with the website's link in it
    const link = inviteShareLink(made.token, { host: ctx.host, expoGoBase: null });
    const message = JOIN.share.message('Dana', 'Dana’s family', BRAND.appDisplayName, link);
    expect(message).toContain(`https://${ctx.host}/app/invite/#`);
    // Sam's phone. Tapped, the link opens the app (`openLink`); pasted into Join a household, the
    // whole message gives the same token (`JoinCodeSheet` `paste`)
    const tapped = inviteTokenOf(link, ctx);
    const pasted = inviteTokenIn(message, ctx);
    expect(tapped).toBe(made.token);
    expect(pasted).toBe(made.token);
    const sam = phone(backend);
    const checked = await sam.api.checkInvite({ token: pasted ?? '' });
    expect(checked).toMatchObject({ ok: true, preview: { household_name: 'Dana’s family' } });
    await saveInviteHold(
      sam.prefs,
      holdOf({ token: pasted ?? '' }, Date.now(), { origin: 'link' }) as InviteHold,
    );
    // the account, made after the email arrived an hour later: joined on the held link, no code
    later(HOUR);
    const read = await openEmail(sam, await signUp(backend, sam, 'sam@example.test'));
    const { outcome } = await autoJoin(sam, read);
    expect(outcome).toMatchObject({ kind: 'joined', household_id: householdId, role: 'PARENT' });
  });

  it('in Expo Go goes out as Expo Go’s own link, which opens the app there and joins the same way', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'LINK');
    if (!made.ok || made.kind !== 'LINK') throw new Error('no link');
    const ctx = { scheme: BRAND.urlScheme, host: BRAND.universalLinkHost };
    const link = inviteShareLink(made.token, {
      host: ctx.host,
      expoGoBase: 'exp://192.168.1.20:8081/--/',
    });
    expect(link).toBe(`exp://192.168.1.20:8081/--/invite/${made.token}`);
    const sam = phone(backend);
    const read = await openEmail(sam, await signUp(backend, sam, 'sam@example.test'));
    expect(read.memberships).toEqual([]);
    // signed in with no household: the pasted link joins straight away (`joinWithLink`)
    const outcome = await redeemInvite(
      { accept: i => sam.api.acceptInvite(i), read: () => sam.api.bootstrapState() },
      { token: inviteTokenOf(link, ctx) ?? '' },
      null,
    );
    expect(outcome).toMatchObject({ kind: 'joined', household_id: householdId });
  });

  it('a link that no longer works says so on AUTH, before an account is made for it', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'LINK');
    if (!made.ok || made.kind !== 'LINK') throw new Error('no link');
    const token = made.url.split('/invite/')[1] ?? '';
    // somebody else used it first
    const first = phone(backend);
    await openEmail(first, await signUp(backend, first, 'first@example.test'));
    expect((await first.api.acceptInvite({ token })).ok).toBe(true);
    const sam = phone(backend);
    const r = await sam.api.checkInvite({ token });
    expect(r).toMatchObject({ ok: false, error: 'invalid_invite' });
    const lapse = lapseOf(
      holdOf({ token }, Date.now(), { origin: 'link' }) as InviteHold,
      'refused',
      Date.now(),
    );
    expect(lapse.state === 'lapsed' ? inviteLapseSentence(lapse.lapse) : '').toBe(
      'This invite no longer works. Ask the person who invited you for a new code.',
    );
  });
});

/* ================================================================== C. what goes wrong */

describe('C. every way it can go wrong says what happened and what to do next', () => {
  it('a mistyped code: said on the sheet, nothing held, and the right code still works', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
    const sam = phone(backend);
    const typo = made.code === 'ZZZZZZ' ? 'XXXXXX' : 'ZZZZZZ';
    const wrong = await sheetCheck(sam, typo);
    expect(wrong.said).toBe(INVITE_FAILED);
    expect(INVITE_FAILED).toBe(
      'That code did not work. Check the 6 letters, or ask for a new code.',
    );
    expect(await loadInviteHold(sam.prefs)).toBeNull();
    expect((await sheetCheck(sam, made.code)).outcome.kind).toBe('found');
  });

  it('an expired or used code: the same words, since the server never says which', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
    // past its five minutes (0144)
    later(6 * MIN);
    expect((await sheetCheck(phone(backend), made.code)).said).toBe(INVITE_FAILED);
  });

  it('a caregiver’s invite into a household with no Plus: said at the check, before an account', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    later(15 * DAY); // the preview has ended, nothing bought
    const made = await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
    const nanny = phone(backend);
    const r = await sheetCheck(nanny, made.code);
    expect(r.said).toBe(
      'A caregiver’s seat comes with the Plus plan, and Dana’s family doesn’t have it on right now. Ask the person who invited you.',
    );
    expect(await loadInviteHold(nanny.prefs)).toBeNull();
  });

  it('no signal at the check: said, and the digits stay for the next try', async () => {
    const backend = server();
    const sam = phone(backend);
    backend.online = false;
    await expect(sam.api.checkInvite({ code: 'WDJBMA' })).rejects.toBeInstanceOf(AuthFailure);
  });

  it('no signal at the join: kept, said with the household’s name, and joined once back online', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
    const sam = phone(backend);
    await sheetCheck(sam, made.code);
    const read = await openEmail(sam, await signUp(backend, sam, 'sam@example.test'));
    backend.online = false;
    const offline = await autoJoin(sam, read);
    expect(offline.outcome).toEqual({ kind: 'kept', problem: 'offline' });
    expect(joinProblemSentence('offline', 'Dana’s family', null)).toBe(
      'No connection. We’ll add you to Dana’s family as soon as you’re back online.',
    );
    // still held: the reconnect sends it again
    expect(await loadInviteHold(sam.prefs)).toMatchObject({ state: 'held' });
    backend.online = true;
    expect((await autoJoin(sam, read)).outcome).toMatchObject({ kind: 'joined' });
  });

  it('a server with no check yet (a project without 0139): the code is held as typed, and said honestly', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
    const base = phone(backend);
    const older: Phone = {
      ...base,
      api: {
        ...base.api,
        checkInvite: async () => ({ ok: false, status: 0, error: 'unavailable' }),
      } as AccountsApi,
    };
    const r = await sheetCheck(older, made.code);
    expect(r.outcome).toEqual({ kind: 'unchecked' });
    expect(r.said).toBe('Your code is saved');
    expect(JOIN.found.unchecked).toMatch(/We check the code and add you/);
    expect(await loadInviteHold(older.prefs)).toMatchObject({ state: 'held', kind: 'code' });
    // quick enough, it still joins after the account
    const read = await openEmail(base, await signUp(backend, base, 'sam@example.test'));
    expect((await autoJoin(base, read)).outcome).toMatchObject({ kind: 'joined' });
  });

  it('an unchecked code past its 5 minutes is never sent: the join page asks for a new one', async () => {
    const backend = server();
    const sam = phone(backend);
    await saveInviteHold(sam.prefs, holdOf({ code: 'WDJBMA' }, Date.now()) as InviteHold);
    const link = await signUp(backend, sam, 'sam@example.test');
    later(20 * MIN);
    const read = await openEmail(sam, link);
    const { outcome, hold } = await autoJoin(sam, read);
    expect(outcome).toBeNull();
    expect(hold).toMatchObject({ state: 'lapsed', lapse: { reason: 'expired', kind: 'code' } });
    if (hold?.state === 'lapsed')
      expect(inviteLapseSentence(hold.lapse)).toBe(
        'That code has expired. Codes last 5 minutes, so ask the person who invited you for a new one.',
      );
  });

  it('their own code, on their own second phone: said as theirs', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const made = await owner.api.createInvite(householdId, 'PARENT', 'CODE');
    if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
    const outcome = await redeemInvite(
      { accept: i => owner.api.acceptInvite(i), read: () => owner.api.bootstrapState() },
      { code: made.code },
      null,
    );
    // Dana is in her household, so the one join says so rather than "your own invite" (0139's
    // order: own_invite comes first on the server)
    expect(outcome).toEqual({ kind: 'refused', reason: 'own' });
  });

  it('a sitter whose evening ended joins again from Ended with a new code', async () => {
    const backend = server();
    const { owner, householdId } = await household(backend, 'Dana', 'dana@example.test');
    const first = await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6);
    if (!first.ok || first.kind !== 'CODE') throw new Error('no code');
    const mia = phone(backend);
    await openEmail(mia, await signUp(backend, mia, 'mia@example.test'));
    expect((await mia.api.acceptInvite({ code: first.code, display_name: 'Mia' })).ok).toBe(true);
    later(7 * HOUR);
    expect((await mia.api.bootstrapState()).memberships).toEqual([]);
    const again = await owner.api.createInvite(householdId, 'CAREGIVER', 'CODE', 6);
    if (!again.ok || again.kind !== 'CODE') throw new Error('no code');
    const outcome = await redeemInvite(
      { accept: i => mia.api.acceptInvite(i), read: () => mia.api.bootstrapState() },
      { code: again.code },
      'Mia',
    );
    expect(outcome).toMatchObject({ kind: 'joined', role: 'CAREGIVER' });
  });
});

/* ================================================================== D. two households */

describe('D. a caregiver for two families: one account, several families (0153)', () => {
  it('a code held on the first screen by somebody already in a family joins the second, and both are hers', async () => {
    const backend = server();
    const dana = await household(backend, 'Dana', 'dana@example.test');
    const lee = await household(backend, 'Lee', 'lee@example.test');
    // Nana is Dana's caregiver already
    const nanaCode = await dana.owner.api.createInvite(dana.householdId, 'CAREGIVER', 'CODE');
    if (!nanaCode.ok || nanaCode.kind !== 'CODE') throw new Error('no code');
    const nana = phone(backend);
    await openEmail(nana, await signUp(backend, nana, 'nana@example.test'));
    expect((await nana.api.acceptInvite({ code: nanaCode.code, display_name: 'Nana' })).ok).toBe(
      true,
    );
    await nana.auth.signOut('local');

    // Lee's family asks her too: she types their code on the first screen, then signs in
    const leeCode = await lee.owner.api.createInvite(lee.householdId, 'CAREGIVER', 'CODE');
    if (!leeCode.ok || leeCode.kind !== 'CODE') throw new Error('no code');
    const checked = await sheetCheck(nana, leeCode.code);
    expect(checked.said).toBe('This code is for Lee’s family');
    await nana.auth.signInWithPassword('nana@example.test', PASSWORD);
    const before = await nana.api.bootstrapState();
    expect(canJoinAnother(before)).toBe(true);
    // the `ready` effect joins with what it holds, rather than letting it go
    const held = await loadInviteHold(nana.prefs);
    expect(held?.state).toBe('held');
    if (held?.state !== 'held') throw new Error('nothing held');
    const outcome = await redeemInvite(
      { accept: i => nana.api.acceptInvite(i), read: () => nana.api.bootstrapState() },
      held.invite,
      'Nana',
    );
    expect(outcome).toMatchObject({ kind: 'joined', household_name: 'Lee’s family' });
    const after = await nana.api.bootstrapState();
    expect(after.memberships.map(m => m.household_name).sort()).toEqual([
      'Dana’s family',
      'Lee’s family',
    ]);
    // the family joined comes on screen with its own babies and its own plan; Dana's is a tap away
    const onLee = focusAccount(after, lee.householdId);
    expect(onLee.memberships[0]?.household_name).toBe('Lee’s family');
    expect(onLee.children.every(c => c.household_id === lee.householdId)).toBe(true);
    expect(onLee.entitlement).toEqual(after.plans?.[lee.householdId] ?? null);
    expect(focusAccount(after, dana.householdId).memberships[0]?.household_name).toBe(
      'Dana’s family',
    );
  });

  it('a parent of one family asked to be a parent in another is refused before a row is written', async () => {
    const backend = server();
    const dana = await household(backend, 'Dana', 'dana@example.test');
    const lee = await household(backend, 'Lee', 'lee@example.test');
    const leeAsParent = await lee.owner.api.createInvite(lee.householdId, 'PARENT', 'CODE');
    if (!leeAsParent.ok || leeAsParent.kind !== 'CODE') throw new Error('no code');
    const outcome = await redeemInvite(
      {
        accept: i => dana.owner.api.acceptInvite(i),
        read: () => dana.owner.api.bootstrapState(),
      },
      { code: leeAsParent.code },
      'Dana',
    );
    expect(outcome).toEqual({ kind: 'kept', problem: 'admin_elsewhere' });
    expect(JOIN.refusal.parentElsewhere).toMatch(/as a caregiver instead/);
    // one membership, still: nothing stranded, nothing mixed
    expect((await dana.owner.api.bootstrapState()).memberships.map(m => m.household_name)).toEqual([
      'Dana’s family',
    ]);
    // as a caregiver, the same person goes in, and keeps their own family
    const leeAsSitter = await lee.owner.api.createInvite(lee.householdId, 'CAREGIVER', 'CODE');
    if (!leeAsSitter.ok || leeAsSitter.kind !== 'CODE') throw new Error('no code');
    expect(await dana.owner.api.acceptInvite({ code: leeAsSitter.code })).toMatchObject({
      ok: true,
      household_name: 'Lee’s family',
      role: 'CAREGIVER' as Role,
    });
    expect((await dana.owner.api.bootstrapState()).memberships).toHaveLength(2);
  });
});
