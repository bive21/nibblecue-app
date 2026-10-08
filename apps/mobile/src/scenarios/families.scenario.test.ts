/**
 * ONE PHONE, SEVERAL FAMILIES, AS PEOPLE LIVE IT (migration 0153; the owner, 2026-10-08: *"make sure
 * everything works first especially with the join the household build, check every logic, access
 * that caretaker has … run some test with real life scenarios that may happen"*).
 *
 * Each step is a call the app makes, in the order it makes it, against the in-app test backend
 * (`auth/providers/mock.ts`, which follows 0153), with the phone's own pure pieces deciding what
 * happens: the sheet's mode (`sheetModeOf`), the one join (`redeemInvite`), the focus that puts the
 * family on screen first (`focusAccount`), the switcher's door (`hasSeveralHouseholds`), and what an
 * account read means for the family the phone holds (`mirrorVerdict`). `AuthContext` itself is not
 * mounted here: where it decides inline, the test says which lines it repeats. The server's side of
 * the same rules, on a real Postgres, is `packages/db/src/integration/families.scenario.test.ts`.
 *
 *   A. a mother with her own family helps another family as a caregiver
 *   B. everything that can go wrong at the Join sheet, signed in with a family already
 *   C. a sitter in five families, and a sixth
 *   D. seats that end: a temporary seat running out, a removal while the family is off screen
 *   F. leaving a family yourself, as a caregiver, a viewer or a parent (2026-10-08), and a second
 *      join whose switch did not land
 */
import {
  aloneIn,
  canJoinAnother,
  ENDED,
  endedReading,
  focusAccount,
  hasSeveralHouseholds,
  householdOnScreen,
  MAX_HOUSEHOLDS,
  ownFamilyVerdict,
  standingWithNoHousehold,
  zonedToUtc,
} from '@nibblecue/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdOf, loadInviteHold, saveInviteHold } from '../auth/held-invite';
import { checkOutcomeOf, redeemInvite, sheetModeOf, type RedeemOutcome } from '../auth/join';
import { canLeaveSeat, leaveSeat, mustHandOnFirst, rememberLeaving } from '../auth/leave';
import { joinedOffScreenOf, joinedOffScreenSentence } from '../household/switchOutcome';
import { LEAVE } from '../screens/more/leaveCopy';
import { mirrorVerdict } from '../auth/mirror';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import type { AccountState, AccountsApi, SessionStore } from '../auth/providers/types';
import type { Session } from '../auth/session';
import { setIdSource } from '../data/ids';
import { memoryStore, type KeyValueStore } from '../prefs';
import { joinProblemSentence } from '../screens/auth/copy';
import { JOIN } from '../screens/auth/joinCopy';
import { seededIds } from '../testing/fixtures';

const TZ = 'America/Chicago';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Thursday 2026-10-08, 6:00 PM in Chicago: the sitter's evening. */
const EVENING = zonedToUtc(TZ, 2026, 10, 8, 18, 0);
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

const server = (): MockBackend =>
  new MockBackend({ now: () => Date.now(), newId: seededIds('fafafafa') });

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

function phone(backend: MockBackend): Phone {
  const auth = new MockAuthProvider(backend, sessionStore());
  return {
    prefs: memoryStore(),
    auth,
    api: new MockAccountsApi(backend, auth) as AccountsApi,
  };
}

/** An account, verified, with no family yet. */
async function person(backend: MockBackend, email: string): Promise<Phone> {
  const p = phone(backend);
  await p.auth.signUpWithPassword(email, PASSWORD);
  await p.auth.handleAuthLink(backend.lastLink ?? '');
  return p;
}

/** A family made through setup's last button (14 days of Plus come with it). */
async function family(backend: MockBackend, name: string, email: string, baby = 'Ada') {
  const p = await person(backend, email);
  const made = await p.api.createHousehold({
    client_op_id: crypto.randomUUID(),
    profile: { display_name: name, locale: 'en-US', time_zone: TZ },
    household: { name: `${name}’s family`, home_time_zone: TZ },
    child: { name: baby, birth_date: '2026-08-20' },
    modules: ['bottle', 'diaper', 'sleep'],
  });
  if (!made.ok) throw new Error('no household');
  return { phone: p, id: made.household_id };
}

