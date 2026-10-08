import { describe, expect, it } from 'vitest';
import {
  birthDateVerdict,
  bootstrapPayloadFrom,
  canAdvance,
  daysBetween,
  defaultHouseholdName,
  DisplayNameSchema,
  draftModules,
  dueDateWithinWindow,
  HEARD_FROM_OPTIONS,
  initialDraft,
  joinRequestFrom,
  LAST_ONBOARDING_STEP,
  onboardingReducer,
  type OnboardingAction,
  type OnboardingDraft,
  pretermWeeks,
  pumpingPartnersOn,
  setupSeedFrom,
  validateBootstrapPayload,
} from './onboarding';
import { FEEDING_CARDS, pumpingWithout } from './setup';

const TODAY = '2026-09-14';
const OP = '6f5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f';
const ctx = {
  locale: 'en-US',
  time_zone: 'America/Chicago',
};

const run = (d: OnboardingDraft, ...actions: OnboardingAction[]) =>
  actions.reduce(onboardingReducer, d);
const next: OnboardingAction = { type: 'next', today: TODAY };
/** Breast and bottles, chosen by hand — the pair the feeding step's Skip used to choose. */
const breastAndBottles: OnboardingAction[] = [
  { type: 'toggle_feeding', card: 'breast' },
  { type: 'toggle_feeding', card: 'bottles' },
];

/**
 * Every feeding card turned off by hand, from the all-on start (the owner, 2026-09-28). The tests
 * below are about what each card does when it is TAPPED ON, so they begin from nothing chosen;
 * "the feeding step starts with every card on" holds the default itself.
 */
const noFeeding: OnboardingAction[] = FEEDING_CARDS.map(c => ({
  type: 'toggle_feeding',
  card: c.id,
}));

/** A draft that has answered steps 1 and 2 the plain way. */
/** Through the merged first page: you AND your baby, one Continue (the owner, 2026-09-17). */
const throughStep1 = () =>
  run(
    initialDraft(OP),
    { type: 'set_name', value: 'Sam' },
    { type: 'set_role', value: 'parent' },
    { type: 'set_child_name', value: 'Mia' },
    { type: 'set_birth_date', value: '2026-06-01' },
    next,
    ...noFeeding,
  );

describe('the date rules (ACCOUNTS.md §3.4)', () => {
  it('accepts a recent birth date, asks to confirm past two years, refuses the future and past eight', () => {
    expect(birthDateVerdict('2026-06-01', TODAY)).toBe('ok');
    expect(birthDateVerdict(TODAY, TODAY)).toBe('ok');
    expect(birthDateVerdict('2024-09-14', TODAY)).toBe('ok'); // exactly two years today
    expect(birthDateVerdict('2024-09-13', TODAY)).toBe('confirm');
    expect(birthDateVerdict('2018-09-14', TODAY)).toBe('confirm'); // exactly eight years today
    expect(birthDateVerdict('2018-09-13', TODAY)).toBe('too_old');
    expect(birthDateVerdict('2026-09-15', TODAY)).toBe('future');
    expect(birthDateVerdict('2026-02-30', TODAY)).toBe('invalid');
    expect(birthDateVerdict('01/06/2026', TODAY)).toBe('invalid');
    expect(birthDateVerdict(null, TODAY)).toBe('invalid');
  });

  it('keeps the due date within a year either side and derives preterm weeks, never typed', () => {
    expect(daysBetween('2026-06-01', '2026-07-13')).toBe(42);
    expect(dueDateWithinWindow('2026-06-01', '2027-06-01')).toBe(true);
    expect(dueDateWithinWindow('2026-06-01', '2027-06-02')).toBe(false);
    expect(dueDateWithinWindow('2026-06-01', '2025-06-01')).toBe(true);
    expect(pretermWeeks('2026-06-01', '2026-07-13')).toBe(6);
    expect(pretermWeeks('2026-06-01', '2026-06-11')).toBe(1.4);
    expect(pretermWeeks('2026-06-01', '2026-05-20')).toBeNull(); // born after the due date: not preterm
    expect(pretermWeeks('2026-06-01', null)).toBeNull();
  });
});

describe('the display name', () => {
  it('is 2–40 characters, trimmed, and never a link', () => {
    expect(DisplayNameSchema.safeParse('  Sam  ').data).toBe('Sam');
    expect(DisplayNameSchema.safeParse('S').success).toBe(false);
    expect(DisplayNameSchema.safeParse('x'.repeat(41)).success).toBe(false);
    expect(DisplayNameSchema.safeParse('https://spam.example').success).toBe(false);
    expect(DisplayNameSchema.safeParse('www.spam.example').success).toBe(false);
    expect(defaultHouseholdName(' Sam ')).toBe("Sam's family");
  });
});

