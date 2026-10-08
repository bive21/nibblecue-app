/**
 * A NEW PARENT, FROM SIGN-UP TO NIBBLECUE PLUS, against the in-app test backend
 * (`auth/providers/mock.ts`, `billing/mock.ts`): the account, the one-page setup sent through
 * CuddleCue's own bootstrap (`onboarding/sendFinish.ts`), the free plan, and NibbleCue Plus bought
 * as its own subscription, leaving the household's CuddleCue plan exactly as it was.
 */
import { can, initialDraft, planOf, planSnapshot, zonedToUtc } from '@nibblecue/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import type { AccountsApi, SessionStore } from '../auth/providers/types';
import type { Session } from '../auth/session';
import { MockBillingProvider } from '../billing/mock';
import { setIdSource } from '../data/ids';
import { nibbleDraft } from '../onboarding/nibbleDraft';
import { sendFinish } from '../onboarding/sendFinish';
import { memoryStore } from '../prefs';
import { seededIds } from '../testing/fixtures';

const TZ = 'America/Chicago';
const EVENING = zonedToUtc(TZ, 2026, 10, 8, 19, 30);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(EVENING);
});
afterEach(() => {
  vi.useRealTimers();
  setIdSource(null);
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

describe('a new parent', () => {
  it('signs up, makes a family in one page, gets the free plan, then buys NibbleCue Plus', async () => {
    const backend = new MockBackend({ now: () => Date.now(), newId: seededIds('abababab') });
    const prefs = memoryStore();
    const auth = new MockAuthProvider(backend, sessionStore());
    const api = new MockAccountsApi(backend, auth) as AccountsApi;

    await auth.signUpWithPassword('sam@example.com', 'correct horse battery');
    const opened = await auth.handleAuthLink(backend.lastLink ?? '');
    expect(opened.kind).toBe('signed_in');
    const uid = auth.current()?.user.id ?? '';

    const draft = nibbleDraft(initialDraft(crypto.randomUUID()), {
      name: 'Sam',
      child: 'Ada',
      birth: '2026-03-20',
    });
    const sent = await sendFinish(
      {
        store: prefs,
        userId: uid,
        context: { locale: 'en-US', time_zone: TZ },
        createHousehold: body => api.createHousehold(body),
      },
      draft,
    );
    expect(sent.kind).toBe('created');
    if (sent.kind !== 'created') return;
    const householdId = sent.result.household_id;

    // the family exists with CuddleCue's modules, solids among them, and one baby
    const state = await api.bootstrapState();
    expect(state.memberships.map(m => m.household_id)).toEqual([householdId]);
    expect(state.children.map(c => c.name)).toEqual(['Ada']);
    const modules = state.modules.filter(m => m.enabled).map(m => m.module_id);
    expect(modules).toContain('solids');

    // the free plan: today's plan and logging always; the full plan is NibbleCue Plus
    const before = planSnapshot(state.nibblePlans?.[householdId] ?? null, state.serverNow);
    expect(before.tier).toBe('FREE');
    expect(can('logging', before.tier)).toBe(true);
    expect(can('allergens', before.tier)).toBe(true);
    expect(can('fullPlan', before.tier)).toBe(false);
    const cuddleBefore = state.entitlement;

    // NibbleCue Plus, bought: its own row, read back by the next account read
    const billing = new MockBillingProvider(backend, () => ({ userId: uid, householdId }));
    const [annual] = await billing.products();
    expect(annual?.id).toBe('nibble_plus_annual');
    expect(await billing.purchase(annual!.id)).toEqual({ kind: 'purchased' });
    const after = await api.bootstrapState();
    const plus = planSnapshot(after.nibblePlans?.[householdId] ?? null, after.serverNow);
    expect(plus.tier).toBe('PLUS');
    expect(can('fullPlan', plus.tier)).toBe(true);
    // CuddleCue's plan is exactly what it was: a NibbleCue purchase is never CuddleCue Plus
    expect(after.entitlement).toEqual(cuddleBefore);
    // and a caregiver's seat is open on either plan (the owner, 2026-10-08; migration 0163)
    expect(planOf('caregivers')).toBe('either');
  });

  it('gets 14 days of NibbleCue Plus once, which end by themselves and never come back', async () => {
    const backend = new MockBackend({ now: () => Date.now(), newId: seededIds('cdcdcdcd') });
    const prefs = memoryStore();
    const auth = new MockAuthProvider(backend, sessionStore());
    const api = new MockAccountsApi(backend, auth) as AccountsApi;
    await auth.signUpWithPassword('ana@example.com', 'correct horse battery');
    await auth.handleAuthLink(backend.lastLink ?? '');
    const uid = auth.current()?.user.id ?? '';
    const sent = await sendFinish(
      {
        store: prefs,
        userId: uid,
        context: { locale: 'en-US', time_zone: TZ },
        createHousehold: body => api.createHousehold(body),
      },
      nibbleDraft(initialDraft(crypto.randomUUID()), {
        name: 'Ana',
        child: 'Leo',
        birth: '2026-03-01',
      }),
    );
    if (sent.kind !== 'created') throw new Error('no family');
    const h = sent.result.household_id;
    const cuddle = (await api.bootstrapState()).entitlement;

    expect(await api.startNibbleTrial(h)).toEqual({ ok: true, granted: true });
    let state = await api.bootstrapState();
    let plan = planSnapshot(state.nibblePlans?.[h] ?? null, state.serverNow);
    expect(plan).toMatchObject({ status: 'WELCOME', tier: 'PLUS', daysLeft: 14 });
    expect(can('fullPlan', plan.tier)).toBe(true);
    // CuddleCue's own plan is untouched by NibbleCue's trial
    expect(state.entitlement).toEqual(cuddle);
    // asked again: once per family, ever
    expect(await api.startNibbleTrial(h)).toEqual({ ok: true, granted: false });

    // fifteen days on: the free plan, by itself, and asking again gives nothing
    vi.setSystemTime(EVENING + 15 * 86_400_000);
    state = await api.bootstrapState();
    plan = planSnapshot(state.nibblePlans?.[h] ?? null, state.serverNow);
    expect(plan.tier).toBe('FREE');
    expect(await api.startNibbleTrial(h)).toEqual({ ok: true, granted: false });

    // with neither plan, a caregiver's seat is refused by the server, not the phone
    const seat = async () => {
      const made = await api.createInvite(h, 'CAREGIVER', 'CODE');
      if (!made.ok || made.kind !== 'CODE') throw new Error('no code');
      return api.checkInvite({ code: made.code });
    };
    expect(await seat()).toMatchObject({ ok: false, error: 'needs_plus' });

    // and a purchase after it still works, and NibbleCue Plus alone opens the seat (0163)
    const billing = new MockBillingProvider(backend, () => ({ userId: uid, householdId: h }));
    expect(await billing.purchase('nibble_plus_monthly')).toEqual({ kind: 'purchased' });
    state = await api.bootstrapState();
    expect(planSnapshot(state.nibblePlans?.[h] ?? null, state.serverNow).tier).toBe('PLUS');
    expect(await seat()).toMatchObject({ ok: true });
  });
});