async function code(
  owner: Phone,
  householdId: string,
  role: 'PARENT' | 'CAREGIVER' | 'VIEW_ONLY',
  seatHours?: number,
): Promise<string> {
  const made = await owner.api.createInvite(householdId, role, 'CODE', seatHours);
  if (!made.ok || made.kind !== 'CODE') throw new Error(`no code: ${JSON.stringify(made)}`);
  return made.code;
}

/**
 * THE JOIN SHEET, SIGNED IN WITH A FAMILY ALREADY: `JoinCodeSheet` `join` → `joinWithCode` →
 * `joinWithInvite` → `redeemInvite`, with the deps `AuthContext` hands it (the accept, and a fresh
 * account read). The sheet only opens in `join` mode below the limit (`sheetModeOf`).
 */
async function sheetJoin(p: Phone, ask: { code: string } | { token: string }) {
  const before = await p.api.bootstrapState();
  expect(sheetModeOf('ready', canJoinAnother(before))).toBe('join');
  return redeemInvite(
    {
      accept: input => p.api.acceptInvite(input),
      read: () => p.api.bootstrapState().catch(() => null),
    },
    ask,
    before.profile?.display_name ?? null,
  );
}

const names = (a: AccountState) => a.memberships.map(m => m.household_name).sort();

/* ================================================================== A */

describe('A. Dana has her own family and helps Lee’s as a caregiver', () => {
  it('joins by code from Family’s Join sheet: in, Lee’s family on screen, her own still listed, the switcher appears', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test', 'Ada');
    const lee = await family(backend, 'Lee', 'lee@example.test', 'Bo');
    const before = await dana.phone.api.bootstrapState();
    // one family: no switcher, exactly as before 0153
    expect(hasSeveralHouseholds(before)).toBe(false);

    const out = await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    expect(out).toMatchObject({
      kind: 'joined',
      household_id: lee.id,
      household_name: 'Lee’s family',
      role: 'CAREGIVER',
    });

    const after = await dana.phone.api.bootstrapState();
    expect(names(after)).toEqual(['Dana’s family', 'Lee’s family']);
    expect(hasSeveralHouseholds(after)).toBe(true);
    // `settleJoin`: a second family comes on screen — focused, Lee's babies only, Lee's plan
    const onLee = focusAccount(after, lee.id);
    expect(onLee.memberships[0]).toMatchObject({ household_id: lee.id, role: 'CAREGIVER' });
    expect(onLee.children.map(c => c.name)).toEqual(['Bo']);
    expect(onLee.entitlement).toEqual(after.plans?.[lee.id] ?? null);
    // her own family is a tap away, and she is still its owner there
    const onDana = focusAccount(after, dana.id);
    expect(onDana.memberships[0]).toMatchObject({ household_id: dana.id, role: 'OWNER' });
    expect(onDana.children.map(c => c.name)).toEqual(['Ada']);
    // Lee's roster lists her as a caregiver; her own lists her as the owner
    expect(
      (await lee.phone.api.listMembers(lee.id)).find(m => m.display_name === 'Dana')?.role,
    ).toBe('CAREGIVER');
  });

  it('joins by an invite link opened while signed in, the same way', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const link = await lee.phone.api.createInvite(lee.id, 'CAREGIVER', 'LINK');
    if (!link.ok || link.kind !== 'LINK') throw new Error('no link');
    const token = link.url.split('/invite/')[1] ?? '';
    const out = await sheetJoin(dana.phone, { token });
    expect(out).toMatchObject({ kind: 'joined', household_id: lee.id, role: 'CAREGIVER' });
    expect(names(await dana.phone.api.bootstrapState())).toEqual(['Dana’s family', 'Lee’s family']);
  });

  it('opens Lee’s link signed out, signs in, and the held invite joins the second family', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const link = await lee.phone.api.createInvite(lee.id, 'CAREGIVER', 'LINK');
    if (!link.ok || link.kind !== 'LINK') throw new Error('no link');
    const token = link.url.split('/invite/')[1] ?? '';
    await dana.phone.auth.signOut('local');

    // the link opens AUTH: checked for free, held, named
    const checked = checkOutcomeOf(await dana.phone.api.checkInvite({ token }));
    expect(checked).toMatchObject({ kind: 'found', preview: { household_name: 'Lee’s family' } });
    if (checked.kind !== 'found') return;
    const hold = holdOf({ token: checked.token }, Date.now(), {
      origin: 'link',
      preview: checked.preview,
    });
    if (hold) await saveInviteHold(dana.phone.prefs, hold);

    await dana.phone.auth.signInWithPassword('dana@example.test', PASSWORD);
    const read = await dana.phone.api.bootstrapState();
    // the `ready` effect: in a family, below the limit, so what is held is joined rather than let go
    expect(canJoinAnother(read)).toBe(true);
    const held = await loadInviteHold(dana.phone.prefs);
    if (held?.state !== 'held') throw new Error('nothing held');
    const out = await redeemInvite(
      {
        accept: i => dana.phone.api.acceptInvite(i),
        read: () => dana.phone.api.bootstrapState(),
      },
      held.invite,
      'Dana',
    );
    expect(out).toMatchObject({ kind: 'joined', household_id: lee.id });
    expect(names(await dana.phone.api.bootstrapState())).toEqual(['Dana’s family', 'Lee’s family']);
  });

  it('asked to be a PARENT in Lee’s family: refused with words that say why, nothing written', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const out = await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'PARENT') });
    expect(out).toEqual({ kind: 'kept', problem: 'admin_elsewhere' });
    expect(joinProblemSentence('admin_elsewhere', 'Lee’s family', 'PARENT')).toBe(
      'You’re already a parent in your own family, and an account can be a parent in one family only. Ask them to invite you as a caregiver instead.',
    );
    expect(names(await dana.phone.api.bootstrapState())).toEqual(['Dana’s family']);

    // ALONE IN HER OWN FAMILY (set up by mistake): the sheet reads her roster and offers the way out
    const roster = await dana.phone.api.listMembers(dana.id);
    expect(aloneIn(roster)).toBe(true);
    expect(JOIN.inHousehold.leaveFirst('Dana’s family')).toBe('Leave Dana’s family first');

    // with her partner in it, she is not alone: no "leave first", only the caregiver advice
    const sam = await person(backend, 'sam@example.test');
    expect(
      (await sam.api.acceptInvite({ code: await code(dana.phone, dana.id, 'PARENT') })).ok,
    ).toBe(true);
    expect(aloneIn(await dana.phone.api.listMembers(dana.id))).toBe(false);
  });
});