describe('the six steps as a reducer — Back never loses input, nothing is sent before the last', () => {
  it('starts on step 1 with nothing chosen on the steps after the feeding one', () => {
    const d = initialDraft(OP);
    expect(d.step).toBe(1);
    expect(d.client_op_id).toBe(OP);
    expect(d.extras).toEqual({});
  });

  /**
   * EVERY WAY OF FEEDING STARTS ON (the owner, 2026-09-28: *"what if the default is everything on
   * all 4 modules, then they can disable it if they dont want it"*), like every switch on the step
   * after it. A parent who changes nothing continues at once; one who turns all four off is held.
   */
  it('the feeding step starts with every card on, and turning them all off still holds it', () => {
    expect(initialDraft(OP).feeding).toEqual(['breast', 'pumping', 'bottles', 'solids']);
    expect(initialDraft(OP).bottle_suggested).toBe(false);
    const d = run(
      initialDraft(OP),
      { type: 'set_name', value: 'Sam' },
      { type: 'set_role', value: 'parent' },
      { type: 'set_child_name', value: 'Mia' },
      { type: 'set_birth_date', value: '2026-06-01' },
      next,
    );
    expect(d.step).toBe(2);
    expect(canAdvance(d, TODAY)).toEqual({ ok: true });
    for (const m of ['breastfeed', 'pump', 'bottle', 'solids', 'stash'] as const)
      expect(draftModules(d), m).toContain(m);
    // one tap per card takes a way of feeding back, and all four off is the one answer refused
    const noSolids = run(d, { type: 'toggle_feeding', card: 'solids' });
    expect(draftModules(noSolids)).not.toContain('solids');
    expect(canAdvance(run(d, ...noFeeding), TODAY)).toEqual({ ok: false, reason: 'feeding' });
  });

  it('carries a picture chosen on step 1 as a file on this device, and never requires one', () => {
    expect(initialDraft(OP).child_photo_uri).toBeNull();
    const d = run(initialDraft(OP), {
      type: 'set_child_photo',
      uri: 'file:///cache/cuddlecue/setup-photo/u1.jpg',
    });
    expect(d.child_photo_uri).toBe('file:///cache/cuddlecue/setup-photo/u1.jpg');
    expect(run(d, { type: 'set_child_photo', uri: null }).child_photo_uri).toBeNull();
    // step 1 is satisfied with or without one
    expect(throughStep1().step).toBe(2);
  });

  it('step 1 needs a name, a role and the baby date', () => {
    const d = initialDraft(OP);
    expect(canAdvance(d, TODAY)).toEqual({ ok: false, reason: 'display_name' });
    expect(onboardingReducer(d, next).step).toBe(1); // next is a no-op when it cannot advance
    const named = run(d, { type: 'set_name', value: 'Sam' });
    expect(canAdvance(named, TODAY)).toEqual({ ok: false, reason: 'role_choice' });
    const withRole = run(named, { type: 'set_role', value: 'caregiver' });
    // ...and the baby, because the two pages are one page now
    expect(canAdvance(withRole, TODAY)).toEqual({ ok: false, reason: 'child_name' });
    const ready = run(
      withRole,
      { type: 'set_child_name', value: 'Mia' },
      { type: 'set_birth_date', value: '2026-06-01' },
    );
    expect(canAdvance(ready, TODAY)).toEqual({ ok: true });
    expect(onboardingReducer(ready, next).step).toBe(2);
  });

  describe('step 1 for somebody holding an invite (the first-day trace, 2026-09-25)', () => {
    it('asks a joiner their name and nothing else: no role, no household, no baby', () => {
      const d = initialDraft(OP);
      expect(canAdvance(d, TODAY, 'join')).toEqual({ ok: false, reason: 'display_name' });
      const named = run(d, { type: 'set_name', value: 'Mia' });
      // the setup path still refuses the same draft, for the role and then the baby…
      expect(canAdvance(named, TODAY)).toEqual({ ok: false, reason: 'role_choice' });
      expect(canAdvance(named, TODAY, 'setup')).toEqual({ ok: false, reason: 'role_choice' });
      // …and the join path does not: the invite carries the role, the household has the baby
      expect(canAdvance(named, TODAY, 'join')).toEqual({ ok: true });
      expect(named.role_choice).toBeNull();
      expect(named.child_name).toBe('');
      expect(named.birth_date).toBeNull();
    });

    it('holds the name to the same rule the server does', () => {
      for (const bad of ['', ' ', 'M', 'x'.repeat(41), 'see www.example.com'])
        expect(
          canAdvance(run(initialDraft(OP), { type: 'set_name', value: bad }), TODAY, 'join'),
          JSON.stringify(bad),
        ).toEqual({ ok: false, reason: 'display_name' });
      expect(
        canAdvance(run(initialDraft(OP), { type: 'set_name', value: '  Mia  ' }), TODAY, 'join'),
      ).toEqual({ ok: true });
    });

    it('ignores whatever a setup started before the invite left in the draft', () => {
      // a baby born in the future, a one-letter household and a due date out of range would each
      // stop setup; none of them is a joiner's question, so none of them stops the join
      const leftovers = run(
        initialDraft(OP),
        { type: 'set_name', value: 'Mia' },
        { type: 'set_household_name', value: 'x' },
        { type: 'set_birth_date', value: '2030-01-01' },
        { type: 'set_born_early', value: true },
      );
      expect(canAdvance(leftovers, TODAY).ok).toBe(false);
      expect(canAdvance(leftovers, TODAY, 'join')).toEqual({ ok: true });
      // and on whatever step the draft was resumed at
      expect(canAdvance({ ...leftovers, step: 3 }, TODAY, 'join')).toEqual({ ok: true });
    });

    it('sends accept-invite the invite and the name, and nothing else from the draft', () => {
      const d = run(
        throughStep1(),
        { type: 'set_name', value: '  Mia  ' },
        { type: 'set_household_name', value: 'The other family' },
      );
      expect(joinRequestFrom(d, { code: '482916' })).toEqual({
        code: '482916',
        display_name: 'Mia',
      });
      const token = 'tok_abcdefghijklmnopqrstu';
      expect(joinRequestFrom(d, { token })).toEqual({ token, display_name: 'Mia' });
      // a token wins over a code, as `accept_invite` reads them
      expect(joinRequestFrom(d, { code: '482916', token })).toEqual({ token, display_name: 'Mia' });
      // what `accept_invite` (0124) accepts, and only that
      expect(Object.keys(joinRequestFrom(d, { code: '482916' })).sort()).toEqual([
        'code',
        'display_name',
      ]);
    });
  });

  it('step 1 needs a birth date too, and confirms a date past two years', () => {
    const d = run(
      initialDraft(OP),
      { type: 'set_name', value: 'Sam' },
      { type: 'set_role', value: 'parent' },
    );
    expect(canAdvance(d, TODAY)).toEqual({ ok: false, reason: 'child_name' });
    const named = run(d, { type: 'set_child_name', value: 'Mia' });
    expect(canAdvance(named, TODAY)).toEqual({ ok: false, reason: 'birth_date.invalid' });
    expect(canAdvance(run(named, { type: 'set_birth_date', value: '2026-12-25' }), TODAY)).toEqual({
      ok: false,
      reason: 'birth_date.future',
    });
    expect(canAdvance(run(named, { type: 'set_birth_date', value: '2010-01-01' }), TODAY)).toEqual({
      ok: false,
      reason: 'birth_date.too_old',
    });
    const older = run(named, { type: 'set_birth_date', value: '2023-03-10' });
    expect(canAdvance(older, TODAY)).toEqual({ ok: false, reason: 'birth_date.confirm' });
    const confirmed = run(older, { type: 'confirm_birth_date' });
    expect(canAdvance(confirmed, TODAY)).toEqual({ ok: true });
    // changing the date drops the confirmation
    expect(run(confirmed, { type: 'set_birth_date', value: '2023-03-11' }).birth_confirmed).toBe(
      false,
    );
    // the household name defaults from the parent's name and can be overridden
    expect(
      canAdvance(
        run(
          named,
          { type: 'set_birth_date', value: '2026-06-01' },
          { type: 'set_household_name', value: 'x' },
        ),
        TODAY,
      ),
    ).toEqual({
      ok: false,
      reason: 'household_name',
    });
  });

  it('step 2 asks for a due date only when the baby came early, and keeps it within the window', () => {
    const d = run(
      initialDraft(OP),
      { type: 'set_name', value: 'Sam' },
      { type: 'set_role', value: 'parent' },
      next,
      { type: 'set_child_name', value: 'Mia' },
      {
        type: 'set_birth_date',
        value: '2026-06-01',
      },
    );
    const early = run(d, { type: 'set_born_early', value: true });
    expect(canAdvance(early, TODAY)).toEqual({ ok: false, reason: 'due_date' });
    expect(canAdvance(run(early, { type: 'set_due_date', value: '2028-01-01' }), TODAY)).toEqual({
      ok: false,
      reason: 'due_date.window',
    });
    const due = run(early, { type: 'set_due_date', value: '2026-07-13' });
    expect(canAdvance(due, TODAY)).toEqual({ ok: true });
    // turning "born early" off clears the due date so it is never sent by accident
    expect(run(due, { type: 'set_born_early', value: false }).due_date).toBeNull();
  });

  /**
   * NO SKIP (the owner, 2026-09-24: "we dont want to encourage users to skip onboarding", then
   * "remove skip for now"). The day, the Log tiles and the rhythms are all built from this answer,
   * so Continue waits for one card and nothing stands in for it.
   */
  it('step 2 cannot be left with no way to log a feed, and nothing stands in for one', () => {
    const d = throughStep1();
    expect(d.step).toBe(2);
    expect(canAdvance(d, TODAY)).toEqual({ ok: false, reason: 'feeding' });
    const chosen = run(d, { type: 'toggle_feeding', card: 'bottles' });
    expect(canAdvance(chosen, TODAY)).toEqual({ ok: true });
    // taking the only card back closes the step again
    const unchosen = run(chosen, { type: 'toggle_feeding', card: 'bottles' });
    expect(unchosen.feeding).toEqual([]);
    expect(canAdvance(unchosen, TODAY)).toEqual({ ok: false, reason: 'feeding' });
    expect('feeding_skipped' in unchosen).toBe(false);
  });

  it('step 3 selects bottles with pumping once, visibly, and respects the parent deselecting them', () => {
    const pumping = run(throughStep1(), { type: 'toggle_feeding', card: 'pumping' });
    expect(pumping.feeding).toEqual(['pumping', 'bottles']); // the suggestion is a selected card, said out loud
    expect(pumping.bottle_suggested).toBe(true);
    expect(draftModules(pumping)).toEqual([
      'bottle',
      'pump',
      'diaper',
      'sleep',
      'med',
      'growth',
      'temp',
      'tummy',
      'bath',
      'vaccine',
      // the Health note, on with the health record (2026-10-08)
      'wellbeing',
      'stash',
    ]);
    // deselecting bottles stands: the suggestion is applied once, not a lock
    const off = run(pumping, { type: 'toggle_feeding', card: 'bottles' });
    expect(off.feeding).toEqual(['pumping']);
    expect(draftModules(off)).not.toContain('bottle');
    expect(draftModules(off)).toContain('pump');
    // pumping off and on again does not re-suggest
    const again = run(
      off,
      { type: 'toggle_feeding', card: 'pumping' },
      { type: 'toggle_feeding', card: 'pumping' },
    );
    expect(again.feeding).toEqual(['pumping']);
    // choosing bottles first is the parent's own choice, never a suggestion
    const chosen = run(
      throughStep1(),
      { type: 'toggle_feeding', card: 'bottles' },
      { type: 'toggle_feeding', card: 'pumping' },
    );
    expect(chosen.feeding).toEqual(['bottles', 'pumping']);
    expect(chosen.bottle_suggested).toBe(false);
  });

  /**
   * THE CARD IS THE ANSWER, WHICHEVER CARD CAME FIRST (2026-09-25). Bottles chosen BEFORE Pumping is
   * never a suggestion, so `bottle_suggested` stays false — and `draftModules` used to hand that to
   * `modulesForFeeding`, which then suggested bottles all over again the moment the card was turned
   * off. The household got a bottle module under a card reading off. The pumping question made it
   * a promise broken to the parent's face ("Keep it off"), so the suggestion now lives on the cards
   * alone, where the reducer puts it.
   */
  it('step 2 keeps bottles off when the parent turns them off, whichever card came first', () => {
    const off = run(
      throughStep1(),
      { type: 'toggle_feeding', card: 'bottles' },
      { type: 'toggle_feeding', card: 'pumping' },
      { type: 'toggle_feeding', card: 'bottles' },
    );
    expect(off.feeding).toEqual(['pumping']);
    expect(off.bottle_suggested).toBe(false);
    expect(draftModules(off)).not.toContain('bottle');
    expect(draftModules(off)).toContain('pump');
    expect(bootstrapPayloadFrom(off, ctx).modules).not.toContain('bottle');
    // and a card that is on is still on, suggested or chosen
    const suggested = run(throughStep1(), { type: 'toggle_feeding', card: 'pumping' });
    expect(draftModules(suggested)).toContain('bottle');
  });

  it('step 3 records each switch; steps 3 to 5 always advance; back never loses anything', () => {
    const d = run(throughStep1(), { type: 'toggle_feeding', card: 'breast' }, next);
    expect(d.step).toBe(3);
    expect(canAdvance(d, TODAY)).toEqual({ ok: true });
    const changed = run(
      d,
      { type: 'toggle_extra', module: 'med', value: false },
      { type: 'toggle_extra', module: 'diaper', value: false },
    );
    expect(draftModules(changed)).not.toContain('med');
    expect(draftModules(changed)).not.toContain('diaper');
    const atLast = run(changed, next, next, next);
    expect(atLast.step).toBe(LAST_ONBOARDING_STEP);
    // the last button is the bootstrap call, not "next"
    expect(onboardingReducer(atLast, next).step).toBe(LAST_ONBOARDING_STEP);
    const back = run(
      atLast,
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
    );
    expect(back.step).toBe(1);
    expect(onboardingReducer(back, { type: 'back' }).step).toBe(1);
    expect(back.display_name).toBe('Sam');
    expect(back.child_name).toBe('Mia');
    expect(back.feeding).toEqual(['breast']);
    expect(back.extras).toEqual({ med: false, diaper: false });
    expect(back.client_op_id).toBe(OP); // the same id on every retry
    expect(onboardingReducer(back, { type: 'reset', clientOpId: 'other' })).toEqual(
      initialDraft('other'),
    );
  });

  /**
   * STEP 5 — how often, and any medicines (the owner, 2026-09-16: "schedule interval should be
   * a part of the new account creation setup, along with adding any medications / supplements").
   * Every answer here is optional and none of it goes in the bootstrap payload: they are
   * ordinary local-first writes the app makes once the household exists.
   */
  describe('step 4 — the rhythms and the medicines', () => {
    const atFour = () =>
      run(throughStep1(), { type: 'toggle_feeding', card: 'breast' }, next, next);

    it('always advances, and starts with nothing chosen', () => {
      const d = atFour();
      expect(d.step).toBe(4);
      expect(canAdvance(d, TODAY)).toEqual({ ok: true });
      expect(setupSeedFrom(d)).toEqual({
        intervals: [],
        setTimes: [],
        bedtime: null,
        cadences: [],
        timesADay: [],
        goals: [],
        medicines: [],
        quietHours: null,
        dayWindow: null,
        volumeUnit: null,
        supplies: [],
      });
    });

    it('records an interval, a rhythm in days and a medicine, and takes each back', () => {
      const d = run(
        atFour(),
        { type: 'set_interval', module: 'breastfeed', minutes: 180 },
        { type: 'set_cadence', module: 'bath', days: 2 },
        {
          type: 'add_medicine',
          medicine: { id: 'm1', name: 'Vitamin D', kind: 'VITAMIN', times: ['08:00'] },
        },
      );
      expect(setupSeedFrom(d)).toEqual({
        // the night rides along, preselected an hour past the day's own 180 (2026-09-22)
        intervals: [
          {
            activity: 'breastfeed',
            everyMinutes: 180,
            night: { mode: 'LONGER', everyMinutes: 240 },
          },
        ],
        setTimes: [],
        bedtime: null,
        cadences: [{ activity: 'bath', everyDays: 2 }],
        timesADay: [],
        goals: [],
        medicines: [{ id: 'm1', name: 'Vitamin D', kind: 'VITAMIN', times: ['08:00'] }],
        quietHours: null,
        dayWindow: null,
        volumeUnit: null,
        supplies: [],
      });
      // a second tap on the chosen chip is the way back to no rhythm at all
      const cleared = run(
        d,
        { type: 'set_interval', module: 'breastfeed', minutes: null },
        { type: 'set_cadence', module: 'bath', days: null },
        { type: 'remove_medicine', id: 'm1' },
      );
      expect(setupSeedFrom(cleared)).toEqual({
        intervals: [],
        setTimes: [],
        bedtime: null,
        cadences: [],
        timesADay: [],
        goals: [],
        medicines: [],
        quietHours: null,
        dayWindow: null,
        volumeUnit: null,
        supplies: [],
      });
    });

    it('preselects the night an hour past the day, but never fights an answer already there', () => {
      // the owner, 2026-09-22: "preselect the option +1 hour from whatever the default for
      // during the day... remember user can always change this, dont worry about preselecting"
      const d = run(atFour(), { type: 'set_interval', module: 'diaper', minutes: 120 });
      expect(d.night.diaper).toEqual({ mode: 'LONGER', everyMinutes: 180 });
      // a second day change never overwrites a night the household already has AN ANSWER for —
      // and the preselect just made is already an answer, the same as if they had tapped a chip
      const movedDay = onboardingReducer(d, {
        type: 'set_interval',
        module: 'diaper',
        minutes: 180,
      });
      expect(movedDay.night.diaper).toEqual({ mode: 'LONGER', everyMinutes: 180 });
      // and it is exactly as free to change as any other night as soon as the parent taps one
      const chosen = onboardingReducer(d, {
        type: 'set_night',
        module: 'diaper',
        mode: 'PAUSE',
        everyMinutes: null,
      });
      expect(chosen.night.diaper).toEqual({ mode: 'PAUSE', everyMinutes: null });
      // clearing the day back to nothing never invents a night for a rhythm with none
      const cleared = onboardingReducer(atFour(), {
        type: 'set_interval',
        module: 'diaper',
        minutes: null,
      });
      expect(cleared.night.diaper).toBeUndefined();
    });

    it('never seeds a rhythm for a module the parent turned off, or a medicine with no name', () => {
      const d = run(
        atFour(),
        { type: 'set_interval', module: 'tummy', minutes: 240 },
        { type: 'set_cadence', module: 'bath', days: 1 },
        {
          type: 'add_medicine',
          medicine: { id: 'm2', name: '   ', kind: 'MEDICINE', times: ['08:00'] },
        },
        { type: 'back' },
        { type: 'toggle_extra', module: 'tummy', value: false },
        { type: 'toggle_extra', module: 'bath', value: false },
      );
      expect(setupSeedFrom(d)).toEqual({
        intervals: [],
        setTimes: [],
        bedtime: null,
        cadences: [],
        timesADay: [],
        goals: [],
        medicines: [],
        quietHours: null,
        dayWindow: null,
        volumeUnit: null,
        supplies: [],
      });
    });

    /**
     * QUIET HOURS ARE ANSWERED ONCE AND REACH THE SEED WHOLE (the owner, 2026-09-17: "also ask
     * about the quite hour if they want this enabled or not"). Off is a real answer, not a
     * missing one: `null` means the seeder writes no preference at all and the household keeps
     * reminders at any hour, so the test holds both directions.
     */
    it('carries the quiet-hours answer, and off stays off', () => {
      const on = run(atFour(), { type: 'set_quiet_hours', hours: { from: '21:30', to: '06:15' } });
      expect(setupSeedFrom(on).quietHours).toEqual({ from: '21:30', to: '06:15' });
      const off = run(on, { type: 'set_quiet_hours', hours: null });
      expect(setupSeedFrom(off).quietHours).toBeNull();
    });

    /**
     * THE WAKING WINDOW IS THE SAME BARGAIN (the owner, 2026-09-18: "where is the interval for
     * bed time? add this new module to it"). Untouched stays null, and null means the seeder
     * writes NO ROW — so a household that walked past the question reads the default pair on
     * every device, which is where they were before the question existed.
     */
    it('carries the waking window, and leaves null when it was never touched', () => {
      const untouched = atFour();
      expect(setupSeedFrom(untouched).dayWindow).toBeNull();
      const set = run(untouched, {
        type: 'set_day_window',
        window: { wake: '08:00', bed: '21:00' },
      });
      expect(setupSeedFrom(set).dayWindow).toEqual({ wake: '08:00', bed: '21:00' });
      // and it is not quiet hours: setting one leaves the other alone
      expect(setupSeedFrom(set).quietHours).toBeNull();
    });

    /**
     * A MORNING REMINDER KEEPS TO THE DAY'S START (the owner, 2026-09-30: vitamin D *"depends on
     * when baby's day starts. if it start at 7.30, then set 7.30, if 8.30, then 8.30"*). The app
     * offers "Morning" at the wake time; move the wake time and a medicine's morning follows it,
     * while its other times stay where the parent put them.
     */
    it('moves a morning reminder with the wake time, and leaves every other time alone', () => {
      const d = run(
        atFour(),
        { type: 'set_day_window', window: { wake: '07:30', bed: '19:30' } },
        {
          type: 'add_medicine',
          medicine: { id: 'm1', name: 'Vitamin D drops', kind: 'VITAMIN', times: ['07:30'] },
        },
        {
          type: 'add_medicine',
          medicine: { id: 'm2', name: 'Cream', kind: 'CREAM', times: ['07:30', '21:00'] },
        },
        { type: 'set_day_window', window: { wake: '08:30', bed: '19:30' } },
      );
      expect(d.medicines.map(m => m.times)).toEqual([['08:30'], ['08:30', '21:00']]);
      // the bed time moving alone moves nothing
      const e = run(d, { type: 'set_day_window', window: { wake: '08:30', bed: '20:00' } });
      expect(e.medicines).toBe(d.medicines);
      // a day never set starts at the default wake time, and a morning there follows the first move
      const f = run(
        atFour(),
        {
          type: 'add_medicine',
          medicine: { id: 'm3', name: 'Vitamin D drops', kind: 'VITAMIN', times: ['07:00'] },
        },
        { type: 'set_day_window', window: { wake: '06:45', bed: '19:30' } },
      );
      expect(f.medicines[0]?.times).toEqual(['06:45']);
      // a wake time moved onto another of its times leaves one reminder there, not two
      const g = run(
        atFour(),
        {
          type: 'add_medicine',
          medicine: { id: 'm4', name: 'Drops', kind: 'MEDICINE', times: ['07:00', '12:00'] },
        },
        { type: 'set_day_window', window: { wake: '12:00', bed: '23:00' } },
      );
      expect(g.medicines[0]?.times).toEqual(['12:00']);
    });

    /**
     * STEP 6 — THE BRANDS (the owner, 2026-09-16: "add one more option that lets you to enter
     * brand of each items used for the baby (to fill out supplies), but have the option to do
     * this later").
     *
     * A brand is seeded WHATEVER THE MODULES SAY, unlike a rhythm. A rhythm for a module that is
     * off would put a schedule on a tab for something the app is not tracking; a catalog entry
     * is just a note about what this household buys, and Supplies draws every category anyway.
     */
    it('seeds a named brand per category, in catalog order, and clears on an empty string', () => {
      const d = run(
        atFour(),
        { type: 'set_supply_brand', category: 'WIPES', brand: 'WaterWipes' },
        { type: 'set_supply_brand', category: 'DIAPERS', brand: '  Pampers  ' },
      );
      // DIAPERS comes before WIPES in SUPPLY_CATEGORIES, whatever order they were typed in
      expect(setupSeedFrom(d).supplies).toEqual([
        { category: 'DIAPERS', brand: 'Pampers' },
        { category: 'WIPES', brand: 'WaterWipes' },
      ]);
      const cleared = run(d, { type: 'set_supply_brand', category: 'DIAPERS', brand: '   ' });
      expect(cleared.supply_brands.DIAPERS).toBeUndefined();
      expect(setupSeedFrom(cleared).supplies).toEqual([{ category: 'WIPES', brand: 'WaterWipes' }]);
    });

    /**
     * SEVERAL PRODUCTS ON ONE SHELF (the owner, 2026-10-02: three creams under Creams and balm).
     * The first uses the category id as its entry key; further ones are slots beside it.
     */
    it('seeds several brands in the same category, in the order they were added', () => {
      const d = run(
        atFour(),
        { type: 'set_supply_brand', category: 'CREAM', brand: 'Desitin' },
        { type: 'add_supply_slot', id: 'cream-2', category: 'CREAM' },
        { type: 'set_supply_brand', category: 'cream-2', brand: 'Vaseline' },
        { type: 'add_supply_slot', id: 'cream-3', category: 'CREAM' },
        { type: 'set_supply_brand', category: 'cream-3', brand: 'Hydrocortisone' },
        {
          type: 'set_supply_detail',
          category: 'cream-3',
          field: 'notes',
          value: '1% tube',
        },
      );
      expect(setupSeedFrom(d).supplies).toEqual([
        { category: 'CREAM', brand: 'Desitin' },
        { category: 'CREAM', brand: 'Vaseline' },
        { category: 'CREAM', brand: 'Hydrocortisone', details: { notes: '1% tube' } },
      ]);
      // clearing an extra removes the slot; the first of the shelf stays
      const cleared = run(d, { type: 'set_supply_brand', category: 'cream-2', brand: '' });
      expect(cleared.supply_slots.map(s => s.id)).toEqual(['cream-3']);
      expect(setupSeedFrom(cleared).supplies).toEqual([
        { category: 'CREAM', brand: 'Desitin' },
        { category: 'CREAM', brand: 'Hydrocortisone', details: { notes: '1% tube' } },
      ]);
      // a slot id that collides with a category id is refused (those keys are the first of each)
      const refused = run(atFour(), { type: 'add_supply_slot', id: 'CREAM', category: 'CREAM' });
      expect(refused.supply_slots).toEqual([]);
    });

    /** Two lists of the same brand (the owner, 2026-10-03) — both slots reach the seed. */
    it('seeds two slots of the same brand on one shelf', () => {
      const d = run(
        atFour(),
        { type: 'set_supply_brand', category: 'DIAPERS', brand: 'Pampers' },
        {
          type: 'set_supply_detail',
          category: 'DIAPERS',
          field: 'notes',
          value: 'Size 2',
        },
        { type: 'add_supply_slot', id: 'diapers-2', category: 'DIAPERS' },
        { type: 'set_supply_brand', category: 'diapers-2', brand: 'Pampers' },
        {
          type: 'set_supply_detail',
          category: 'diapers-2',
          field: 'notes',
          value: 'Size 3',
        },
      );
      expect(setupSeedFrom(d).supplies).toEqual([
        { category: 'DIAPERS', brand: 'Pampers', details: { notes: 'Size 2' } },
        { category: 'DIAPERS', brand: 'Pampers', details: { notes: 'Size 3' } },
      ]);
    });

    /**
     * THE FIELD HOLDS WHAT WAS TYPED. This reducer used to `.trim()` every keystroke, so the
     * space in a two-word brand never survived one: the draft went back as "Water", the field
     * re-rendered as "Water", and the cursor never moved. Every brand on the shelf with a space
     * in it was unreachable (the owner, 2026-09-17: "spaces are not allowed to input").
     */
    it('lets a space through mid-word, so a two-word brand can be typed at all', () => {
      const typed = ['W', 'Wa', 'Wat', 'Wate', 'Water', 'Water ', 'Water W', 'Water Wipes'];
      let d = atFour();
      for (const brand of typed) d = run(d, { type: 'set_supply_brand', category: 'WIPES', brand });
      // every intermediate value is kept verbatim, the trailing space included
      expect(d.supply_brands.WIPES).toBe('Water Wipes');

      const mid = run(atFour(), { type: 'set_supply_brand', category: 'WIPES', brand: 'Water ' });
      expect(mid.supply_brands.WIPES).toBe('Water ');
      // and the catalog still gets it tidied, which is where trimming belongs
      expect(setupSeedFrom(mid).supplies).toEqual([{ category: 'WIPES', brand: 'Water' }]);
    });

    it('keeps a brand for a module the parent turned off — a catalog is not a schedule', () => {
      const d = run(
        atFour(),
        { type: 'set_supply_brand', category: 'DIAPERS', brand: 'Pampers' },
        { type: 'back' },
        { type: 'back' },
        { type: 'toggle_extra', module: 'diaper', value: false },
      );
      expect(draftModules(d)).not.toContain('diaper');
      expect(setupSeedFrom(d).supplies).toEqual([{ category: 'DIAPERS', brand: 'Pampers' }]);
    });

    it('drops a category this build does not know rather than filing it under OTHER', () => {
      const d = run(atFour(), { type: 'set_supply_brand', category: 'JETPACKS', brand: 'Acme' });
      expect(setupSeedFrom(d).supplies).toEqual([]);
    });

    it('drops every medicine when the medicine module itself is off', () => {
      const d = run(
        atFour(),
        {
          type: 'add_medicine',
          medicine: { id: 'm3', name: 'Barrier cream', kind: 'CREAM', times: [] },
        },
        { type: 'back' },
        { type: 'toggle_extra', module: 'med', value: false },
      );
      expect(setupSeedFrom(d).medicines).toEqual([]);
    });

    it('seeds in registry order, whatever order the chips were tapped in', () => {
      // pumping is a feeding card, not an extra: it is turned on back on the feeding step
      const pumping = () =>
        run(
          throughStep1(),
          { type: 'toggle_feeding', card: 'breast' },
          { type: 'toggle_feeding', card: 'pumping' },
          next,
          next,
        );
      const d = run(
        pumping(),
        { type: 'set_interval', module: 'diaper', minutes: 150 },
        { type: 'set_interval', module: 'pump', minutes: 240 },
        { type: 'set_interval', module: 'breastfeed', minutes: 180 },
      );
      const order = setupSeedFrom(d).intervals.map(i => i.activity);
      expect([...order].sort()).toEqual(['breastfeed', 'diaper', 'pump']);
      // the registry decides, not the taps: reversing the taps changes nothing
      const reversed = run(
        pumping(),
        { type: 'set_interval', module: 'breastfeed', minutes: 180 },
        { type: 'set_interval', module: 'pump', minutes: 240 },
        { type: 'set_interval', module: 'diaper', minutes: 150 },
      );
      expect(setupSeedFrom(reversed).intervals.map(i => i.activity)).toEqual(order);
    });

    /**
     * THE RULE SHEET'S ANSWER, WHOLE (the owner, 2026-09-24: "make sure whats being asked, and how
     * it's gonna answer mimic how it is in interval manage / rhythm page"). Setup now opens the
     * Routine page's own sheet, and its Save hands back one complete answer — which is what these
     * hold: every way the sheet can state a rhythm reaches the seed, and a Save replaces the last
     * answer rather than mixing with it.
     */
    describe('one whole answer from the Rule sheet (`set_rhythm`)', () => {
      const withAll = () =>
        run(
          run(
            throughStep1(),
            { type: 'toggle_feeding', card: 'breast' },
            { type: 'toggle_feeding', card: 'pumping' },
            next,
            next,
          ),
          { type: 'toggle_extra', module: 'bath', value: true },
          { type: 'toggle_extra', module: 'tummy', value: true },
          { type: 'toggle_extra', module: 'sleep', value: true },
        );

      it('seeds custom set times on chosen weekdays — any minute, not a preset', () => {
        const d = run(withAll(), {
          type: 'set_rhythm',
          module: 'breastfeed',
          rhythm: { mode: 'times', times: ['19:45', '07:10', '07:10'], days: [5, 1, 3] },
        });
        expect(d.timing.breastfeed).toBe('FIXED');
        expect(setupSeedFrom(d).setTimes).toEqual([
          { activity: 'breastfeed', times: ['07:10', '19:45'], days: [1, 3, 5] },
        ]);
        // every day is no days at all — the rule repeats DAILY
        const daily = run(withAll(), {
          type: 'set_rhythm',
          module: 'breastfeed',
          rhythm: { mode: 'times', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6] },
        });
        expect(setupSeedFrom(daily).setTimes).toEqual([
          { activity: 'breastfeed', times: ['08:00'] },
        ]);
      });

      it('seeds a custom interval and a night that is its own — once a night, at its own time', () => {
        const d = run(withAll(), {
          type: 'set_rhythm',
          module: 'pump',
          rhythm: {
            mode: 'interval',
            everyMinutes: 165,
            night: { mode: 'ONE', everyMinutes: null, at: '02:30' },
          },
        });
        expect(setupSeedFrom(d).intervals).toEqual([
          {
            activity: 'pump',
            everyMinutes: 165,
            night: { mode: 'ONE', everyMinutes: null, at: '02:30' },
          },
        ]);
      });

      it('seeds a bath on chosen days at its own time, and a daily goal', () => {
        const d = run(
          withAll(),
          {
            type: 'set_rhythm',
            module: 'bath',
            rhythm: { mode: 'cadence', everyDays: 2, days: [6, 2], at: '19:15' },
          },
          { type: 'set_rhythm', module: 'tummy', rhythm: { mode: 'quota', minutes: 25 } },
        );
        const seed = setupSeedFrom(d);
        expect(seed.cadences).toEqual([
          { activity: 'bath', everyDays: 2, days: [2, 6], at: '19:15' },
        ]);
        expect(seed.goals).toEqual([{ activity: 'tummy', minutes: 25 }]);
      });

      it('makes tummy time set times OR a goal, never both', () => {
        const d = run(
          withAll(),
          { type: 'set_rhythm', module: 'tummy', rhythm: { mode: 'quota', minutes: 30 } },
          {
            type: 'set_rhythm',
            module: 'tummy',
            rhythm: { mode: 'times', times: ['10:00', '15:00'], days: [] },
          },
        );
        const seed = setupSeedFrom(d);
        expect(seed.goals).toEqual([]);
        expect(seed.setTimes).toEqual([{ activity: 'tummy', times: ['10:00', '15:00'] }]);
      });

      it('replaces the last answer whole: times after an interval leave no interval behind', () => {
        const d = run(
          withAll(),
          { type: 'set_interval', module: 'breastfeed', minutes: 180 },
          {
            type: 'set_rhythm',
            module: 'breastfeed',
            rhythm: { mode: 'times', times: ['09:00'], days: [] },
          },
        );
        expect(d.intervals.breastfeed).toBeUndefined();
        expect(d.night.breastfeed).toBeUndefined();
        expect(setupSeedFrom(d).intervals).toEqual([]);
      });

      it('keeps Off as an answer, so nothing of the row is seeded and nothing re-fills it', () => {
        const d = run(
          withAll(),
          { type: 'set_cadence', module: 'bath', days: 2 },
          { type: 'set_rhythm', module: 'bath', rhythm: { mode: 'off' } },
        );
        expect(d.timing.bath).toBe('OFF');
        expect(setupSeedFrom(d).cadences).toEqual([]);
        // and a set of no times is Off too, never an empty rule
        const none = run(withAll(), {
          type: 'set_rhythm',
          module: 'breastfeed',
          rhythm: { mode: 'times', times: [], days: [] },
        });
        expect(none.timing.breastfeed).toBe('OFF');
        expect(setupSeedFrom(none).setTimes).toEqual([]);
      });

      /**
       * SOLIDS AS MEALS (the owner, 2026-09-28: "make sure managing it on onboarding, brings over
       * to the actual app"). The table's rows that are on travel as meals beside their times, and
       * the seed names each rule for its meal; the app's `seed.test.ts` writes them and reopens
       * the Routine page's form on them.
       */
      it('seeds solids as meals, each time with its meal, in clock order', () => {
        const d = run(
          withAll(),
          { type: 'toggle_feeding', card: 'solids' },
          {
            type: 'set_rhythm',
            module: 'solids',
            rhythm: {
              mode: 'times',
              times: ['17:30', '07:30'],
              days: [],
              meals: [
                { meal: 'DINNER', at: '17:30' },
                { meal: 'BREAKFAST', at: '07:30' },
              ],
            },
          },
        );
        expect(d.setMeals.solids).toEqual([
          { meal: 'BREAKFAST', at: '07:30' },
          { meal: 'DINNER', at: '17:30' },
        ]);
        expect(setupSeedFrom(d).setTimes).toEqual([
          {
            activity: 'solids',
            times: ['07:30', '17:30'],
            meals: [
              { meal: 'BREAKFAST', at: '07:30' },
              { meal: 'DINNER', at: '17:30' },
            ],
          },
        ]);
        // two meals set to one time are two meals, and one time
        const same = run(d, {
          type: 'set_rhythm',
          module: 'solids',
          rhythm: {
            mode: 'times',
            times: ['12:00'],
            days: [1, 2, 3, 4, 5],
            meals: [
              { meal: 'SNACK', at: '12:00' },
              { meal: 'LUNCH', at: '12:00' },
            ],
          },
        });
        expect(setupSeedFrom(same).setTimes).toEqual([
          {
            activity: 'solids',
            times: ['12:00'],
            days: [1, 2, 3, 4, 5],
            meals: [
              { meal: 'LUNCH', at: '12:00' },
              { meal: 'SNACK', at: '12:00' },
            ],
          },
        ]);
      });

      it('reads an older draft’s solids times by their clock, and still seeds the one no meal takes', () => {
        // a draft saved before the table: timing and times, no meals
        const d = run(
          withAll(),
          { type: 'toggle_feeding', card: 'solids' },
          { type: 'set_timing', module: 'solids', timing: 'FIXED' },
          { type: 'set_set_times', module: 'solids', times: ['07:00', '08:00', '09:00', '09:30'] },
        );
        expect(d.setMeals.solids).toBeUndefined();
        expect(setupSeedFrom(d).setTimes).toEqual([
          {
            activity: 'solids',
            times: ['07:00', '08:00', '09:00', '09:30'],
            meals: [
              { meal: 'BREAKFAST', at: '07:00' },
              { meal: 'SNACK', at: '08:00' },
              { meal: 'SNACK', at: '09:00' },
            ],
          },
        ]);
      });

      it('keeps meals to solids, and lets no stale list outlive the times it named', () => {
        const d = run(
          withAll(),
          { type: 'toggle_feeding', card: 'solids' },
          {
            type: 'set_rhythm',
            module: 'solids',
            rhythm: {
              mode: 'times',
              times: ['07:30'],
              days: [],
              meals: [{ meal: 'BREAKFAST', at: '07:30' }],
            },
          },
        );
        // a bare list of times says nothing about meals: the old one goes, and the clock reads them
        const bare = run(d, { type: 'set_set_times', module: 'solids', times: ['12:00'] });
        expect(bare.setMeals.solids).toBeUndefined();
        expect(setupSeedFrom(bare).setTimes[0]?.meals).toEqual([{ meal: 'LUNCH', at: '12:00' }]);
        // Off takes the meals with the times
        const off = run(d, { type: 'set_rhythm', module: 'solids', rhythm: { mode: 'off' } });
        expect(off.setMeals.solids).toBeUndefined();
        expect(setupSeedFrom(off).setTimes).toEqual([]);
        // and no other rhythm carries meals into the seed, whatever it is sent
        const feeds = run(withAll(), {
          type: 'set_rhythm',
          module: 'breastfeed',
          rhythm: { mode: 'times', times: ['08:00'], days: [], meals: [] },
        });
        expect(setupSeedFrom(feeds).setTimes).toEqual([
          { activity: 'breastfeed', times: ['08:00'] },
        ]);
      });

      it('never seeds a nap or a meal as an interval — the Routine page has no segment for one', () => {
        const d = run(
          withAll(),
          { type: 'toggle_extra', module: 'solids', value: true },
          { type: 'set_interval', module: 'sleep', minutes: 120 },
          { type: 'set_interval', module: 'solids', minutes: 240 },
        );
        expect(setupSeedFrom(d).intervals).toEqual([]);
      });
    });
  });
});

