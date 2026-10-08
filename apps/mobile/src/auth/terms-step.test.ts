/**
 * WHO SEES THE SIGN-UP PAGE'S CHECKBOX AFTER SIGNING IN, and — as much to the point — who never
 * does (`terms-step.ts`). The two ways in: an account made by Google on the sign-in side, and the
 * Terms moving to a new version.
 */
import { LEGAL_VERSION } from '@nibblecue/brand';
import { describe, expect, it } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend } from './providers/mock';
import type { AccountState, SessionStore } from './providers/types';
import type { Session } from './session';
import { termsStepFor } from './terms-step';

const verified = { emailVerified: true };
const household = [
  {
    household_id: 'h1',
    household_name: 'The Iversen family',
    role: 'OWNER' as const,
    welcome_expires_at: null,
    heard_from: null,
    home_time_zone: 'UTC',
    household_created_at: null,
    joined_at: null,
    welcome_waits_for_birth: false,
  },
];
const account = (
  terms_version: number | null,
  memberships: AccountState['memberships'] = [],
): Pick<AccountState, 'profile' | 'memberships'> => ({
  profile: { id: 'u1', display_name: 'Dana', email: 'dana@example.test', terms_version },
  memberships,
});
const step = (over: Partial<Parameters<typeof termsStepFor>[0]>) =>
  termsStepFor({
    session: verified,
    account: account(null),
    tickedHere: false,
    current: 2,
    ...over,
  });

describe('the terms step: who is asked', () => {
  it('a new account with no recorded acceptance and no household — the Google sign-in side', () => {
    expect(step({ account: account(null) })).toBe('new_account');
    // no profile row at all: accept_terms never ran for this account (it creates the row)
    expect(step({ account: { profile: null, memberships: [] } })).toBe('new_account');
  });

  it('an account that accepted an older version, once the Terms move on', () => {
    expect(step({ account: account(1, household) })).toBe('changed');
    expect(step({ account: account(1) })).toBe('changed');
    // and an account in a household that never recorded one
    expect(step({ account: account(null, household) })).toBe('changed');
  });
});

describe('the terms step: who never sees it', () => {
  it('anyone who accepted the current version, returning or new', () => {
    expect(step({ account: account(2, household) })).toBe('none');
    expect(step({ account: account(2) })).toBe('none');
    expect(step({ account: account(3, household) })).toBe('none');
  });

  it('nobody before the account is read: a cold launch never flashes it', () => {
    expect(step({ account: null })).toBe('none');
  });

  it('nobody signed out, and nobody whose address is unconfirmed (that is Verify)', () => {
    expect(step({ session: null })).toBe('none');
    expect(step({ session: { emailVerified: false } })).toBe('none');
  });

  it('whoever ticked the box on this phone and is still waiting on the server', () => {
    expect(step({ tickedHere: true })).toBe('none');
    expect(step({ tickedHere: true, account: account(1, household) })).toBe('none');
  });

  it('an account cached by a build from before the field existed: not known is not "no"', () => {
    const older = {
      profile: { id: 'u1', display_name: 'Dana', email: 'dana@example.test' },
      memberships: household,
    } as unknown as Pick<AccountState, 'profile' | 'memberships'>;
    expect(step({ account: older })).toBe('none');
  });
});

/* ------------------------------------------------ the two paths, against the test backend */

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

function device(backend: MockBackend) {
  const auth = new MockAuthProvider(backend, sessionStore());
  return { auth, api: new MockAccountsApi(backend, auth) };
}

describe('the two paths, end to end on the test backend', () => {
  it('Google on the sign-in side for a new address: asked, and asked no more once accepted', async () => {
    const backend = new MockBackend();
    const d = device(backend);
    const s = await d.auth.signInWithGoogle();
    const read = await d.api.bootstrapState();
    const at = (state: AccountState, tickedHere = false) =>
      termsStepFor({ session: s.user, account: state, tickedHere, current: LEGAL_VERSION });
    expect(at(read)).toBe('new_account');
    // Continue, with the box ticked: the same record the sign-up side makes
    expect(await d.api.acceptTerms(LEGAL_VERSION)).toEqual({ ok: true });
    expect(at(await d.api.bootstrapState())).toBe('none');
  });

  it('a returning account that accepted the current version signs in and sees nothing', async () => {
    const backend = new MockBackend();
    const first = device(backend);
    await first.auth.signInWithGoogle();
    await first.api.acceptTerms(LEGAL_VERSION);
    await first.auth.signOut('local');
    const again = device(backend);
    const s = await again.auth.signInWithGoogle();
    const read = await again.api.bootstrapState();
    expect(
      termsStepFor({ session: s.user, account: read, tickedHere: false, current: LEGAL_VERSION }),
    ).toBe('none');
  });
});