/* ================================================================== B */

describe('B. the Join sheet, signed in with a family already: what goes wrong', () => {
  it('a mistyped code is refused, with the tries left — never read as "you joined" the family on screen', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const out: RedeemOutcome = await sheetJoin(dana.phone, { code: 'QWZXQW' });
    // Before the fix the account read after the refusal showed Dana's own family, and the answer
    // came back `joined` Dana's family: the sheet closed and "You joined Dana's family" opened.
    expect(out).toEqual({ kind: 'refused', reason: 'refused', attempts_left: 4 });
  });

  it('a used code is refused the same way, and an expired one', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const used = await code(lee.phone, lee.id, 'CAREGIVER');
    const nana = await person(backend, 'nana@example.test');
    expect((await nana.api.acceptInvite({ code: used })).ok).toBe(true);
    expect(await sheetJoin(dana.phone, { code: used })).toMatchObject({ kind: 'refused' });

    const stale = await code(lee.phone, lee.id, 'CAREGIVER');
    later(5 * MIN + 1_000);
    expect(await sheetJoin(dana.phone, { code: stale })).toMatchObject({ kind: 'refused' });
    expect(names(await dana.phone.api.bootstrapState())).toEqual(['Dana’s family']);
  });

  it('a code for a family she is already in does not join twice, and never names the wrong family', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    expect(
      await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') }),
    ).toMatchObject({ kind: 'joined', household_id: lee.id });
    // Lee sends a second code by mistake, and Dana types it
    const again = await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    expect(again).not.toMatchObject({ kind: 'joined', household_id: dana.id });
    expect(again.kind).not.toBe('joined');
    const after = await dana.phone.api.bootstrapState();
    expect(after.memberships.filter(m => m.household_id === lee.id)).toHaveLength(1);
  });

  it('five tries in ten minutes, then wait; the right code works once the window turns', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    for (let i = 0; i < 5; i += 1)
      expect((await sheetJoin(dana.phone, { code: 'QWZXQW' })).kind).toBe('refused');
    const right = await code(lee.phone, lee.id, 'CAREGIVER');
    const sixth = await sheetJoin(dana.phone, { code: right });
    expect(sixth).toEqual({ kind: 'kept', problem: 'rate_limited' });
    expect(joinProblemSentence('rate_limited', '', null)).toBe(
      'Too many tries. Wait ten minutes, then try again.',
    );
    later(10 * MIN);
    // the first code lived five minutes: Lee makes another
    const fresh = await code(lee.phone, lee.id, 'CAREGIVER');
    expect(await sheetJoin(dana.phone, { code: fresh })).toMatchObject({ kind: 'joined' });
  });

  it('codes paused for everybody: said, and a link still joins', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const window = 10 * MIN;
    backend.state.rate_limits['*:invite_guess'] = {
      window_start: Math.floor(Date.now() / window) * window,
      count: 1000,
    };
    const out = await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    expect(out).toEqual({ kind: 'kept', problem: 'codes_paused' });
    const link = await lee.phone.api.createInvite(lee.id, 'CAREGIVER', 'LINK');
    if (!link.ok || link.kind !== 'LINK') throw new Error('no link');
    expect(
      await sheetJoin(dana.phone, { token: link.url.split('/invite/')[1] ?? '' }),
    ).toMatchObject({ kind: 'joined', household_id: lee.id });
  });

  it('a caregiver’s seat in a family whose Plus has ended: needs_plus, nothing spent, works once Plus is back', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const c = await code(lee.phone, lee.id, 'CAREGIVER');
    // Lee's 14 days of Plus are over (the code was made during them)
    backend.state.entitlements = backend.state.entitlements.filter(e => e.household_id !== lee.id);
    expect(await sheetJoin(dana.phone, { code: c })).toEqual({
      kind: 'kept',
      problem: 'needs_plus',
    });
    expect(names(await dana.phone.api.bootstrapState())).toEqual(['Dana’s family']);
    // the invite is still live: Lee subscribes, and the same code goes through
    backend.state.entitlements.push({
      user_id: (await lee.phone.api.bootstrapState()).profile?.id ?? '',
      household_id: lee.id,
      source: 'store',
      status: 'ACTIVE',
      current_period_end: new Date(Date.now() + 30 * DAY).toISOString(),
    });
    expect(await sheetJoin(dana.phone, { code: c })).toMatchObject({ kind: 'joined' });
  });
});