/**
 * THE PUMPING QUESTION, over real drafts (the owner, 2026-09-25). `pumpingWithout` is the rule
 * (setup.test.ts holds its table); these hold that the draft the screen asks about is the draft
 * the household gets, and that "Turn them on" is the same as the taps it stands for.
 */
describe('the pumping question on the feeding step', () => {
  const pumping = () => run(throughStep1(), { type: 'toggle_feeding', card: 'pumping' });
  const ask = (d: OnboardingDraft) => pumpingWithout(draftModules(d));

  it('asks nothing on the ordinary path: Pumping brings Bottles, and the stash starts on', () => {
    expect(ask(pumping())).toBeNull();
    // a household that does not pump is never asked, whatever it turned off
    const noPump = run(
      throughStep1(),
      { type: 'toggle_feeding', card: 'breast' },
      { type: 'toggle_extra', module: 'stash', value: false },
    );
    expect(ask(noPump)).toBeNull();
  });

  it('names exactly what the parent turned off', () => {
    const bottlesOff = run(pumping(), { type: 'toggle_feeding', card: 'bottles' });
    expect(ask(bottlesOff)).toEqual(['bottles']);
    const stashOff = run(pumping(), { type: 'toggle_extra', module: 'stash', value: false });
    expect(ask(stashOff)).toEqual(['stash']);
    const both = run(bottlesOff, { type: 'toggle_extra', module: 'stash', value: false });
    expect(ask(both)).toEqual(['bottles', 'stash']);
  });

  it('"Turn them on" is the taps it stands for, and leaves nothing to ask', () => {
    const both = run(
      pumping(),
      { type: 'toggle_feeding', card: 'bottles' },
      { type: 'toggle_extra', module: 'stash', value: false },
    );
    const off = ask(both) ?? [];
    expect(pumpingPartnersOn(both, off)).toEqual([
      { type: 'toggle_feeding', card: 'bottles' },
      { type: 'toggle_extra', module: 'stash', value: true },
    ]);
    const answered = run(both, ...pumpingPartnersOn(both, off));
    expect(ask(answered)).toBeNull();
    expect(answered.feeding).toEqual(['pumping', 'bottles']);
    expect(draftModules(answered)).toEqual(expect.arrayContaining(['bottle', 'pump', 'stash']));
    // one at a time, it turns on only the one it was asked about
    const stashOnly = run(pumping(), { type: 'toggle_extra', module: 'stash', value: false });
    expect(pumpingPartnersOn(stashOnly, ['stash'])).toEqual([
      { type: 'toggle_extra', module: 'stash', value: true },
    ]);
    // and the card is a toggle, so a card already on is never toggled back off
    expect(pumpingPartnersOn(pumping(), ['bottles'])).toEqual([]);
  });

  it('"Keep them off" keeps them off: the household gets exactly the switches as they stand', () => {
    const both = run(
      pumping(),
      { type: 'toggle_feeding', card: 'bottles' },
      { type: 'toggle_extra', module: 'stash', value: false },
      next,
    );
    expect(both.step).toBe(3);
    const modules = bootstrapPayloadFrom(both, ctx).modules ?? [];
    expect(modules).toContain('pump');
    expect(modules).not.toContain('bottle');
    expect(modules).not.toContain('stash');
  });
});

