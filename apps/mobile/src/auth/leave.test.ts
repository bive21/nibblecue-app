/**
 * LEAVING A HOUSEHOLD NOBODY ELSE IS IN, AND BRINGING IT BACK (migration 0143): the phone's pure
 * pieces (`leave.ts`), the in-app test backend following the server (`providers/mock.ts`), and what
 * `AuthContext` owes them, read as source (a `.tsx` over React Native). The story as a person lives
 * it is `scenarios/leave.scenario.test.ts`; the server's own rules are
 * `packages/db/src/integration/leave-alone.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLOSED_HOUSEHOLD_DAYS } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../prefs';
import { seededIds } from '../testing/fixtures';
import {
  canLeaveSeat,
  clearLeftHousehold,
  mustHandOnFirst,
  rememberLeaving,
  forgetLeftHousehold,
  keptUntilLabel,
  leaveAlone,
  leftHouseholdKey,
  loadLeftHousehold,
  restorable,
  restoreLeft,
  saveLeftHousehold,
  leaveSeat,
  type LeaveDeps,
  type SeatLeaveDeps,
  type LeftHousehold,
} from './leave';
import { MockAccountsApi, MockAuthProvider, MockBackend } from './providers/mock';
import { AuthFailure, type LeaveHouseholdResult, type SessionStore } from './providers/types';
import type { Session } from './session';

const DAY = 86_400_000;
const AT = Date.parse('2026-09-29T19:30:00.000Z');

const closed: LeaveHouseholdResult = {
  ok: true,
  household_id: 'h-sam',
  household_name: 'Sam’s family',
  closed_at: new Date(AT).toISOString(),
  purge_after: new Date(AT + 30 * DAY).toISOString(),
  restorable: true,
};

/** The leave's dependencies, recording what was called, in order. */
function deps(over: Partial<LeaveDeps> = {}) {
  const calls: string[] = [];
  const d: LeaveDeps = {
    flush: async () => {
      calls.push('flush');
    },
    owed: async () => {
      calls.push('owed');
      return 0;
    },
    leave: async () => {
      calls.push('leave');
      return closed;
    },
    now: () => AT,
    ...over,
  };
  return { d, calls };
}

describe('the leave, as the phone makes it', () => {
  it('sends what it owes first, then leaves, and keeps what the close answered', async () => {
    const { d, calls } = deps();
    expect(await leaveAlone(d)).toEqual({
      kind: 'left',
      left: {
        id: 'h-sam',
        name: 'Sam’s family',
        purge_at: new Date(AT + 30 * DAY).toISOString(),
        left_at: AT,
      },
    });
    expect(calls).toEqual(['flush', 'owed', 'leave']);
  });

  it('does not leave while entries are still on their way: nothing stays behind on the phone', async () => {
    const { d, calls } = deps({ owed: async () => 2 });
    expect(await leaveAlone(d)).toEqual({ kind: 'unsynced', count: 2 });
    expect(calls).toEqual(['flush']);
  });

  it('says somebody else is in it, no connection, or something went wrong', async () => {
    const answer = (r: LeaveHouseholdResult) => leaveAlone(deps({ leave: async () => r }).d);
    expect(await answer({ ok: false, status: 409, error: 'not_alone' })).toEqual({
      kind: 'not_alone',
    });
    expect(await answer({ ok: false, status: 403, error: 'forbidden' })).toEqual({
      kind: 'failed',
    });
    const offline = deps({
      leave: async () => {
        throw new AuthFailure('offline');
      },
    });
    expect(await leaveAlone(offline.d)).toEqual({ kind: 'offline' });
    const broken = deps({
      leave: async () => {
        throw new Error('boom');
      },
    });
    expect(await leaveAlone(broken.d)).toEqual({ kind: 'failed' });
  });
});