/* ================================================================== C */

describe('C. Nana sits for five families', () => {
  it('joins five, the sheet says so at five, and a sixth is refused by the server too', async () => {
    const backend = server();
    const nana = await person(backend, 'nana@example.test');
    const fams = [];
    for (const n of ['Ana', 'Ben', 'Cy', 'Di', 'Ed', 'Flo'])
      fams.push(await family(backend, n, `${n.toLowerCase()}@example.test`));
    // the first is the auto-join of an account with no family; the rest from the Join sheet
    for (const f of fams.slice(0, 5)) {
      const out = await redeemInvite(
        { accept: i => nana.api.acceptInvite(i), read: () => nana.api.bootstrapState() },
        { code: await code(f.phone, f.id, 'CAREGIVER') },
        'Nana',
      );
      expect(out).toMatchObject({ kind: 'joined', household_id: f.id });
    }
    const five = await nana.api.bootstrapState();
    expect(five.memberships).toHaveLength(MAX_HOUSEHOLDS);
    expect(canJoinAnother(five)).toBe(false);
    expect(sheetModeOf('ready', canJoinAnother(five))).toBe('in_household');

    // a code that reached her anyway (a held link) meets the server's own limit — a while later, as
    // five joins have spent the ten minutes' five tries
    later(10 * MIN);
    const sixth = fams[5];
    if (sixth === undefined) throw new Error('no sixth');
    const out = await redeemInvite(
      { accept: i => nana.api.acceptInvite(i), read: () => nana.api.bootstrapState() },
      { code: await code(sixth.phone, sixth.id, 'CAREGIVER') },
      'Nana',
    );
    expect(out).toEqual({ kind: 'kept', problem: 'household_limit' });
    expect(joinProblemSentence('household_limit', '', null)).toMatch(/^You’re in 5 families/);

    // one family removes her: the slot is free again
    const first = fams[0];
    if (first === undefined) throw new Error('no first');
    const nanaId = five.profile?.id ?? '';
    expect(await first.phone.api.removeMember(first.id, nanaId)).toEqual({ ok: true });
    later(MIN);
    expect(
      await redeemInvite(
        { accept: i => nana.api.acceptInvite(i), read: () => nana.api.bootstrapState() },
        { code: await code(sixth.phone, sixth.id, 'CAREGIVER') },
        'Nana',
      ),
    ).toMatchObject({ kind: 'joined', household_id: sixth.id });
  });
});

