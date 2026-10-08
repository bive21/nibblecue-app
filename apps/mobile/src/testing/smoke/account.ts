/**
 * The account a smoke test opens the app on, made the way a parent makes one: through the in-app
 * test backend (`auth/providers/mock.ts`) with the app's own stores, so the launch that follows
 * reads it from where a relaunch would. Nothing is written past the API.
 */
import { LEGAL_VERSION } from '@nibblecue/brand';
import {
  bootstrapPayloadFrom,
  initialDraft,
  localDayKey,
  onboardingReducer,
  type OnboardingAction,
} from '@nibblecue/core';
import { mockSessionStore } from '../../auth/keychain';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../../auth/providers/mock';
import { mockStateStore } from '../../prefs/async-storage';

const TZ = 'America/Chicago';

async function signedUp() {
  const backend = new MockBackend({ store: mockStateStore });
  await backend.load();
  const auth = new MockAuthProvider(backend, mockSessionStore);
  const api = new MockAccountsApi(backend, auth);
  await auth.signUpWithPassword('smoke@example.test', 'correct horse battery');
  const opened = await auth.handleAuthLink(backend.lastLink ?? '');
  if (opened.kind !== 'signed_in')
    throw new Error(`the sign-up link did not sign in: ${opened.kind}`);
  const accepted = await api.acceptTerms(LEGAL_VERSION);
  if (!accepted.ok) throw new Error('the terms were not recorded');
  return { backend, auth, api };
}

/** Signed up and verified, no household yet: the launch lands on setup. */
export async function verifiedWithoutHousehold(): Promise<void> {
  const { backend } = await signedUp();
  await backend.save();
}

/**
 * Setup finished the ordinary way: a baby born `ageDays` ago (two months by default, too young for
 * solids; NibbleCue's own loop passes about seven months), the feeding cards as they start.
 */
export async function signedInWithHousehold(ageDays = 60): Promise<void> {
  const { backend, api } = await signedUp();
  const today = localDayKey(TZ, Date.now());
  const next: OnboardingAction = { type: 'next', today };
  const answers: OnboardingAction[] = [
    { type: 'set_name', value: 'Dana' },
    { type: 'set_role', value: 'parent' },
    { type: 'set_child_name', value: 'Emma' },
    { type: 'set_birth_date', value: shiftedDay(today, -ageDays) },
    next,
    next,
    next,
    next,
  ];
  const draft = answers.reduce(
    onboardingReducer,
    initialDraft('6f5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f'),
  );
  const created = await api.createHousehold(
    bootstrapPayloadFrom(draft, { locale: 'en-US', time_zone: TZ }),
  );
  if (!created.ok) throw new Error(`no household: ${created.error}`);
  await backend.save();
}

function shiftedDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
