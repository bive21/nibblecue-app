/**
 * The onboarding draft on disk, so a killed app resumes at the same step
 * (docs/AUTH_AND_TRIAL.md §2 "must be abandonable"). Stored per user id in the preferences
 * store, which sign-out clears — a draft never survives into another account.
 *
 * `age_gate` is a grave, not a field. The app stopped asking the account holder's date of
 * birth (the owner, 2026-09-17: "Remove the parents age"), so every draft this build writes
 * carries null. The key stays readable and defaulted so a draft saved by an older build still
 * parses and still resumes; what it holds is simply dropped, because `bootstrapPayloadFrom`
 * no longer sends a gate at all.
 */
import {
  HEARD_FROM_OPTIONS,
  initialDraft,
  MEALS,
  type FeedingCard,
  type Meal,
  type MealTime,
  type ModuleId,
  type OnboardingDraft,
} from '@nibblecue/core';
import { z } from 'zod';
import type { KeyValueStore } from '../prefs';

/**
 * A DRAFT FROM AN OLDER BUILD LANDS ON THE LAST STEP THIS ONE HAS, rather than failing the parse
 * and losing everything the parent typed. Two steps have been removed since the first release —
 * the seven-step flow's summary, and then "This is <baby>'s app" on 2026-09-22 — so 6 and 7 both
 * resolve to 5, the brands step, which is the end now.
 */
const Step = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6).transform(() => 5 as const),
  z.literal(7).transform(() => 5 as const),
]);
const Medicine = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['MEDICINE', 'VITAMIN', 'CREAM', 'OTHER']),
  times: z.array(z.string()),
});
const HHMM = /^\d{2}:\d{2}$/;
const isMeal = (m: string): m is Meal => (MEALS as readonly string[]).includes(m);
/**
 * SOLIDS' MEALS (2026-09-28), read WITHOUT trusting them: a draft from a build before the table has
 * none, which is `{}`, and a draft from a later build may name a meal this one does not know, which
 * is dropped alone rather than costing the parent the whole draft. The solids times stay in
 * `setTimes` either way, and are read by their clock when their meal cannot be.
 */
const SetMeals = z
  .record(z.array(z.object({ meal: z.string(), at: z.string() })))
  .catch({})
  .transform(byModule => {
    const out: Partial<Record<ModuleId, MealTime[]>> = {};
    for (const [module, list] of Object.entries(byModule)) {
      const known = list.flatMap(m =>
        isMeal(m.meal) && HHMM.test(m.at) ? [{ meal: m.meal, at: m.at }] : [],
      );
      if (known.length > 0) out[module as ModuleId] = known;
    }
    return out;
  });