/* ================================================================== D */

describe('D. seats that end', () => {
  it('a six-hour seat runs out: that family leaves the phone, her own comes on screen, nobody else moves', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test', 'Ada');
    const lee = await family(backend, 'Lee', 'lee@example.test', 'Bo');
    expect(
      await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER', 6) }),
    ).toMatchObject({ kind: 'joined', household_id: lee.id });
    const during = await dana.phone.api.bootstrapState();
    const seat = (await lee.phone.api.listMembers(lee.id)).find(m => m.display_name === 'Dana');
    expect(seat?.expires_at).toBe(new Date(EVENING + 6 * HOUR).toISOString());
    // on screen: Lee's (the join brought it there)
    expect(
      mirrorVerdict({ trigger: 'account_read', userId: uid(during), mirror: lee.id, read: during }),
    ).toBe('adopt');

    later(6 * HOUR + MIN);
    const after = await dana.phone.api.bootstrapState();
    expect(names(after)).toEqual(['Dana’s family']);
    // the read no longer lists the family on screen: the household teardown for Lee's alone…
    expect(
      mirrorVerdict({ trigger: 'account_read', userId: uid(after), mirror: lee.id, read: after }),
    ).toBe('end_household');
    // …and the family still listed comes on screen, with its own baby; the switcher goes
    expect(householdOnScreen(after.memberships, lee.id)).toBe(dana.id);
    expect(focusAccount(after, lee.id).children.map(c => c.name)).toEqual(['Ada']);
    expect(hasSeveralHouseholds(after)).toBe(false);
    // a pull of Lee's refused meanwhile reaches the same verdict, never a sign-out
    expect(
      mirrorVerdict({
        trigger: 'pull_refused',
        userId: uid(after),
        mirror: lee.id,
        refused: lee.id,
        session: 'good',
        read: after,
      }),
    ).toBe('end_household');
    // Lee's roster: Dana is gone; Lee is untouched
    expect((await lee.phone.api.listMembers(lee.id)).map(m => m.display_name)).toEqual(['Lee']);
  });

  it('removed from Lee’s while her own family is on screen: nothing is torn down, the switcher goes', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    const both = await dana.phone.api.bootstrapState();
    expect(hasSeveralHouseholds(both)).toBe(true);
    expect(await lee.phone.api.removeMember(lee.id, uid(both))).toEqual({ ok: true });
    const after = await dana.phone.api.bootstrapState();
    // the family on screen is Dana's own, still listed: adopt, nothing deleted
    expect(
      mirrorVerdict({ trigger: 'account_read', userId: uid(after), mirror: dana.id, read: after }),
    ).toBe('adopt');
    expect(names(after)).toEqual(['Dana’s family']);
    expect(hasSeveralHouseholds(after)).toBe(false);
    // and her own family's role is untouched
    expect(after.memberships[0]).toMatchObject({ household_id: dana.id, role: 'OWNER' });
  });
});

/* ================================================================== E */

