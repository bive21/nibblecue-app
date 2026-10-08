/**
 * SETUP'S ANSWERS ARE KEPT BEFORE THEY ARE SENT, AND THE TOUR THEY OWE IS PAID ONCE
 * (`keepAnswers.ts`; the owner's staging setup of 2026-09-27, which lost both). The whole road —
 * Finish answered 409, an answer lost with the server still out of reach, a joiner — is played in
 * `scenarios/accountLifecycle.scenario.test.ts`; these hold the three functions to their word.
 */
import { initialDraft, onboardingReducer, type OnboardingAction } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../prefs';
import { keepSetupAnswers, payOwedTour, SETUP_WELCOME_OWED, tourFromWelcome } from './keepAnswers';
import { loadPendingChildPhoto } from './pending-photo';
import { loadPendingSetup } from './pending-setup';

const UID = 'u-1';
const TOUR = { pending: `tour_pending:${UID}`, done: `tour_done:${UID}` };

const draftWith = (...actions: OnboardingAction[]) =>
  actions.reduce(onboardingReducer, initialDraft('00000000-0000-4000-8000-000000000001'));

const withAnswers = () =>
  draftWith(
    { type: 'set_child_photo', uri: 'file:///setup/ada.jpg' },
    {
      type: 'set_rhythm',
      module: 'diaper',
      rhythm: { mode: 'interval', everyMinutes: 180, night: null },
    },
  );

describe('keepSetupAnswers', () => {
  it('writes the seed, the picture and the tour it owes', async () => {
    const store = memoryStore();
    await keepSetupAnswers(store, UID, withAnswers());
    expect((await loadPendingSetup(store, UID))?.intervals).toEqual([
      { activity: 'diaper', everyMinutes: 180 },
    ]);
    expect(await loadPendingChildPhoto(store, UID)).toEqual({ uri: 'file:///setup/ada.jpg' });
    expect(await store.get(SETUP_WELCOME_OWED(UID))).toBe('1');
  });

  it('an answer taken back since an earlier tap takes the older record with it', async () => {
    const store = memoryStore();
    await keepSetupAnswers(store, UID, withAnswers());
    // the next tap: the rhythm cleared, the picture removed
    await keepSetupAnswers(
      store,
      UID,
      onboardingReducer(onboardingReducer(withAnswers(), { type: 'set_child_photo', uri: null }), {
        type: 'set_rhythm',
        module: 'diaper',
        rhythm: { mode: 'off' },
      }),
    );
    expect(await loadPendingSetup(store, UID)).toBeNull();
    expect(await loadPendingChildPhoto(store, UID)).toBeNull();
  });
});

describe('the tour setup owes', () => {
  it('is paid once, and the debt is gone either way', async () => {
    const store = memoryStore();
    await store.set(SETUP_WELCOME_OWED(UID), '1');
    expect(await payOwedTour(store, UID, TOUR)).toBe(true);
    expect(await store.get(TOUR.pending)).toBe('1');
    expect(await store.get(SETUP_WELCOME_OWED(UID))).toBeNull();
    await store.remove(TOUR.pending);
    expect(await payOwedTour(store, UID, TOUR)).toBe(false);
    expect(await store.get(TOUR.pending)).toBeNull();
  });

  it('is never paid over a tour that has already ended on this phone', async () => {
    const store = memoryStore();
    await store.set(SETUP_WELCOME_OWED(UID), '1');
    await store.set(TOUR.done, 'declined');
    expect(await payOwedTour(store, UID, TOUR)).toBe(false);
    expect(await store.get(TOUR.pending)).toBeNull();
    expect(await store.get(SETUP_WELCOME_OWED(UID))).toBeNull();
  });

  it('is taken back by the welcome’s own button, which arms the tour itself', async () => {
    const store = memoryStore();
    await store.set(SETUP_WELCOME_OWED(UID), '1');
    await tourFromWelcome(store, UID, TOUR);
    expect(await store.get(TOUR.pending)).toBe('1');
    expect(await store.get(SETUP_WELCOME_OWED(UID))).toBeNull();
    expect(await payOwedTour(store, UID, TOUR)).toBe(false);
  });
});