describe('bringing it back, as the phone asks', () => {
  it('reads every answer the server can give', async () => {
    expect(
      await restoreLeft(async () => ({
        ok: true,
        household_id: 'h',
        household_name: 'Sam’s family',
        role: 'OWNER',
      })),
    ).toEqual({ kind: 'restored', household_id: 'h', household_name: 'Sam’s family' });
    // its time is up, or it is not this person's: it cannot come back either way
    expect(await restoreLeft(async () => ({ ok: false, status: 404, error: 'not_found' }))).toEqual(
      { kind: 'gone' },
    );
    expect(
      await restoreLeft(async () => ({ ok: false, status: 409, error: 'window_passed' })),
    ).toEqual({ kind: 'gone' });
    expect(
      await restoreLeft(async () => ({ ok: false, status: 409, error: 'in_another_household' })),
    ).toEqual({ kind: 'in_household' });
    expect(
      await restoreLeft(async () => {
        throw new AuthFailure('offline');
      }),
    ).toEqual({ kind: 'offline' });
    expect(await restoreLeft(async () => ({ ok: false, status: 500, error: 'x' }))).toEqual({
      kind: 'failed',
    });
  });
});

describe('the record Ended offers back', () => {
  const left: LeftHousehold = {
    id: 'h-sam',
    name: 'Sam’s family',
    purge_at: new Date(AT + 30 * DAY).toISOString(),
    left_at: AT,
  };

  it('is kept per account, and one that does not parse is none', async () => {
    const store = memoryStore();
    await saveLeftHousehold(store, 'u1', left);
    expect(await loadLeftHousehold(store, 'u1')).toEqual(left);
    expect(await loadLeftHousehold(store, 'u2')).toBeNull();
    expect(leftHouseholdKey('u1')).toBe('left_household:u1');
    await store.set(leftHouseholdKey('u2'), '{"id":3}');
    expect(await loadLeftHousehold(store, 'u2')).toBeNull();
    await clearLeftHousehold(store, 'u1');
    expect(await loadLeftHousehold(store, 'u1')).toBeNull();
  });

  it('is let go with the memory of it, once it can no longer come back, and only its own memory', async () => {
    const lastKey = 'last_household:u1';
    const store = memoryStore({ [lastKey]: JSON.stringify({ id: 'h-sam', name: 'Sam’s family' }) });
    await saveLeftHousehold(store, 'u1', left);
    expect(await forgetLeftHousehold(store, 'u1', 'h-sam', lastKey)).toBe(true);
    expect(await store.keys()).toEqual([]);
    // a household joined since, and ended, is that household's memory: it stays
    const since = JSON.stringify({ id: 'h-dana', name: 'Dana’s family' });
    const other = memoryStore({ [lastKey]: since });
    await saveLeftHousehold(other, 'u1', left);
    expect(await forgetLeftHousehold(other, 'u1', 'h-sam', lastKey)).toBe(false);
    expect(await other.get(lastKey)).toBe(since);
    expect(await loadLeftHousehold(other, 'u1')).toBeNull();
    // a memory that does not parse is nobody's, and is not touched
    const broken = memoryStore({ [lastKey]: '{not json' });
    expect(await forgetLeftHousehold(broken, 'u1', 'h-sam', lastKey)).toBe(false);
    expect(await broken.get(lastKey)).toBe('{not json');
  });

  it('is offered until the server’s purge date, and not after', () => {
    expect(restorable(left, AT + 29 * DAY)).toBe(true);
    expect(restorable(left, AT + 30 * DAY)).toBe(false);
    expect(restorable(null, AT)).toBe(false);
    expect(restorable({ ...left, purge_at: 'soon' }, AT)).toBe(false);
  });

  it('says the day before the purge, so the promise is never broken by an afternoon', () => {
    expect(keptUntilLabel('2026-10-29T19:30:00.000Z', 'en-US', 'UTC')).toBe('October 28');
    // in the phone's own zone: an evening in Chicago is still the 28th there
    expect(keptUntilLabel('2026-10-30T00:30:00.000Z', 'en-US', 'America/Chicago')).toBe(
      'October 28',
    );
    expect(keptUntilLabel('nonsense', 'en-US')).toBe('');
  });
});

/* ---------------------------------------------------------------- the test backend */

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