describe('E. one family of your own, whatever Family’s buttons are pressed (0155)', () => {
  it('Lee cannot make Dana, a caregiver at hers who owns her own family, a parent or the owner', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    const danaId = uid(await dana.phone.api.bootstrapState());
    expect(await lee.phone.api.setRole(lee.id, danaId, 'PARENT')).toMatchObject({
      ok: false,
      error: 'admin_elsewhere',
    });
    expect(await lee.phone.api.transferOwnership(lee.id, danaId)).toMatchObject({
      ok: false,
      error: 'admin_elsewhere',
    });
    // a viewer instead is fine, and so is a caregiver with no family of her own made a parent
    expect(await lee.phone.api.setRole(lee.id, danaId, 'VIEW_ONLY')).toEqual({ ok: true });
    const nana = await person(backend, 'nana@example.test');
    expect(
      (await nana.api.acceptInvite({ code: await code(lee.phone, lee.id, 'CAREGIVER') })).ok,
    ).toBe(true);
    const nanaId = uid(await nana.api.bootstrapState());
    expect(await lee.phone.api.setRole(lee.id, nanaId, 'PARENT')).toEqual({ ok: true });
  });
});

const uid = (a: AccountState): string => a.profile?.id ?? '';

/* ================================================================== F */

/**
 * FAMILY'S "LEAVE <FAMILY>" (`LeaveSeatSection` → `AuthContext.leaveSeat` → `leaveSeat`), with the
 * deps `AuthContext` hands it: nothing owed, online, and `removeMember(family, self)`. After it,
 * `refreshAccount`'s read decides what leaves the phone (`mirrorVerdict`), and the family still
 * listed comes on screen (`householdOnScreen`, `focusAccount`), as a removal's does.
 */
const leaveFrom = (p: Phone, householdId: string, read: AccountState) =>
  leaveSeat({
    role: focusAccount(read, householdId).memberships[0]?.role,
    online: async () => true,
    // not on for the family (who's on): the step a switch takes, and asks about, is clear
    duty: async () => ({ kind: 'clear' }),
    flush: async () => undefined,
    owed: async () => 0,
    leave: () => p.api.removeMember(householdId, uid(read)),
  });

