import { INVITE_CODE_LIFETIME_MS, INVITE_LINK_LIFETIME_MS } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { clearForSignOut, memoryStore, survivesSignOut } from '../prefs';
import {
  clearInviteHold,
  HELD_INVITE_KEY,
  heldHousehold,
  heldRole,
  holdOf,
  inviteKindOf,
  lapseOf,
  loadInviteHold,
  saveInviteHold,
  withLifetime,
  withPreview,
  type InviteHold,
} from './held-invite';

/**
 * THE PARTNER'S CODE OUTLIVES THE APP (the first-day trace, 2026-09-25). Typed on the first screen,
 * then an account, then a wait for the confirmation email — during which Android may kill the app,
 * and after which the emailed link usually opens it cold. `held-invite.ts` says why each rule is
 * the rule; these hold them.
 */

const T0 = Date.parse('2026-09-26T09:00:00Z');
const MIN = 60_000;
const TOKEN = 'Zr0_k3n-abcdefghijklmnop';

describe('a held invite survives a restart', () => {
  it('is written to the preferences store and read back by a fresh load, as a new process would', async () => {
    const store = memoryStore();
    const hold = holdOf({ code: 'WDJBMA' }, T0);
    expect(hold).toEqual({
      state: 'held',
      invite: { code: 'WDJBMA' },
      kind: 'code',
      heldAt: T0,
      origin: 'code',
      preview: null,
    });
    await saveInviteHold(store, hold as InviteHold);
    // the process is gone; only the store is left
    expect(await loadInviteHold(store)).toEqual(hold);
    expect(await store.keys()).toEqual([HELD_INVITE_KEY]);
  });

  it('keeps a link’s token the same way, and knows which kind it is', async () => {
    const store = memoryStore();
    const hold = holdOf({ token: TOKEN }, T0) as InviteHold;
    await saveInviteHold(store, hold);
    expect(await loadInviteHold(store)).toEqual({
      state: 'held',
      invite: { token: TOKEN },
      kind: 'link',
      heldAt: T0,
      origin: 'link',
      preview: null,
    });
    expect(inviteKindOf({ token: TOKEN })).toBe('link');
    expect(inviteKindOf({ code: 'WDJBMA' })).toBe('code');
  });

  it('holds only what is an invite: six letters, or a token the link could carry', () => {
    expect(holdOf({ code: 'WDJBM' }, T0)).toBeNull();
    expect(holdOf({ code: 'WDJBM1' }, T0)).toBeNull();
    // the eight letters every code was under 0140, and the six digits before it: never held, since
    // the server takes six letters only
    expect(holdOf({ code: 'WDJBMJHT' }, T0)).toBeNull();
    expect(holdOf({ code: '482916' }, T0)).toBeNull();
    expect(holdOf({ token: 'has a space' }, T0)).toBeNull();
    expect(holdOf({}, T0)).toBeNull();
    // a token wins over a code, as the server reads them
    expect(holdOf({ code: 'WDJBMA', token: TOKEN }, T0)).toMatchObject({ kind: 'link' });
  });

  it('reads a corrupt or foreign record as nothing held, never as a crash', async () => {
    const store = memoryStore();
    for (const raw of [
      '{not json',
      JSON.stringify({ state: 'held', code: '12', held_at: T0 }),
      JSON.stringify({ state: 'held', held_at: T0 }),
      JSON.stringify({ state: 'lapsed', reason: 'bored', kind: 'code', at: T0 }),
      JSON.stringify({ code: 'WDJBMA' }),
      // an eight-letter code an older build held (0140): dead within its fifteen minutes anyway,
      // and never sent, since the server takes six letters only (0144)
      JSON.stringify({ state: 'held', code: 'WDJBMJHT', held_at: T0 }),
    ]) {
      await store.set(HELD_INVITE_KEY, raw);
      expect(await loadInviteHold(store), raw).toBeNull();
    }
  });
});