describe('the bootstrap payload (ACCOUNTS.md §5)', () => {
  it('is built from the draft with the context, and passes the same rules the server enforces', () => {
    const d = run(throughStep1(), { type: 'toggle_feeding', card: 'breast' }, next, next);
    const p = bootstrapPayloadFrom(d, ctx);
    expect(p).toEqual({
      client_op_id: OP,
      profile: { display_name: 'Sam', locale: 'en-US', time_zone: 'America/Chicago' },
      household: { name: "Sam's family", home_time_zone: 'America/Chicago' },
      child: { name: 'Mia', birth_date: '2026-06-01' },
      modules: [
        'breastfeed',
        'diaper',
        'sleep',
        'med',
        // growth and temp are here whatever the feeding answer since 2026-09-22 (setup.ts):
        // how many ways a household feeds is not a reason to be unable to record a fever
        'growth',
        'temp',
        'tummy',
        'bath',
        'vaccine',
        // the Health note, on with the health record (2026-10-08)
        'wellbeing',
        // and the milk stash, which is an ordinary switch on the feeding step for everyone
        'stash',
      ],
    });
    expect(validateBootstrapPayload(p, TODAY)).toEqual({ ok: true, payload: p });
  });

  it('carries the due date only for a baby born early, and a chosen household name verbatim', () => {
    const d = run(
      throughStep1(),
      { type: 'back' },
      { type: 'set_household_name', value: '  The Rivera house ' },
      { type: 'set_born_early', value: true },
      { type: 'set_due_date', value: '2026-07-13' },
      next,
      ...breastAndBottles,
      next,
      next,
    );
    const p = bootstrapPayloadFrom(d, ctx);
    expect(p.household.name).toBe('The Rivera house');
    expect(p.child.due_date).toBe('2026-07-13');
    expect(p.modules).toEqual([
      'bottle',
      'breastfeed',
      'diaper',
      'sleep',
      'med',
      'growth',
      'temp',
      'tummy',
      'bath',
      'vaccine',
      // the Health note, on with the health record (2026-10-08)
      'wellbeing',
      'stash',
    ]);
  });

  /**
   * NO AGE GATE ANYWHERE IN THE PAYLOAD. Removed by owner decision, 2026-09-17 ("Remove the
   * parents age"), after the store and children's-privacy consequences were put to them;
   * AUTH_AND_TRIAL.md §2.4 records the decision.
   *
   * ABSENT, NEVER A FABRICATED PASS. The app no longer checks anything, so sending
   * `passed: true` would write a false fact: `profiles.age_gate_passed_at` would claim an adult
   * was verified on a date when nothing was. A null column is the truth and the only version a
   * later audit reads correctly — so the field is gone, not defaulted.
   */
  it('carries no age gate at all, and no date of birth for the adult', () => {
    const d = run(throughStep1(), ...breastAndBottles, next, next);
    const p = bootstrapPayloadFrom(d, ctx);
    expect(Object.keys(p)).not.toContain('age_gate');
    expect(JSON.stringify(p)).not.toContain('age_gate');
    expect(JSON.stringify(p)).not.toContain('1990');
  });

  it('rejects what the server would reject, naming the field', () => {
    const d = run(throughStep1(), ...breastAndBottles, next, next);
    const good = bootstrapPayloadFrom(d, ctx);
    expect(validateBootstrapPayload({ ...good, client_op_id: 'not-a-uuid' }, TODAY)).toMatchObject({
      ok: false,
      field: 'client_op_id',
    });
    expect(
      validateBootstrapPayload({ ...good, profile: { display_name: 'x' } }, TODAY),
    ).toMatchObject({ ok: false, field: 'profile.display_name' });
    expect(
      validateBootstrapPayload(
        { ...good, child: { ...good.child, birth_date: '2030-01-01' } },
        TODAY,
      ),
    ).toEqual({
      ok: false,
      field: 'child.birth_date',
      reason: 'future',
    });
    expect(
      validateBootstrapPayload(
        { ...good, child: { ...good.child, due_date: '2028-01-01' } },
        TODAY,
      ),
    ).toEqual({
      ok: false,
      field: 'child.due_date',
      reason: 'outside_window',
    });
    expect(validateBootstrapPayload({ ...good, modules: ['supplies'] }, TODAY)).toMatchObject({
      ok: false,
      field: 'modules.0',
    });
  });
});

