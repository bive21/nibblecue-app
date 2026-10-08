import { initialDraft, onboardingReducer } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../prefs';
import { clearOnboarding, draftFor, draftKey, loadOnboarding, saveOnboarding } from './draft-store';

const OP = '6f5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f';
/** Only an older build could have written this. Nothing in this one can. */
const gateFromAnOlderBuild = { region: 'US', threshold: 13 as const, passed: true };

describe('the onboarding draft on disk (AUTH_AND_TRIAL.md §2 "abandonable")', () => {
  it('round-trips a draft at step 2 under the user id, carrying no age gate', async () => {
    const store = memoryStore();
    let d = initialDraft(OP);
    d = onboardingReducer(d, { type: 'set_name', value: 'Sam' });
    d = onboardingReducer(d, { type: 'set_role', value: 'parent' });
    // you AND your baby are one page now, so one Continue gets to feeding
    d = onboardingReducer(d, { type: 'set_child_name', value: 'Mia' });
    d = onboardingReducer(d, { type: 'set_birth_date', value: '2026-06-01' });
    d = onboardingReducer(d, { type: 'next', today: '2026-09-14' });
    expect(d.step).toBe(2);
    await saveOnboarding(store, 'u1', d, () => Date.parse('2026-09-14T12:00:00Z'));
    expect(await store.keys()).toEqual([draftKey('u1')]);
    const saved = await loadOnboarding(store, 'u1');
    expect(saved?.draft).toEqual(d);
    // the app no longer asks the account holder's age, so it writes no answer to it
    expect(saved?.age_gate).toBeNull();
    expect(saved?.saved_at).toBe('2026-09-14T12:00:00.000Z');
    expect(await loadOnboarding(store, 'u2')).toBeNull();
    // nothing about the adult — neither the date of birth nor a verdict derived from it
    const written = JSON.stringify(await store.get(draftKey('u1')));
    expect(written).not.toMatch(/dob|date_of_birth/);
    expect(written).not.toMatch(/"passed"/);
  });

  it('resumes a draft an older build saved, and drops the gate it was carrying', async () => {
    // the shape on disk changed under a parent mid-onboarding: it must still open, at the
    // same step, and the answer to a question we no longer ask must not survive the read
    const store = memoryStore({
      [draftKey('u1')]: JSON.stringify({
        draft: { ...initialDraft(OP), step: 2, display_name: 'Sam', role_choice: 'parent' },
        age_gate: gateFromAnOlderBuild,
        saved_at: '2026-09-14T12:00:00.000Z',
      }),
    });
    const resumed = await loadOnboarding(store, 'u1');
    expect(resumed?.draft.step).toBe(2);
    expect(resumed?.draft.display_name).toBe('Sam');
    await saveOnboarding(store, 'u1', resumed!.draft);
    expect(JSON.stringify(await store.get(draftKey('u1')))).not.toMatch(/"passed"/);
  });

  it('opens a draft saved with no age_gate key at all', async () => {
    const store = memoryStore({
      [draftKey('u1')]: JSON.stringify({
        draft: { ...initialDraft(OP), step: 3 },
        saved_at: '2026-09-17T12:00:00.000Z',
      }),
    });
    expect((await loadOnboarding(store, 'u1'))?.draft.step).toBe(3);
  });

  it('resumes the saved draft, or starts fresh with a new client_op_id', async () => {
    const store = memoryStore();
    const fresh = await draftFor(store, 'u1', () => OP);
    expect(fresh.draft).toEqual(initialDraft(OP));
    expect(fresh.age_gate).toBeNull();
    await saveOnboarding(store, 'u1', {
      ...fresh.draft,
      step: 2,
      display_name: 'Sam',
      role_choice: 'parent',
    });
    const resumed = await draftFor(store, 'u1', () => 'never-used');
    expect(resumed.draft.step).toBe(2);
    expect(resumed.draft.client_op_id).toBe(OP);
    await clearOnboarding(store, 'u1');
    expect((await draftFor(store, 'u1', () => OP)).draft.step).toBe(1);
  });

  it('resumes a draft that predates the "where did you hear about us" question as unanswered', async () => {
    const { heard_from: _dropped, ...older } = initialDraft(OP);
    void _dropped;
    const store = memoryStore({
      [draftKey('u1')]: JSON.stringify({
        draft: { ...older, step: 6, display_name: 'Sam' },
        saved_at: '2026-09-17T12:00:00.000Z',
      }),
      // a draft written by a NEWER build, with a key this one has never heard of: the answer
      // falls back to unanswered and everything else the parent typed survives
      [draftKey('u2')]: JSON.stringify({
        draft: { ...initialDraft(OP), step: 6, display_name: 'Ash', heard_from: 'billboard' },
        saved_at: '2026-09-17T12:00:00.000Z',
      }),
      [draftKey('u3')]: JSON.stringify({
        draft: { ...initialDraft(OP), step: 6, heard_from: 'friend' },
        saved_at: '2026-09-17T12:00:00.000Z',
      }),
    });
    const u1 = await loadOnboarding(store, 'u1');
    // 6 was the Plus card, removed on 2026-09-22 (core's `ONBOARD_STEP`); a draft saved on it
    // resumes on the last step this build has rather than failing the parse
    expect(u1?.draft.step).toBe(5);
    expect(u1?.draft.display_name).toBe('Sam');
    expect(u1?.draft.heard_from).toBeNull();
    const u2 = await loadOnboarding(store, 'u2');
    expect(u2?.draft.display_name).toBe('Ash');
    expect(u2?.draft.heard_from).toBeNull();
    expect((await loadOnboarding(store, 'u3'))?.draft.heard_from).toBe('friend');
  });

  /**
   * SOLIDS' MEALS (2026-09-28). A draft saved before the table has no `setMeals`, and resumes with
   * its solids times read by their clock; a draft from a later build naming a meal this one does
   * not know drops that one meal and keeps everything else, the time included.
   */
  it('resumes a draft saved before solids’ meals, and one naming a meal it does not know', async () => {
    const { setMeals: _none, ...older } = initialDraft(OP);
    void _none;
    const store = memoryStore({
      [draftKey('u1')]: JSON.stringify({
        draft: {
          ...older,
          step: 4,
          timing: { solids: 'FIXED' },
          setTimes: { solids: ['07:30', '17:15'] },
        },
        saved_at: '2026-09-27T12:00:00.000Z',
      }),
      [draftKey('u2')]: JSON.stringify({
        draft: {
          ...initialDraft(OP),
          step: 4,
          timing: { solids: 'FIXED' },
          setTimes: { solids: ['07:30', '10:00'] },
          setMeals: {
            solids: [
              { meal: 'BREAKFAST', at: '07:30' },
              { meal: 'ELEVENSES', at: '10:00' },
            ],
          },
        },
        saved_at: '2026-09-29T12:00:00.000Z',
      }),
    });
    const u1 = await loadOnboarding(store, 'u1');
    expect(u1?.draft.step).toBe(4);
    expect(u1?.draft.setMeals).toEqual({});
    expect(u1?.draft.setTimes.solids).toEqual(['07:30', '17:15']);
    const u2 = await loadOnboarding(store, 'u2');
    expect(u2?.draft.setMeals).toEqual({ solids: [{ meal: 'BREAKFAST', at: '07:30' }] });
    expect(u2?.draft.setTimes.solids).toEqual(['07:30', '10:00']);
    // and a draft with meals round-trips whole
    const d = onboardingReducer(initialDraft(OP), {
      type: 'set_rhythm',
      module: 'solids',
      rhythm: {
        mode: 'times',
        times: ['12:00'],
        days: [],
        meals: [{ meal: 'LUNCH', at: '12:00' }],
      },
    });
    const store2 = memoryStore();
    await saveOnboarding(store2, 'u3', d);
    expect((await loadOnboarding(store2, 'u3'))?.draft).toEqual(d);
  });

  it('ignores a corrupt or foreign value instead of crashing the first screen', async () => {
    const store = memoryStore({
      [draftKey('u1')]: '{not json',
      [draftKey('u2')]: JSON.stringify({ draft: { step: 9 } }),
    });
    expect(await loadOnboarding(store, 'u1')).toBeNull();
    expect(await loadOnboarding(store, 'u2')).toBeNull();
  });

  it('keeps "Start your own family"’s draft apart from the first family’s and from another account’s (0154)', async () => {
    const store = memoryStore();
    expect(draftKey('u1', 'own')).not.toBe(draftKey('u1'));
    expect(draftKey('u1', 'own')).not.toBe(draftKey('u2', 'own'));
    const first = onboardingReducer(initialDraft('11111111-1111-4111-8111-111111111111'), {
      type: 'set_child_name',
      value: 'Mia',
    });
    await saveOnboarding(store, 'u1', first);
    // the own flow starts fresh, never on the first family's kept draft
    const own = await draftFor(store, 'u1', () => '22222222-2222-4222-8222-222222222222', 'own');
    expect(own.draft.child_name).toBe('');
    expect(own.draft.client_op_id).toBe('22222222-2222-4222-8222-222222222222');
    await saveOnboarding(store, 'u1', { ...own.draft, child_name: 'Leo' }, Date.now, 'own');
    expect((await loadOnboarding(store, 'u1', 'own'))?.draft.child_name).toBe('Leo');
    expect((await loadOnboarding(store, 'u1'))?.draft.child_name).toBe('Mia');
    expect(await loadOnboarding(store, 'u2', 'own')).toBeNull();
    // letting one go leaves the other
    await clearOnboarding(store, 'u1', 'own');
    expect(await loadOnboarding(store, 'u1', 'own')).toBeNull();
    expect((await loadOnboarding(store, 'u1'))?.draft.child_name).toBe('Mia');
  });
});