const Draft = z.object({
  step: Step,
  client_op_id: z.string().uuid(),
  display_name: z.string(),
  role_choice: z.enum(['parent', 'caregiver']).nullable(),
  household_name: z.string().nullable(),
  child_name: z.string(),
  // the picture chosen on step 1 (2026-09-21): a draft saved before it existed has none
  child_photo_uri: z.string().nullable().default(null),
  // "Is your baby here yet?" (2026-10-01): a draft saved before the question meant "yes"
  expecting: z.boolean().catch(false),
  birth_date: z.string().nullable(),
  birth_confirmed: z.boolean(),
  born_early: z.boolean(),
  due_date: z.string().nullable(),
  /*
   * `stored` WAS A FIFTH FEEDING CARD for one day (2026-09-20 to 2026-09-21) and is now the Milk
   * stash switch on step 4. The wire still ACCEPTS it and drops it on the way in: a parent who
   * was mid-setup when the build changed keeps the name they typed and the rhythms they chose,
   * where a narrowed enum would fail the whole parse and hand them an empty draft. They meet the
   * stash as a switch on the next step, which is where it lives now.
   */
  feeding: z
    .array(z.enum(['breast', 'pumping', 'bottles', 'stored', 'solids']))
    .transform(v => v.filter((c): c is FeedingCard => c !== 'stored')),
  // `feeding_skipped` went with the feeding step's Skip (2026-09-24). A draft saved before then
  // still carries it and parses: an unknown key is dropped, and a skip had already filled
  // `feeding` with its two cards, so the resumed draft reads as a parent who chose them
  bottle_suggested: z.boolean(),
  extras: z.record(z.boolean()),
  // step 5, added after the first release of the draft: a resumed draft written by an older
  // build has none of them, so each defaults rather than failing the parse and losing the rest
  intervals: z.record(z.number()).default({}),
  cadences: z.record(z.number()).default({}),
  /* The Rule sheet's own three answers, asked in setup since 2026-09-21. `.default` on each, so
     a draft saved by a build that could not ask resumes as one that was not asked. */
  timing: z.record(z.enum(['INTERVAL', 'FIXED', 'OFF'])).default({}),
  setTimes: z.record(z.array(z.string())).default({}),
  /* What the Rule sheet's own form answers besides (2026-09-24): the weekdays set times keep, a
     bath's weekdays and time, and the one night slot's time. Same `.default` story. */
  setDays: z.record(z.array(z.number())).default({}),
  setMeals: SetMeals,
  cadenceDays: z.record(z.array(z.number())).default({}),
  cadenceAt: z.record(z.string()).default({}),
  night: z
    .record(
      z.object({
        mode: z.enum(['NONE', 'LONGER', 'ONE', 'PAUSE']),
        everyMinutes: z.number().nullable(),
        at: z.string().nullable().optional(),
      }),
    )
    .default({}),
  timesADay: z.record(z.number()).default({}),
  // the daily goal per module (2026-09-19); a draft from before it existed has none
  goals: z.record(z.number()).default({}),
  quiet_hours: z.object({ from: z.string(), to: z.string() }).nullable().default(null),
  day_window: z.object({ wake: z.string(), bed: z.string() }).nullable().default(null),
  // the household's milk unit (0128). `.catch` for heard_from's reason: a draft from before it
  // was asked has no key, and any value this build does not know is "did not say" — ounces
  volume_unit: z.enum(['oz', 'ml']).nullable().catch(null),
  supply_brands: z.record(z.string()).default({}),
  // absent in a draft saved before "add details" existed, which reads correctly as "no details"
  supply_details: z.record(z.record(z.string())).default({}),
  // extra rows for a second product on the same shelf (2026-10-02); absent in older drafts
  supply_slots: z
    .array(z.object({ id: z.string().min(1), category: z.string().min(1) }))
    .default([]),
  medicines: z.array(Medicine).default([]),
  // step 1's optional question. `.catch`, not `.default`: a draft from an older build has no
  // key, and a draft from a NEWER build may hold an answer this one has never heard of — either
  // way the question falls back to unanswered rather than costing the parent the whole draft
  heard_from: z.enum(HEARD_FROM_OPTIONS).nullable().catch(null),
});
const Saved = z.object({
  draft: Draft,
  age_gate: z
    .object({
      region: z.string(),
      threshold: z.union([z.literal(13), z.literal(16)]),
      passed: z.boolean(),
    })
    .nullable()
    .default(null),
  saved_at: z.string(),
});
export type SavedOnboarding = z.infer<typeof Saved>;

/**
 * WHICH SETUP A DRAFT IS FOR. `first` is the account's first family (the onboarding phase, Ended's
 * "Set up"); `own` is "Start your own family" from Family, for somebody already in other families
 * as a caregiver or a viewer (migration 0154). Two keys, so neither ever resumes as the other: a
 * setup begun before an invite arrived, and kept on disk unsent (`OnboardingScreen`), is not handed
 * to the new family's flow, and a half-done own-family draft never opens on Ended. Both are keyed
 * by user, so another account on this phone never reads either, and a sign-out sweeps both.
 */
export type DraftScope = 'first' | 'own';

export const draftKey = (userId: string, scope: DraftScope = 'first'): string =>
  scope === 'first' ? `onboarding_draft:${userId}` : `own_family_draft:${userId}`;

export async function loadOnboarding(
  store: KeyValueStore,
  userId: string,
  scope: DraftScope = 'first',
): Promise<SavedOnboarding | null> {
  const raw = await store.get(draftKey(userId, scope));
  if (!raw) return null;
  try {
    const parsed = Saved.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveOnboarding(
  store: KeyValueStore,
  userId: string,
  draft: OnboardingDraft,
  now: () => number = Date.now,
  scope: DraftScope = 'first',
): Promise<void> {
  const value: SavedOnboarding = {
    draft: draft as SavedOnboarding['draft'],
    age_gate: null,
    saved_at: new Date(now()).toISOString(),
  };
  await store.set(draftKey(userId, scope), JSON.stringify(value));
}

export const clearOnboarding = (
  store: KeyValueStore,
  userId: string,
  scope: DraftScope = 'first',
): Promise<void> => store.remove(draftKey(userId, scope));

/** A resumed draft, or a fresh one with a new client_op_id (the idempotency key of the final call). */
export async function draftFor(
  store: KeyValueStore,
  userId: string,
  newOpId: () => string,
  scope: DraftScope = 'first',
): Promise<SavedOnboarding> {
  const saved = await loadOnboarding(store, userId, scope);
  if (saved) return saved;
  return { draft: initialDraft(newOpId()), age_gate: null, saved_at: new Date().toISOString() };
}