describe('where they heard about the app — optional, one key, never a label', () => {
  const finished = () => run(throughStep1(), ...breastAndBottles, next, next);

  it('starts unanswered, and an unanswered question is absent from the payload', () => {
    expect(initialDraft(OP).heard_from).toBeNull();
    const p = bootstrapPayloadFrom(finished(), ctx);
    expect(Object.keys(p.household)).not.toContain('heard_from');
    expect(JSON.stringify(p)).not.toContain('heard_from');
  });

  it('carries the chosen key, and clearing it returns to unanswered rather than to a default', () => {
    const chosen = run(finished(), { type: 'set_heard_from', value: 'friend' });
    expect(bootstrapPayloadFrom(chosen, ctx).household.heard_from).toBe('friend');
    const cleared = run(chosen, { type: 'set_heard_from', value: null });
    expect(cleared.heard_from).toBeNull();
    expect(bootstrapPayloadFrom(cleared, ctx).household).not.toHaveProperty('heard_from');
  });

  it('never blocks the last step: the answer is not part of what Continue checks', () => {
    for (const value of [null, 'other', 'clinician'] as const) {
      expect(canAdvance(run(finished(), { type: 'set_heard_from', value }), TODAY)).toEqual({
        ok: true,
      });
    }
  });

  it('is a closed list of snake_case keys with the honest floor last, and rejects anything else', () => {
    expect(HEARD_FROM_OPTIONS.at(-1)).toBe('other');
    expect(new Set(HEARD_FROM_OPTIONS).size).toBe(HEARD_FROM_OPTIONS.length);
    for (const key of HEARD_FROM_OPTIONS) expect(key).toMatch(/^[a-z][a-z_]*$/);
    const good = bootstrapPayloadFrom(finished(), ctx);
    for (const bad of ['Friends or family', 'billboard', '', ' friend']) {
      expect(
        validateBootstrapPayload(
          { ...good, household: { ...good.household, heard_from: bad } },
          TODAY,
        ),
      ).toMatchObject({ ok: false, field: 'household.heard_from' });
    }
  });
});