const PAYLOAD = (name: string) => ({
  client_op_id: crypto.randomUUID(),
  profile: { display_name: name, locale: 'en-US', time_zone: 'UTC' },
  household: { name: `${name}’s family`, home_time_zone: 'UTC' },
  child: { name: 'Ada', birth_date: '2026-08-20' },
  modules: ['bottle', 'diaper', 'sleep'] as ('bottle' | 'diaper' | 'sleep')[],
});

async function world() {
  let now = AT;
  const backend = new MockBackend({ now: () => now, newId: seededIds('dededede') });
  const phone = async (name: string) => {
    const auth = new MockAuthProvider(backend, sessionStore());
    const email = `${name.toLowerCase()}@example.test`;
    await auth.signUpWithPassword(email, 'correct horse battery');
    await auth.handleAuthLink(backend.lastLink ?? '');
    const api = new MockAccountsApi(backend, auth);
    return { auth, api, id: auth.current()?.user.id ?? '' };
  };
  const owner = async (name: string) => {
    const p = await phone(name);
    const made = await p.api.createHousehold(PAYLOAD(name));
    if (!made.ok) throw new Error('no household');
    return { ...p, household: made.household_id };
  };
  return {
    backend,
    phone,
    owner,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe('the test backend follows the server (0143)', () => {
  it('keeps a household open while anybody else is live in it, and a lapsed seat is nobody', async () => {
    const w = await world();
    const dana = await w.owner('Dana');
    const code = await dana.api.createInvite(dana.household, 'CAREGIVER', 'CODE', 6);
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    const kim = await w.phone('Kim');
    expect((await kim.api.acceptInvite({ code: code.code })).ok).toBe(true);
    expect(await dana.api.leaveHousehold(dana.household)).toEqual({
      ok: false,
      status: 409,
      error: 'not_alone',
    });
    // the evening is over: Kim is nobody now, and cannot leave for the household either
    w.later(7 * 3_600_000);
    expect(await kim.api.leaveHousehold(dana.household)).toMatchObject({ status: 403 });
    const left = await dana.api.leaveHousehold(dana.household);
    expect(left).toMatchObject({ ok: true, household_name: 'Dana’s family', restorable: true });
    if (!left.ok) return;
    expect(Date.parse(left.purge_after) - Date.parse(left.closed_at)).toBe(
      CLOSED_HOUSEHOLD_DAYS * DAY,
    );
  });

  it('closes it for everyone: no membership, no roster, no invite that works, no second leave', async () => {
    const w = await world();
    const sam = await w.owner('Sam');
    const code = await sam.api.createInvite(sam.household, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    expect((await sam.api.leaveHousehold(sam.household)).ok).toBe(true);
    expect((await sam.api.bootstrapState()).memberships).toEqual([]);
    expect(await sam.api.listMembers(sam.household)).toEqual([]);
    expect(await sam.api.leaveHousehold(sam.household)).toMatchObject({ status: 403 });
    const lee = await w.phone('Lee');
    expect(await lee.api.acceptInvite({ code: code.code })).toMatchObject({
      ok: false,
      error: 'invalid_invite',
    });
    // and setting up again makes a new one (the server's check is a household one OWNS now)
    const again = await sam.api.createHousehold(PAYLOAD('Sam'));
    expect(again).toMatchObject({ ok: true, created: true, welcome_granted: false });
  });

  it('brings it back for its closer only, inside the window, from no other household', async () => {
    const w = await world();
    const sam = await w.owner('Sam');
    const dana = await w.owner('Dana');
    expect((await sam.api.leaveHousehold(sam.household)).ok).toBe(true);
    // not Dana's to bring back, and an open household is nobody's to reopen
    expect(await dana.api.restoreHousehold(sam.household)).toMatchObject({
      status: 404,
      error: 'not_found',
    });
    expect(await sam.api.restoreHousehold(dana.household)).toMatchObject({ status: 404 });
    // in Dana's household now: one household per account
    const code = await dana.api.createInvite(dana.household, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    expect((await sam.api.acceptInvite({ code: code.code })).ok).toBe(true);
    expect(await sam.api.restoreHousehold(sam.household)).toMatchObject({
      status: 409,
      error: 'in_another_household',
    });
    // out of Dana's again, and back to his own, as he was
    expect(await dana.api.removeMember(dana.household, sam.id)).toEqual({ ok: true });
    expect(await sam.api.restoreHousehold(sam.household)).toEqual({
      ok: true,
      household_id: sam.household,
      household_name: 'Sam’s family',
      role: 'OWNER',
    });
    expect((await sam.api.bootstrapState()).memberships.map(m => m.household_id)).toEqual([
      sam.household,
    ]);
  });

  it('refuses after the window, and the nightly purge takes it, leaving a store row unfiled', async () => {
    const w = await world();
    const sam = await w.owner('Sam');
    // Sam bought Plus while he was there: the row the mock store writes
    const row = w.backend.state.entitlements.find(e => e.user_id === sam.id);
    if (row === undefined) throw new Error('no row');
    row.source = 'store';
    row.current_period_end = new Date(AT + 365 * DAY).toISOString();
    expect(await sam.api.storeSubscription()).toEqual({ ok: true, active: true });
    expect((await sam.api.leaveHousehold(sam.household)).ok).toBe(true);
    // leaving changed nothing in the store
    expect(await sam.api.storeSubscription()).toEqual({ ok: true, active: true });

    w.later(CLOSED_HOUSEHOLD_DAYS * DAY);
    expect(await sam.api.restoreHousehold(sam.household)).toMatchObject({
      status: 409,
      error: 'window_passed',
    });
    w.backend.purgeDue();
    expect(w.backend.state.households.map(h => h.id)).not.toContain(sam.household);
    expect(w.backend.state.children.filter(c => c.household_id === sam.household)).toEqual([]);
    expect(w.backend.state.members.filter(m => m.household_id === sam.household)).toEqual([]);
    expect(row).toMatchObject({ household_id: null, source: 'store' });
    expect(await sam.api.restoreHousehold(sam.household)).toMatchObject({ status: 404 });
  });

  it('says a store subscription only of the person asking, never of somebody else', async () => {
    const w = await world();
    const dana = await w.owner('Dana');
    const sam = await w.owner('Sam');
    const danas = w.backend.state.entitlements.find(e => e.user_id === dana.id);
    if (danas === undefined) throw new Error('no row');
    danas.source = 'store';
    expect(await dana.api.storeSubscription()).toEqual({ ok: true, active: true });
    // Sam's is the welcome preview: not a store subscription
    expect(await sam.api.storeSubscription()).toEqual({ ok: true, active: false });
  });
});

/* ---------------------------------------------------------------- the wiring, as source */

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const context = strip(readFileSync(join(__dirname, 'AuthContext.tsx'), 'utf8')).replace(
  /\s+/g,
  ' ',
);
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('AuthContext leaves by the road every household leaves a phone by', () => {
  const leave = between(
    context,
    'const leaveHousehold = useCallback(',
    'const restoreHousehold = useCallback(',
  );

  it('sends what the phone owes first, and counts only what is still on its way', () => {
    expect(leave).toContain('const outcome = await leaveAlone({');
    expect(leave).toContain("r.flush('manual')");
    expect(leave).toContain("(await r.pending()).filter(row => row.state !== 'FAILED').length");
    expect(leave).toContain('leave: () => p.api.leaveHousehold(here.household_id),');
  });

  it('keeps the record before the account read that takes the household off the phone', () => {
    const save = leave.indexOf('await saveLeftHousehold(prefsStore, userId, outcome.left)');
    const read = leave.indexOf('await refreshAccount()');
    expect(save).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(save);
    // no teardown of its own: the account read's `end_household` is the one path
    expect(leave).not.toContain('tearDown(');
    expect(leave).not.toContain('endHousehold(');
  });

  it('lets the record go when it is brought back or can no longer be, and reads the account again', () => {
    const restore = between(
      context,
      'const restoreHousehold = useCallback(',
      'const checkHeldLink = useCallback(',
    );
    expect(restore).toContain(
      'const outcome = await restoreLeft(() => p.api.restoreHousehold(left.id));',
    );
    expect(restore).toContain(
      "if (outcome.kind === 'restored') { await clearLeftHousehold(prefsStore, userId)",
    );
    // gone: the record, and the memory of it as the last household, so the phase turns to setup
    expect(restore).toContain(
      "if (outcome.kind === 'gone') { if (await forgetLeftHousehold(prefsStore, userId, left.id, LAST_HOUSEHOLD(userId))) setLastHousehold(null);",
    );
    expect(restore).toContain('await refreshAccount()');
  });

  it('reads each account’s own record at a launch and a sign-in, and forgets it at a sign-out', () => {
    expect(context).toContain('setLeftHousehold(await rememberedLeft(cached.user.id));');
    expect(context).toContain('setLeftHousehold(await rememberedLeft(s.user.id));');
    expect(context).toContain('setLeftHousehold(await rememberedLeft(result.session.user.id));');
    const reset = between(context, 'resetToAuth: () => {', 'clearMemory:');
    expect(reset).toContain('setLeftHousehold(null);');
  });

  it('reads the record before the last household, since one whose time is up takes that memory along', () => {
    const expired = between(context, 'async function rememberedLeft(', 'const LEAVE_FLUSH_MS');
    expect(expired).toContain(
      'await forgetLeftHousehold(prefsStore, uid, left.id, LAST_HOUSEHOLD(uid));',
    );
    for (const [left, last] of [
      [
        'setLeftHousehold(await rememberedLeft(cached.user.id));',
        'await prefsStore.get(LAST_HOUSEHOLD(cached.user.id));',
      ],
      [
        'setLeftHousehold(await rememberedLeft(s.user.id));',
        'setLastHousehold(await rememberedHousehold(s.user.id));',
      ],
      [
        'setLeftHousehold(await rememberedLeft(result.session.user.id));',
        'setLastHousehold(await rememberedHousehold(result.session.user.id));',
      ],
    ] as const) {
      // each read is made once, and the record's comes first
      const at = context.indexOf(left);
      expect(at, left).toBeGreaterThan(-1);
      expect(context.lastIndexOf(left), left).toBe(at);
      expect(context.indexOf(last), last).toBeGreaterThan(at);
      expect(context.lastIndexOf(last), last).toBe(context.indexOf(last));
    }
  });
});

/* ------------------------------------------------------------------ leaving a seat */

describe('leaving a seat: a caregiver, a viewer, or a parent who is not the owner (2026-10-08)', () => {
  const ON = { fromMs: AT - 3_600_000, untilMs: AT + 3_600_000, started: true };
  function seat(over: Partial<SeatLeaveDeps> = {}) {
    const calls: string[] = [];
    const d: SeatLeaveDeps = {
      role: 'CAREGIVER',
      online: async () => {
        calls.push('online');
        return true;
      },
      duty: async handBack => {
        calls.push(handBack ? 'duty:hand_back' : 'duty');
        return { kind: 'clear' };
      },
      flush: async () => {
        calls.push('flush');
      },
      owed: async () => {
        calls.push('owed');
        return 0;
      },
      leave: async () => {
        calls.push('leave');
        return { ok: true };
      },
      ...over,
    };
    return { d, calls };
  }

  it('is offered to a caregiver, a viewer and a parent; the owner hands the family on first', () => {
    expect(canLeaveSeat('CAREGIVER')).toBe(true);
    expect(canLeaveSeat('VIEW_ONLY')).toBe(true);
    expect(canLeaveSeat('PARENT')).toBe(true);
    expect(canLeaveSeat('OWNER')).toBe(false);
    expect(canLeaveSeat(null)).toBe(false);
    expect(mustHandOnFirst('OWNER')).toBe(true);
    for (const role of ['PARENT', 'CAREGIVER', 'VIEW_ONLY', null] as const)
      expect(mustHandOnFirst(role)).toBe(false);
  });

  it('sends what the phone owes first, then ends the seat, a parent’s as a caregiver’s', async () => {
    for (const role of ['CAREGIVER', 'VIEW_ONLY', 'PARENT'] as const) {
      const { d, calls } = seat({ role });
      expect(await leaveSeat(d)).toEqual({ kind: 'left' });
      expect(calls).toEqual(['online', 'duty', 'flush', 'owed', 'leave']);
    }
  });

  it('sends nothing while entries are still on their way, or with no connection', async () => {
    const owed = seat({ owed: async () => 2 });
    expect(await leaveSeat(owed.d)).toEqual({ kind: 'unsynced', count: 2 });
    expect(owed.calls).not.toContain('leave');
    const off = seat({ online: async () => false });
    expect(await leaveSeat(off.d)).toEqual({ kind: 'offline' });
    expect(off.calls).toEqual([]);
    const thrown = seat({
      leave: async () => {
        throw new AuthFailure('offline', 'no network');
      },
    });
    expect(await leaveSeat(thrown.d)).toEqual({ kind: 'offline' });
  });

  it('never for the owner, even if asked; a refusal is said, not read as left', async () => {
    const owner = seat({ role: 'OWNER' });
    expect(await leaveSeat(owner.d)).toEqual({ kind: 'not_allowed' });
    expect(owner.calls).toEqual([]);
    expect(
      await leaveSeat(seat({ leave: async () => ({ ok: false, status: 409, error: 'x' }) }).d),
    ).toEqual({ kind: 'not_allowed' });
    expect(
      await leaveSeat(seat({ leave: async () => ({ ok: false, status: 500, error: 'x' }) }).d),
    ).toEqual({ kind: 'failed' });
  });

  it('on for the family: asks first and writes nothing; a yes hands the shift back, then leaves', async () => {
    const asked = seat({
      role: 'PARENT',
      duty: async handBack => {
        asked.calls.push(handBack ? 'duty:hand_back' : 'duty');
        return { kind: 'on_duty', duty: ON };
      },
    });
    expect(await leaveSeat(asked.d)).toEqual({ kind: 'on_duty', duty: ON });
    expect(asked.calls).toEqual(['online', 'duty']);

    const yes = seat({
      role: 'PARENT',
      handBackDuty: true,
      duty: async handBack => {
        yes.calls.push(handBack ? 'duty:hand_back' : 'duty');
        return handBack ? { kind: 'handed_back', duty: ON } : { kind: 'on_duty', duty: ON };
      },
    });
    expect(await leaveSeat(yes.d)).toEqual({ kind: 'left' });
    // the hand-back is written before the flush, so the flush sends it before the seat ends
    expect(yes.calls).toEqual(['online', 'duty:hand_back', 'flush', 'owed', 'leave']);

    // no connection for the hand-back, or a list that cannot be read: nothing changes
    for (const kind of ['offline', 'failed'] as const) {
      const stop = seat({
        handBackDuty: true,
        duty: async () => (kind === 'offline' ? { kind, duty: ON } : { kind }),
      });
      expect(await leaveSeat(stop.d)).toEqual({ kind });
      expect(stop.calls).not.toContain('leave');
      expect(stop.calls).not.toContain('flush');
    }
  });

  it('the test backend lets a caregiver end their own seat, and the family goes on', async () => {
    const w = await world();
    const lee = await w.owner('Lee');
    const code = await lee.api.createInvite(lee.household, 'CAREGIVER', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    const nana = await w.phone('Nana');
    expect((await nana.api.acceptInvite({ code: code.code })).ok).toBe(true);
    const nanaId = (await nana.api.bootstrapState()).profile?.id ?? '';
    expect(await nana.api.removeMember(lee.household, nanaId)).toEqual({ ok: true });
    expect((await nana.api.bootstrapState()).memberships).toEqual([]);
    // Lee's family is as it was, without her
    expect((await lee.api.listMembers(lee.household)).map(m => m.display_name)).toEqual(['Lee']);
    // an owner cannot leave this way: the last-owner guard's own answer
    const leeId = (await lee.api.bootstrapState()).profile?.id ?? '';
    expect(await lee.api.removeMember(lee.household, leeId)).toMatchObject({ ok: false });
  });

  it('the test backend lets a parent leave, keeps the owner in, and the parent may start their own', async () => {
    const w = await world();
    const lee = await w.owner('Lee');
    const code = await lee.api.createInvite(lee.household, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    const sam = await w.phone('Sam');
    expect((await sam.api.acceptInvite({ code: code.code })).ok).toBe(true);
    const samId = (await sam.api.bootstrapState()).profile?.id ?? '';
    const leeId = (await lee.api.bootstrapState()).profile?.id ?? '';
    // the owner, with Sam in the family: refused, and nothing changes (0008's last-owner guard)
    expect(await lee.api.removeMember(lee.household, leeId)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect((await lee.api.bootstrapState()).memberships).toHaveLength(1);
    // the parent leaves: their seat ends, the family goes on with its owner
    expect(await sam.api.removeMember(lee.household, samId)).toEqual({ ok: true });
    expect((await sam.api.bootstrapState()).memberships).toEqual([]);
    expect((await lee.api.listMembers(lee.household)).map(m => m.display_name)).toEqual(['Lee']);
    // no parent's seat anywhere now: their own family may be set up (0154's rule)
    expect(await sam.api.createHousehold(PAYLOAD('Sam'))).toMatchObject({
      ok: true,
      created: true,
    });
    // and once handed on, the owner is a parent who may leave too
    const back = await lee.api.createInvite(lee.household, 'PARENT', 'CODE');
    if (!back.ok || back.kind !== 'CODE') throw new Error('no code');
    const kim = await w.phone('Kim');
    expect((await kim.api.acceptInvite({ code: back.code })).ok).toBe(true);
    const kimId = (await kim.api.bootstrapState()).profile?.id ?? '';
    expect(await lee.api.transferOwnership(lee.household, kimId)).toEqual({ ok: true });
    expect(await lee.api.removeMember(lee.household, leeId)).toEqual({ ok: true });
    expect((await kim.api.listMembers(lee.household)).map(m => m.role)).toEqual(['OWNER']);
  });

  it('marks the family as left on the device memory Ended reads, and nothing else', async () => {
    const store = memoryStore();
    const key = 'last_household:u1';
    expect(await rememberLeaving(store, key, { id: 'h-lee', name: 'Lee’s family' })).toEqual({
      id: 'h-lee',
      name: 'Lee’s family',
      left: true,
    });
    expect(JSON.parse((await store.get(key)) ?? '{}')).toEqual({
      id: 'h-lee',
      name: 'Lee’s family',
      left: true,
    });
    expect(await store.keys()).toEqual([key]);
  });

  it('AuthContext: asks about duty, flushes, ends the seat on oneself, marks the leave, then reads', () => {
    const body = between(
      context,
      'const leaveSeat = useCallback(',
      'const restoreHousehold = useCallback(',
    );
    expect(body).toContain('const outcome = await leaveSeatOf({');
    expect(body).toContain('role: here.role,');
    expect(body).toContain("return step === null ? { kind: 'failed' } : step(userId, handBack);");
    expect(body).toContain("r.flush('manual')");
    expect(body).toContain("(await r.pending()).filter(row => row.state !== 'FAILED').length");
    expect(body).toContain('leave: () => p.api.removeMember(here.household_id, userId),');
    // the mark goes down before the read, so the read that empties the account lands on "You left"
    expect(
      body.indexOf('await rememberLeaving(prefsStore, LAST_HOUSEHOLD(userId), {'),
    ).toBeLessThan(body.indexOf('await refreshAccount()'));
    // no teardown of its own: the account read's `end_household` is the road a removal takes
    expect(body).toContain('await refreshAccount()');
    expect(body).not.toContain('tearDown(');
    expect(body).not.toContain('endHousehold(');
    // the switch's own duty step, reached through its ref
    expect(context).toContain('dutyStepRef.current = dutyStep;');
  });
});