describe('F. leaving a family yourself', () => {
  it('Dana, a caregiver at Lee’s, leaves it from Family: Lee’s leaves her phone, her own comes on screen', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test', 'Ada');
    const lee = await family(backend, 'Lee', 'lee@example.test', 'Bo');
    await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    const both = await dana.phone.api.bootstrapState();
    // on screen: Lee's, where her seat is a caregiver's, so Family draws "Leave Lee’s family"
    const onLee = focusAccount(both, lee.id);
    expect(canLeaveSeat(onLee.memberships[0]?.role)).toBe(true);
    expect(LEAVE.seat.row(onLee.memberships[0]?.household_name ?? '')).toBe('Leave Lee’s family');
    // and never at her own, where she is the owner
    expect(canLeaveSeat(focusAccount(both, dana.id).memberships[0]?.role)).toBe(false);

    expect(await leaveFrom(dana.phone, lee.id, both)).toEqual({ kind: 'left' });
    const after = await dana.phone.api.bootstrapState();
    // the read no longer lists the family on screen: the household teardown for Lee's alone…
    expect(
      mirrorVerdict({ trigger: 'account_read', userId: uid(after), mirror: lee.id, read: after }),
    ).toBe('end_household');
    // …and her own family comes on screen, untouched; the switcher goes
    expect(householdOnScreen(after.memberships, lee.id)).toBe(dana.id);
    expect(focusAccount(after, lee.id).memberships[0]).toMatchObject({
      household_id: dana.id,
      role: 'OWNER',
    });
    expect(hasSeveralHouseholds(after)).toBe(false);
    // Lee's family goes on as it was, without her
    expect((await lee.phone.api.listMembers(lee.id)).map(m => m.display_name)).toEqual(['Lee']);
  });

  it('Nana in five families leaves one, as the limit’s sentence says, and can join another', async () => {
    const backend = server();
    const nana = await person(backend, 'nana@example.test');
    const fams = [];
    for (const n of ['Ana', 'Ben', 'Cy', 'Di', 'Ed', 'Flo'])
      fams.push(await family(backend, n, `${n.toLowerCase()}@example.test`));
    for (const [i, f] of fams.slice(0, 5).entries()) {
      const role = i === 2 ? 'VIEW_ONLY' : 'CAREGIVER';
      expect(
        await redeemInvite(
          { accept: a => nana.api.acceptInvite(a), read: () => nana.api.bootstrapState() },
          { code: await code(f.phone, f.id, role) },
          'Nana',
        ),
      ).toMatchObject({ kind: 'joined', household_id: f.id });
    }
    const five = await nana.api.bootstrapState();
    expect(canJoinAnother(five)).toBe(false);
    expect(JOIN.refusal.householdLimit).toMatch(/Leave one first\.$/);

    // she leaves Cy's, where she only views, from Family while it is on screen
    const cy = fams[2];
    const flo = fams[5];
    if (cy === undefined || flo === undefined) throw new Error('no families');
    expect(focusAccount(five, cy.id).memberships[0]?.role).toBe('VIEW_ONLY');
    expect(await leaveFrom(nana, cy.id, five)).toEqual({ kind: 'left' });
    const four = await nana.api.bootstrapState();
    expect(four.memberships).toHaveLength(MAX_HOUSEHOLDS - 1);
    expect(canJoinAnother(four)).toBe(true);
    later(10 * MIN);
    expect(
      await redeemInvite(
        { accept: a => nana.api.acceptInvite(a), read: () => nana.api.bootstrapState() },
        { code: await code(flo.phone, flo.id, 'CAREGIVER') },
        'Nana',
      ),
    ).toMatchObject({ kind: 'joined', household_id: flo.id });
  });

  it('a parent leaves too (2026-10-08): their only family goes, Ended says they left, their own may start', async () => {
    const backend = server();
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const sam = await person(backend, 'sam@example.test');
    expect((await sam.api.acceptInvite({ code: await code(lee.phone, lee.id, 'PARENT') })).ok).toBe(
      true,
    );
    const read = await sam.api.bootstrapState();
    expect(canLeaveSeat(read.memberships[0]?.role)).toBe(true);
    // Lee, the owner, is shown the way to hand it on instead, and the leave refuses to try
    const leeRead = await lee.phone.api.bootstrapState();
    expect(mustHandOnFirst(leeRead.memberships[0]?.role)).toBe(true);
    expect(await leaveFrom(lee.phone, lee.id, leeRead)).toEqual({ kind: 'not_allowed' });

    expect(await leaveFrom(sam, lee.id, read)).toEqual({ kind: 'left' });
    // the device marks the family it showed as left, before the read that empties the account
    const prefs = memoryStore();
    const last = await rememberLeaving(prefs, `last_household:${uid(read)}`, {
      id: lee.id,
      name: read.memberships[0]?.household_name ?? '',
    });
    const after = await sam.api.bootstrapState();
    expect(after.memberships).toEqual([]);
    expect(standingWithNoHousehold(last)).toBe('ended');
    expect(endedReading(last)).toBe('left');
    expect(ENDED.left.title(last.name)).toBe('You left Lee’s family');
    // Lee's family goes on with its owner; Sam has no parent's seat anywhere, so his own may start
    expect((await lee.phone.api.listMembers(lee.id)).map(m => m.display_name)).toEqual(['Lee']);
    expect(ownFamilyVerdict(after)).toBe('offered');
  });

  it('a second join whose switch came back owed: the join stands, "You joined" waits for the switch', async () => {
    const backend = server();
    const dana = await family(backend, 'Dana', 'dana@example.test');
    const lee = await family(backend, 'Lee', 'lee@example.test');
    const out = await sheetJoin(dana.phone, { code: await code(lee.phone, lee.id, 'CAREGIVER') });
    expect(out).toMatchObject({ kind: 'joined', household_id: lee.id });
    // `settleJoin`: Dana's family owes two entries, so the switch comes back owed
    const off = joinedOffScreenOf('Lee’s family', 'Dana’s family', {
      kind: 'owed',
      count: 2,
      name: 'Dana’s family',
    });
    expect(off).not.toBeNull();
    expect(joinedOffScreenSentence(off!, () => '')).toBe(
      'You joined Lee’s family. 2 entries for Dana’s family are still on the way to the server. Switch once they have sent.',
    );
    // the join happened: Lee's family is in Your families, a tap away
    const read = await dana.phone.api.bootstrapState();
    expect(hasSeveralHouseholds(read)).toBe(true);
    expect(names(read)).toEqual(['Dana’s family', 'Lee’s family']);
  });
});