describe('a code checked before the account keeps what the check said (0139)', () => {
  const PREVIEW = {
    household_name: 'Dana’s family',
    inviter_name: 'Dana',
    role: 'CAREGIVER' as const,
    seat_hours: 6,
  };

  it('holds the claim the server made as a link that was typed, with the household’s name, and reads it back', async () => {
    const store = memoryStore();
    const hold = holdOf({ token: TOKEN }, T0, { origin: 'code', preview: PREVIEW }) as InviteHold;
    // held as what it is (a token, and so a link’s 48 hours), said as what the person did (typed)
    expect(hold).toMatchObject({ kind: 'link', origin: 'code', preview: PREVIEW });
    expect(heldHousehold(hold)).toBe('Dana’s family');
    expect(heldRole(hold)).toBe('CAREGIVER');
    await saveInviteHold(store, hold);
    expect(await loadInviteHold(store)).toEqual(hold);
    // the claim outlives the email: an hour on, a day on, it is still held
    expect(withLifetime(hold, T0 + 60 * MIN)).toBe(hold);
    expect(withLifetime(hold, T0 + 24 * 60 * MIN)).toBe(hold);
  });

  it('keeps the household’s name and the seat through a lapse, and never the secret', async () => {
    const store = memoryStore();
    const hold = holdOf({ token: TOKEN }, T0, { origin: 'code', preview: PREVIEW }) as InviteHold;
    const refused = lapseOf(hold, 'needs_plus', T0 + MIN);
    expect(refused).toEqual({
      state: 'lapsed',
      lapse: { reason: 'needs_plus', kind: 'link', household: 'Dana’s family', role: 'CAREGIVER' },
      at: T0 + MIN,
    });
    await saveInviteHold(store, refused);
    expect(await loadInviteHold(store)).toEqual(refused);
    expect((await store.get(HELD_INVITE_KEY)) ?? '').not.toContain(TOKEN);
    expect(heldHousehold(refused)).toBe('Dana’s family');
    // and the two new reasons are read back as themselves
    const own = lapseOf(holdOf({ code: 'WDJBMA' }, T0) as InviteHold, 'own', T0);
    await saveInviteHold(store, own);
    expect(await loadInviteHold(store)).toEqual(own);
  });

  it('adds what a later check said to a link held unchecked, and leaves anything else alone', () => {
    const link = holdOf({ token: TOKEN }, T0) as InviteHold;
    expect(withPreview(link, PREVIEW)).toEqual({ ...link, preview: PREVIEW });
    const lapsed = lapseOf(link, 'refused', T0);
    expect(withPreview(lapsed, PREVIEW)).toBe(lapsed);
    expect(withPreview(null, PREVIEW)).toBeNull();
  });

  it('reads a record an older build wrote — no origin, no preview — as the unchecked invite it was', async () => {
    const store = memoryStore();
    await store.set(
      HELD_INVITE_KEY,
      JSON.stringify({ state: 'held', code: 'WDJBMA', held_at: T0 }),
    );
    expect(await loadInviteHold(store)).toEqual({
      state: 'held',
      invite: { code: 'WDJBMA' },
      kind: 'code',
      heldAt: T0,
      origin: 'code',
      preview: null,
    });
    await store.set(HELD_INVITE_KEY, JSON.stringify({ state: 'held', token: TOKEN, held_at: T0 }));
    expect(await loadInviteHold(store)).toMatchObject({
      kind: 'link',
      origin: 'link',
      preview: null,
    });
    // and a preview with a role the app does not know is no preview at all: the record is refused
    await store.set(
      HELD_INVITE_KEY,
      JSON.stringify({
        state: 'held',
        token: TOKEN,
        held_at: T0,
        preview: { ...PREVIEW, role: 'ADMIN' },
      }),
    );
    expect(await loadInviteHold(store)).toBeNull();
  });
});

describe('it lasts until used, refused, replaced, canceled or signed out — and minds its clock', () => {
  it('turns a code into a lapse once five minutes have passed since it was typed', () => {
    const hold = holdOf({ code: 'WDJBMA' }, T0) as InviteHold;
    // the same object when nothing changed, so the caller can skip a write
    expect(withLifetime(hold, T0 + 4 * MIN)).toBe(hold);
    expect(INVITE_CODE_LIFETIME_MS).toBe(5 * MIN);
    const lapsed = withLifetime(hold, T0 + INVITE_CODE_LIFETIME_MS);
    expect(lapsed).toEqual({
      state: 'lapsed',
      lapse: { reason: 'expired', kind: 'code' },
      at: T0 + INVITE_CODE_LIFETIME_MS,
    });
    // CLEARED: what is left says which kind and why, and never carries the code itself
    expect(JSON.stringify(lapsed)).not.toContain('WDJBMA');
  });

  it('gives a link its own 48 hours', () => {
    const hold = holdOf({ token: TOKEN }, T0) as InviteHold;
    expect(withLifetime(hold, T0 + 20 * MIN)).toBe(hold);
    expect(withLifetime(hold, T0 + INVITE_LINK_LIFETIME_MS)).toMatchObject({
      state: 'lapsed',
      lapse: { reason: 'expired', kind: 'link' },
    });
  });

  it('records a refusal the same way, and a lapse survives a restart with no secret in it', async () => {
    const store = memoryStore();
    const refused = lapseOf(holdOf({ code: 'WDJBMA' }, T0) as InviteHold, 'refused', T0 + MIN);
    await saveInviteHold(store, refused);
    expect(await loadInviteHold(store)).toEqual({
      state: 'lapsed',
      lapse: { reason: 'refused', kind: 'code' },
      at: T0 + MIN,
    });
    expect((await store.get(HELD_INVITE_KEY)) ?? '').not.toContain('WDJBMA');
    // a lapse is already what it will be: the clock does not move it again
    expect(withLifetime(refused, T0 + 99 * MIN)).toBe(refused);
    expect(lapseOf(refused, 'expired', T0 + 2 * MIN)).toBe(refused);
  });

  it('is replaced whole by a new code', async () => {
    const store = memoryStore();
    await saveInviteHold(
      store,
      lapseOf(holdOf({ code: 'BBBBBB' }, T0) as InviteHold, 'refused', T0),
    );
    await saveInviteHold(store, holdOf({ code: 'CCCCCC' }, T0 + 5 * MIN) as InviteHold);
    expect(await loadInviteHold(store)).toEqual({
      state: 'held',
      invite: { code: 'CCCCCC' },
      kind: 'code',
      heldAt: T0 + 5 * MIN,
      origin: 'code',
      preview: null,
    });
  });

  it('is gone once cleared — joined, or "set up a new household instead"', async () => {
    const store = memoryStore();
    await saveInviteHold(store, holdOf({ code: 'WDJBMA' }, T0) as InviteHold);
    await clearInviteHold(store);
    expect(await loadInviteHold(store)).toBeNull();
  });

  it('is swept by sign-out with the rest of the account’s preferences (teardown step 10)', async () => {
    expect(survivesSignOut(HELD_INVITE_KEY)).toBe(false);
    const store = memoryStore({ theme: 'dark' });
    await saveInviteHold(store, holdOf({ code: 'WDJBMA' }, T0) as InviteHold);
    expect(await clearForSignOut(store)).toEqual([HELD_INVITE_KEY]);
    expect(await loadInviteHold(store)).toBeNull();
    expect(await store.get('theme')).toBe('dark');
  });
});