/**
 * THE HOUSEHOLD'S MILK UNIT, asked on the feeding step (migration 0128; the owner, 2026-09-26: "in
 * what modules you track, i think this needs to be asked under milk stash if you use mL or oz").
 */
describe('the milk unit in setup', () => {
  it('is not chosen until the parent chooses, and the seed carries the choice into the household', () => {
    let d = initialDraft('op-unit');
    expect(d.volume_unit).toBeNull();
    expect(setupSeedFrom(d).volumeUnit).toBeNull();
    d = onboardingReducer(d, { type: 'set_volume_unit', unit: 'ml' });
    expect(d.volume_unit).toBe('ml');
    expect(setupSeedFrom(d).volumeUnit).toBe('ml');
    d = onboardingReducer(d, { type: 'set_volume_unit', unit: 'oz' });
    expect(setupSeedFrom(d).volumeUnit).toBe('oz');
  });
});

/**
 * A BABY ON THE WAY (the owner, 2026-10-01: "of course this should be an option. even parents start
 * collecting collostrum before labor"; migration 0150). Step 1 asks whether the baby is here, and
 * "Not yet" takes a due date in place of the birth date and lets the name wait.
 */
describe('setup before the birth', () => {
  const onTheWay = (...more: OnboardingAction[]) =>
    run(
      initialDraft(OP),
      { type: 'set_name', value: 'Sam' },
      { type: 'set_role', value: 'parent' },
      { type: 'set_expecting', value: true },
      ...more,
    );

  it('a draft from before the question reads as a baby already born', () => {
    expect(initialDraft(OP).expecting).toBe(false);
  });

  it('"Not yet" needs the due date, and the name may wait', () => {
    expect(canAdvance(onTheWay(), TODAY)).toEqual({ ok: false, reason: 'due_date.invalid' });
    const dated = onTheWay({ type: 'set_due_date', value: '2026-11-20' });
    expect(canAdvance(dated, TODAY)).toEqual({ ok: true });
    expect(onboardingReducer(dated, next).step).toBe(2);
    // a name typed is held to the same rule as any baby's
    const long = run(dated, { type: 'set_child_name', value: 'A'.repeat(41) });
    expect(canAdvance(long, TODAY)).toEqual({ ok: false, reason: 'child_name' });
  });

  it('holds the due date to six weeks past and 300 days ahead, naming which', () => {
    expect(canAdvance(onTheWay({ type: 'set_due_date', value: '2026-07-01' }), TODAY)).toEqual({
      ok: false,
      reason: 'due_date.past',
    });
    expect(canAdvance(onTheWay({ type: 'set_due_date', value: '2027-09-14' }), TODAY)).toEqual({
      ok: false,
      reason: 'due_date.far',
    });
  });

  it('switching the answer clears Born early and the birth check, and keeps the dates typed', () => {
    const born = run(
      initialDraft(OP),
      { type: 'set_birth_date', value: '2026-06-01' },
      { type: 'confirm_birth_date' },
      { type: 'set_born_early', value: true },
      { type: 'set_due_date', value: '2026-07-13' },
    );
    const switched = run(born, { type: 'set_expecting', value: true });
    expect(switched.expecting).toBe(true);
    expect(switched.born_early).toBe(false);
    expect(switched.birth_confirmed).toBe(false);
    expect(switched.birth_date).toBe('2026-06-01');
    expect(switched.due_date).toBe('2026-07-13');
  });

  it('sends the due date and no birth date, and the stand-in name when none was chosen', () => {
    const d = run(onTheWay({ type: 'set_due_date', value: '2026-11-20' }), next, next, next);
    const p = bootstrapPayloadFrom(d, ctx);
    expect(p.child).toEqual({ name: 'Baby', due_date: '2026-11-20' });
    expect(validateBootstrapPayload(p, TODAY)).toEqual({ ok: true, payload: p });
    const named = run(
      onTheWay(
        { type: 'set_due_date', value: '2026-11-20' },
        { type: 'set_child_name', value: ' Ada ' },
      ),
      next,
    );
    expect(bootstrapPayloadFrom(named, ctx).child).toEqual({ name: 'Ada', due_date: '2026-11-20' });
  });

  it('a birth date typed before the answer changed is never sent with it', () => {
    const d = run(
      initialDraft(OP),
      { type: 'set_name', value: 'Sam' },
      { type: 'set_role', value: 'parent' },
      { type: 'set_birth_date', value: '2026-06-01' },
      { type: 'set_expecting', value: true },
      { type: 'set_due_date', value: '2026-11-20' },
      next,
    );
    expect(bootstrapPayloadFrom(d, ctx).child).not.toHaveProperty('birth_date');
  });

  it('the server rules hold: no date at all is refused, and a due date out of the window', () => {
    const d = run(onTheWay({ type: 'set_due_date', value: '2026-11-20' }), next);
    const good = bootstrapPayloadFrom(d, ctx);
    expect(validateBootstrapPayload({ ...good, child: { name: 'Baby' } }, TODAY)).toMatchObject({
      ok: false,
      field: 'child.birth_date',
    });
    expect(
      validateBootstrapPayload({ ...good, child: { name: 'Baby', due_date: '2026-07-01' } }, TODAY),
    ).toEqual({ ok: false, field: 'child.due_date', reason: 'past' });
    expect(
      validateBootstrapPayload({ ...good, child: { name: 'Baby', due_date: '2027-09-14' } }, TODAY),
    ).toEqual({ ok: false, field: 'child.due_date', reason: 'far' });
  });
});
