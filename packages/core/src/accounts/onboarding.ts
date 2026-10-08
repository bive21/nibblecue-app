/**
 * Onboarding — six resumable steps (CODEX_TASKS WP2, docs/SETUP.md §1): 1 who are you,
 * 2 your baby, 3 how is your baby fed, 4 anything else, 5 how often — the rhythms and any
 * medicines — 6 that is your app + the 14-day Plus card. The draft lives in a reducer, not in navigation, so Back never loses input and a
 * killed app resumes where it was; nothing is written to the server before step 5's button
 * (ACCOUNTS.md §3.4, §5). The validation here is the same set of rules `bootstrap_household`
 * enforces server-side (0008), so a payload that passes here passes there.
 */
import { z } from 'zod';
import { expectedDueVerdict, UNNAMED_CHILD } from '../children/expecting';
import type { VolumeUnit } from '../domain/domain-types';
import { MODULES, type ModuleId } from '../modules/module-registry';
import { byClock, MEAL_ACTIVITY, mealsForTimes, type MealTime } from '../schedule/meals';
import type { NightMode } from '../schedule/types';
import { SUPPLY_CATEGORY_IDS } from '../supplies';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';
import {
  enabledModuleIds,
  FEEDING_CARDS,
  modulesForFeeding,
  type FeedingCard,
  type PumpingPartner,
} from './setup';

const MAX_CHILD_AGE_YEARS = 8;
const CONFIRM_CHILD_AGE_YEARS = 2;
const DUE_DATE_WINDOW_DAYS = 365;

const URL_LIKE = /(https?:\/\/|www\.)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .refine(s => !URL_LIKE.test(s), { message: 'no_urls' });
/** The household's own name, at setup and again from Family (0151). Trimmed, 2 to 60 characters. */
export const HouseholdNameSchema = z.string().trim().min(2).max(60);

/**
 * Where the parent heard about the app — asked once, on the last step of setup, and OPTIONAL
 * (the owner, 2026-09-17: "Add where did you hear about us during setup for marketing purposes
 * (this is optional)").
 *
 * STABLE KEYS, NEVER LABELS. The row stores the key; the words a parent reads live with the
 * screen (`screens/onboarding/copy.ts`) and can be reworded without touching a row. The list is
 * closed on purpose: a free-text field is a place to type a name, an email address or a clinic,
 * and this is marketing bookkeeping, not part of the record. `households.heard_from` carries
 * the same list as a check constraint (migration 0093) and `packages/db` keeps the two in step.
 *
 * `other` is the honest floor. It is last, it is not preselected, and nothing here is.
 */
export const HEARD_FROM_OPTIONS = [
  'app_store',
  'friend',
  'clinician',
  'social',
  'search',
  'group',
  'article',
  'other',
] as const;
export type HeardFrom = (typeof HEARD_FROM_OPTIONS)[number];
const HeardFromSchema = z.enum(HEARD_FROM_OPTIONS);
export const ChildNameSchema = z.string().trim().min(1).max(40);
/** A real calendar date: Date.parse rolls "2026-02-30" over to March 2, so the string must round-trip. */
const isRealDate = (s: string): boolean => {
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
export const IsoDateSchema = z
  .string()
  .regex(ISO_DATE)
  .refine(isRealDate, { message: 'invalid_date' });
const MODULE_IDS = MODULES.map(m => m.id) as [ModuleId, ...ModuleId[]];
const ModuleIdSchema = z.enum(MODULE_IDS);
// `AgeGateSchema` and core's `age-gate.ts` went on 2026-09-26: no client has sent a gate since
// the owner removed it (2026-09-17). The server still validates one from an older build
// (migration 0020, `app.age_gate_threshold()`), and the draft store still reads the old field.

const BootstrapPayloadSchema = z.object({
  client_op_id: z.string().uuid(),
  profile: z.object({
    display_name: DisplayNameSchema,
    locale: z.string().min(2).optional(),
    time_zone: z.string().min(1).optional(),
  }),
  household: z.object({
    name: HouseholdNameSchema,
    home_time_zone: z.string().min(1).optional(),
    /** Absent when the parent did not answer — never an empty string, never a default. */
    heard_from: HeardFromSchema.optional(),
  }),
  /**
   * BORN, OR ON THE WAY (2026-10-01; migration 0150). A baby already born has its birth date, and a
   * due date only when it came early. A baby on the way has no birth date and its due date, the
   * day the 14 days of Plus wait for (`record_birth`).
   */
  child: z
    .object({
      name: ChildNameSchema,
      birth_date: IsoDateSchema.optional(),
      due_date: IsoDateSchema.optional(),
      sex: z.enum(['F', 'M', 'X']).optional(),
    })
    .refine(c => c.birth_date !== undefined || c.due_date !== undefined, {
      message: 'required',
      path: ['birth_date'],
    }),
  modules: z.array(ModuleIdSchema).optional(),
  /**
   * NO AGE GATE. Removed by owner decision, 2026-09-17 ("Remove the parents age"), after the
   * store and children's-privacy consequences were put to them — see AUTH_AND_TRIAL.md §2.4,
   * which now records the decision and what it leaves open.
   *
   * It is ABSENT rather than sent as a pass. No check happens any more, so claiming one did
   * would write a false fact into the profile: `age_gate_passed_at` would say an adult was
   * verified on a date when nothing was verified at all. A null column is the truth, and it is
   * also the only version a later audit can read correctly.
   */
});
export type BootstrapPayload = z.infer<typeof BootstrapPayloadSchema>;

const dayMs = 86_400_000;
export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / dayMs);

const yearsAgo = (todayIso: string, years: number): string => {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

export type BirthDateVerdict = 'ok' | 'confirm' | 'future' | 'too_old' | 'invalid';

/** ≤ today and ≥ today − 8 years; older than 2 years asks "Just checking — born Mar 2019?". */
export function birthDateVerdict(
  iso: string | null | undefined,
  todayIso: string,
): BirthDateVerdict {
  if (!iso || !IsoDateSchema.safeParse(iso).success) return 'invalid';
  if (iso > todayIso) return 'future';
  if (iso < yearsAgo(todayIso, MAX_CHILD_AGE_YEARS)) return 'too_old';
  if (iso < yearsAgo(todayIso, CONFIRM_CHILD_AGE_YEARS)) return 'confirm';
  return 'ok';
}

export const dueDateWithinWindow = (birthIso: string, dueIso: string): boolean =>
  Math.abs(daysBetween(birthIso, dueIso)) <= DUE_DATE_WINDOW_DAYS;

/** Derived, never typed: round((due − birth) / 7, 1) when the baby came early, else null. */
export function pretermWeeks(birthIso: string, dueIso: string | null | undefined): number | null {
  if (!dueIso) return null;
  const days = daysBetween(birthIso, dueIso);
  return days > 0 ? Math.round((days / 7) * 10) / 10 : null;
}

export type PayloadCheck =
  { ok: true; payload: BootstrapPayload } | { ok: false; field: string; reason: string };

/** The client-side twin of the server's validation, naming the field the same way. */
export function validateBootstrapPayload(input: unknown, todayIso: string): PayloadCheck {
  const parsed = BootstrapPayloadSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      field: issue?.path.join('.') ?? 'payload',
      reason: issue?.message ?? 'invalid',
    };
  }
  const p = parsed.data;
  // a baby on the way: the due date is the only date, in the window the server holds too
  if (p.child.birth_date === undefined) {
    const due = expectedDueVerdict(p.child.due_date, todayIso);
    return due === 'ok'
      ? { ok: true, payload: p }
      : { ok: false, field: 'child.due_date', reason: due };
  }
  const verdict = birthDateVerdict(p.child.birth_date, todayIso);
  if (verdict === 'future' || verdict === 'too_old' || verdict === 'invalid') {
    return { ok: false, field: 'child.birth_date', reason: verdict };
  }
  if (p.child.due_date && !dueDateWithinWindow(p.child.birth_date, p.child.due_date)) {
    return { ok: false, field: 'child.due_date', reason: 'outside_window' };
  }
  return { ok: true, payload: p };
}

export const defaultHouseholdName = (displayName: string): string =>
  `${displayName.trim()}'s family`;

/* ---------------------------------------------------------------- the draft */

/**
 * SIX STEPS. "You and your baby" used to be two (the owner, 2026-09-17: "we dont need the
 * parent's date of birth, remove this module completely. instead combien it with the second
 * module which is baby's name and DOB"). A page that asked only a first name and a role was a
 * page, a Continue and a settle animation for eleven characters of typing.
 */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

/**
 * EVERY STEP HAS A NAME, AND NOTHING COMPARES AGAINST THE BARE NUMBER.
 *
 * Merging the old steps 1 and 2 moved every step after them down by one, and the screen's
 * "apply the published starting point" effect was left testing `step !== 5` — which used to be
 * the rhythm step and is now the brands step. The presets were written into the draft one step
 * AFTER the screen that shows them, so a parent saw an empty page and every chip unset (the
 * owner, 2026-09-17: "the preset interval in the onboarding process is now gone"). The tripwire
 * that guards that effect asserted the literal `5` too, so it kept passing while pointing at a
 * different screen.
 *
 * Numbers renumber; names do not. `ONBOARD_STEP.RHYTHM` is the rhythm step wherever it sits,
 * and moving a step is one edit here.
 */
export const ONBOARD_STEP = {
  /** Your name, your role, the baby's name and date of birth. */
  YOU_AND_BABY: 1,
  /** How the baby is fed. */
  FEEDING: 2,
  /** Which modules this household uses. */
  MODULES: 3,
  /** How often, any medicines, quiet hours. */
  RHYTHM: 4,
  /** The brands they buy — drawn only when the modules make a category worth asking about. */
  BRANDS: 5,
} as const satisfies Record<string, OnboardingStep>;

/**
 * THERE WAS A SIXTH, AND IT IS GONE (the owner, 2026-09-22: *"this is chiara's app page: it can
 * be removed. so last onboarding page should be on what do you buy. bring straight to Welcome to
 * CuddleCue and the 14 day trial"*).
 *
 * `PLUS` was "This is <baby>'s app": a draggable Quick row, a card listing what is NOT tracked,
 * and a count of what step 4 built. Every one of those is a read-back of an answer the parent
 * had just given, on the last screen before a welcome page that also reads back what they get —
 * two summaries in a row, at the point in the flow where somebody wants to be finished. The
 * Quick row's order is still theirs to set, on Today, where the tiles they are ordering are the
 * real ones.
 *
 * A DRAFT STORED ON THE OLD STEP 6 lands on this one: `parseOnboarding` clamps it, so a parent
 * who closed the app on the sort page reopens on the brands page rather than a blank screen.
 */
export const LAST_ONBOARDING_STEP: OnboardingStep = ONBOARD_STEP.BRANDS;
export type RoleChoice = 'parent' | 'caregiver';

/** What a medicine is, asked once so a cream is not recorded as something to swallow. */
export const ONBOARDING_CARE_KINDS = ['MEDICINE', 'VITAMIN', 'CREAM', 'OTHER'] as const;
export type OnboardingCareKind = (typeof ONBOARDING_CARE_KINDS)[number];

/**
 * A medicine, vitamin or cream named during setup (the owner, 2026-09-16: "schedule interval
 * should be a part of the new account creation setup, along with adding any medications /
 * supplements"). NAME AND TIMES ONLY — never an amount and never a dose: the amount is the
 * parent's own words on the item itself (CLAUDE.md §2 rule 4, docs/CARE_ITEMS.md §3), and a
 * first-run screen is the last place to start asking for one.
 */
export interface DraftMedicine {
  id: string;
  name: string;
  kind: OnboardingCareKind;
  /** `HH:MM` in the household's own clock; empty means no reminder, which is allowed. */
  times: string[];
}

/**
 * HOW A RHYTHM IS STATED, per module — the Rule sheet's segments (the owner, 2026-09-24: *"make
 * sure whats being asked, and how it's gonna answer mimic how it is in interval manage / rhythm
 * page"*). Absent is the row's own default: an interval for the rhythms that have one, a daily goal
 * for tummy time, a cadence for the bath. `FIXED` is "At set times"; `OFF` is "Off", chosen — the
 * difference from absent being that a published starting point is never applied over it.
 */
export type SetupTiming = 'INTERVAL' | 'FIXED' | 'OFF';

/**
 * What an interval does overnight: the engine's three modes, and for `ONE` the time of that one
 * slot (`at`, `HH:MM`; absent is the sheet's own 3:00 AM). `at` joined on 2026-09-24, when setup
 * began asking the night the way the Rule sheet does — "Once a night" opens the clock.
 */
export interface SetupNight {
  mode: NightMode;
  everyMinutes: number | null;
  at?: string | null | undefined;
}

/**
 * ONE ANSWER FROM THE RULE SHEET, whole — what setup's copy of that sheet hands back on Save
 * (`set_rhythm`). One action rather than five, so a rhythm is never half-written: the draft moves
 * from one complete answer to the next, the way a Save on the Routine page does.
 */
export type SetupRhythm =
  | { mode: 'off' }
  | { mode: 'interval'; everyMinutes: number; night: SetupNight | null }
  | {
      mode: 'times';
      times: readonly string[];
      days: readonly number[];
      /**
       * SOLIDS' TIMES ARE MEALS (2026-09-28): the meals the table had on, each with its time, so
       * the seeder names each rule for its meal. Absent for every other rhythm, and for an answer
       * from a build before the table, whose times are then read the way the table reads them.
       */
      meals?: readonly MealTime[] | undefined;
    }
  | { mode: 'cadence'; everyDays: number; days: readonly number[]; at: string }
  | { mode: 'quota'; minutes: number };

/**
 * THE FIELDS "add details" OFFERS, and the only keys `supply_details` may hold.
 *
 * It is `SupplyFields` minus three. `category` is the row itself; `brand` is the field already on
 * the row; `url` is a link, which is not something anyone types on a phone during setup and has
 * no keyboard that makes it pleasant. What is left is exactly what a parent can read off the pack
 * in front of them, in the order the Supplies sheet asks for it, so the two screens teach one
 * shape.
 *
 * Closed, and checked by the reducer: the draft is persisted and can be resumed after an app
 * update, so a key from a build that knew more fields must not reach the catalog as a column
 * nobody can read.
 */
const SUPPLY_DETAIL_FIELDS = ['product', 'variant', 'pack', 'store', 'notes'] as const;
export type SupplyDetailField = (typeof SUPPLY_DETAIL_FIELDS)[number];

export interface OnboardingDraft {
  step: OnboardingStep;
  /** Minted on step 1 (ACCOUNTS.md §5); the same id on every retry of the final call. */
  client_op_id: string;
  display_name: string;
  role_choice: RoleChoice | null;
  household_name: string | null;
  child_name: string;
  /**
   * THE BABY'S PICTURE, CHOSEN ON STEP 1 (the owner, 2026-09-21: "on onboarding first page, add
   * the option to add your favorite baby picture"). A file on THIS device — already cropped,
   * downscaled and re-encoded, so it carries no EXIF (docs/MEDIA.md §3) — applied to the child
   * through the API once the child exists (`SetupSeeder`). Null when none was chosen; never
   * required, exactly like the photo sheet after setup.
   */
  child_photo_uri: string | null;
  /**
   * THE BABY IS ON THE WAY (2026-10-01): step 1 asks "Is your baby here yet?", and "Not yet" makes
   * `due_date` the date it asks for, in place of the birth date; the name may wait too. False on a
   * draft from a build before the question, which is the answer every such draft meant.
   */
  expecting: boolean;
  birth_date: string | null;
  birth_confirmed: boolean;
  born_early: boolean;
  due_date: string | null;
  feeding: FeedingCard[];
  bottle_suggested: boolean;
  extras: Partial<Record<ModuleId, boolean>>;
  /**
   * Step 5. How often, in minutes between sessions, for the activities that count from the last
   * one; a rhythm in days for the ones that do not. Nothing is preselected and nothing is
   * required — a household that taps Continue creates no rules at all, exactly as before.
   */
  intervals: Partial<Record<ModuleId, number>>;
  cadences: Partial<Record<ModuleId, number>>;
  /**
   * WHICH WAY A RHYTHM IS STATED — the Rule sheet's own first control, asked here for the first
   * time on 2026-09-21.
   *
   * The Rule sheet has offered "Every few hours | At set times" since the schedule redesign, and
   * set-times feeding was turned on by the owner on 2026-09-19. Setup offered neither: whatever
   * a household answered became an INTERVAL, so a family that feeds at 7, 10, 1 and 4 had to
   * finish setup with a rhythm they do not keep and then go and replace it. Absent means the
   * row's own default, which is `INTERVAL` for every row that has one.
   */
  timing: Partial<Record<ModuleId, SetupTiming>>;
  /** `FIXED` timing: the clock times, `HH:MM`, in clock order. One FIXED rule each. */
  setTimes: Partial<Record<ModuleId, string[]>>;
  /**
   * `FIXED` timing: the weekdays the times repeat on (0 = Sunday), or absent for every day — the
   * Rule sheet's day letters, asked in setup since 2026-09-24 (`set_rhythm`).
   */
  setDays: Partial<Record<ModuleId, number[]>>;
  /**
   * `FIXED` timing for solids: the MEALS those times are, each one's time among `setTimes`
   * (2026-09-28, `schedule/meals.ts`). The table's rows that are on; a row that is off keeps nothing
   * here, since the Routine page has no rule to read one back from either. Absent in a draft from a
   * build before the table, whose solids times are then read by their clock, as the table reads a
   * household's older times.
   */
  setMeals: Partial<Record<ModuleId, MealTime[]>>;
  /**
   * A rhythm in days, the way the Rule sheet's "Every few days" states it: chosen weekdays (absent
   * for "every N days", which is `cadences`) and the time of day. Absent `cadenceAt` is the
   * sheet's own starting position, 6:30 PM (`defaultDraft`).
   */
  cadenceDays: Partial<Record<ModuleId, number[]>>;
  cadenceAt: Partial<Record<ModuleId, string>>;
  /**
   * `INTERVAL` timing: what the rhythm does overnight, or absent for "the same round the clock".
   *
   * The three modes are the engine's own and the three chips the Rule sheet draws under its
   * switch (the owner, 2026-09-19: "all three"). The WINDOW is not stored here — it is the
   * household's own day, bedtime to waking, which is what the Rule sheet writes and what the
   * Routine page keeps in step when the bed time moves. Storing a second copy of it in the draft
   * would be a copy that could disagree.
   */
  night: Partial<Record<ModuleId, SetupNight>>;
  /**
   * How many times a day, for the activities a household counts rather than spaces — tummy time
   * (docs/SCHEDULE_LOGIC.md). An interval was the wrong instrument for it: "every 4h from the
   * last" turns one late afternoon into a chain that walks into the night, and the source that
   * publishes it publishes a COUNT ("2 to 3 times each day").
   */
  timesADay: Partial<Record<ModuleId, number>>;
  /**
   * A daily goal in minutes, for the activities a household aims at rather than counts — tummy
   * time, which was a count above until 2026-09-19 (the owner: "redesign tummy time to goal
   * time instead of how many times per day"). The count field stays so a draft saved by an
   * older build still loads; nothing new is written into it.
   */
  goals: Partial<Record<ModuleId, number>>;
  medicines: DraftMedicine[];
  /**
   * The hours the household does NOT want to be woken by a reminder, or null for none.
   *
   * Asked in setup rather than left to a settings screen nobody opens (the owner, 2026-09-17),
   * and it earns the question twice over: it is the one preference that silences every channel at
   * once, and it is what the app spreads a medicine's reminder times across, so answering it here
   * puts the first cream's times in the hours this household is actually awake
   * (`sheets/care/careTimes.ts`).
   */
  quiet_hours: { from: string; to: string } | null;
  /**
   * When this household's day starts and ends — the pair that decides whether a sleep is written
   * down as a nap or as night sleep (`today/dayWindow.ts`, migration 0095).
   *
   * Asked on the same step as the rhythms because it is the same question in a different shape:
   * "what does your day look like". Null is "did not say", and it stays null unless the parent
   * moves one of the two times — a household that skipped it has NO ROW anywhere and every
   * device reads the default pair, which is exactly what the app did before it was asked.
   *
   * It is not quiet hours and the two are deliberately separate. Quiet hours say when not to be
   * DISTURBED; this says when the household is AWAKE. A parent who takes a call at 11 p.m. still
   * calls a 9 p.m. sleep the night.
   */
  day_window: { wake: string; bed: string } | null;
  /**
   * THE HOUSEHOLD'S MILK UNIT — ounces or milliliters for every bottle, pump and stash amount — or
   * null for "did not say", which is ounces (migration 0128; the owner, 2026-09-26: *"in what
   * modules you track, i think this needs to be asked under milk stash if you use mL or oz"*, and
   * *"make the oz/mL setting household-wide"*). Asked on the feeding step, under the milk stash's
   * switch, when the household gives bottles, pumps or keeps a stash; written into the household at
   * creation (`SetupSeed.volumeUnit`) so a partner who joins inherits it with nothing to set.
   */
  volume_unit: VolumeUnit | null;
  /**
   * Step 6. The brand of the everyday things, keyed by ENTRY — `DIAPERS: 'Pampers'` for the first
   * of that category, and a slot id for a second product on the same shelf (`supply_slots`).
   *
   * The owner, 2026-09-16: "add one more option that lets you to enter brand of each items used
   * for the baby (to fill out supplies), but have the option to do this later". A brand is the
   * one fact about a supply that a parent knows without checking and a co-parent cannot guess,
   * and it is what makes the shopping list say something other than "diapers" in a shop.
   *
   * THE BRAND IS WHAT THE ROW ASKS FOR; everything else is behind "add details" (see
   * `supply_details`). Every one is optional and the step can be passed through whole; an empty
   * map seeds nothing at all. Several products in one category are allowed (the owner, 2026-10-02).
   */
  supply_brands: Record<string, string>;
  /**
   * THE REST OF A SUPPLY, for a parent who has the pack in their hand right now (the owner,
   * 2026-09-18: "if users want to fill the detail for each product (not just the brand) have the
   * options to do so, to show all the details").
   *
   * Entry key → field → what they typed, for the fields in `SUPPLY_DETAIL_FIELDS`. It is a second
   * map rather than a richer `supply_brands` for two reasons: the brand is the one thing the step
   * ASKS for and stays one field per row, and a saved draft from an earlier build parses against
   * the old shape unchanged — a map that is simply absent reads as "no details", which is true.
   *
   * The reasoning that used to say a setup screen must not ask for these still holds for the
   * DEFAULT — none of them is on the screen until the row is opened, so the step is exactly as
   * long as it was. What was wrong was making it impossible: a parent restocking from the
   * cupboard as they set the app up knows the size and the count, and telling them to come back
   * later for a field that is one tap away is the app deciding it knows better.
   *
   * THE KEY IS THE ENTRY, not only the category: the first of each category uses the category id
   * itself (so an older draft resumes unchanged); a second cream, a second balm, another bottle
   * brand uses a slot id from `supply_slots` (the owner, 2026-10-02: several products in one
   * category on setup).
   */
  supply_details: Record<string, Record<string, string>>;
  /**
   * EXTRA SUPPLY ROWS beyond the one default per category (the owner, 2026-10-02: three creams
   * under Creams and balm). `id` is the key in `supply_brands` / `supply_details`; `category` is
   * the catalog shelf. Absent in a draft from before this existed, which reads as none.
   */
  supply_slots: { id: string; category: string }[];
  /**
   * Step 6's one question: where they heard about the app, or null for "did not say". Null is
   * the resting state and the only default; tapping the chosen chip again returns to it. It
   * rides the bootstrap payload as `household.heard_from` and is dropped from it when null.
   */
  heard_from: HeardFrom | null;
}

export function initialDraft(clientOpId: string): OnboardingDraft {
  return {
    step: 1,
    client_op_id: clientOpId,
    display_name: '',
    role_choice: null,
    household_name: null,
    child_name: '',
    child_photo_uri: null,
    expecting: false,
    birth_date: null,
    birth_confirmed: false,
    born_early: false,
    due_date: null,
    /*
      EVERY WAY OF FEEDING STARTS ON (the owner, 2026-09-28: *"what if the default is everything on
      all 4 modules, then they can disable it if they dont want it"*), as every switch on the next
      step already does. It started empty, on the reasoning that asking means not assuming the
      answer; but the step has no Skip, so an empty start was a question a parent could not pass
      without answering, and turning off what a household does not use is one tap per card. The
      step still needs one card on (`canAdvance`), so a parent who turns all four off is asked
      again, never sent on with no way to log a feed.
    */
    feeding: FEEDING_CARDS.map(c => c.id),
    bottle_suggested: false,
    extras: {},
    intervals: {},
    cadences: {},
    timing: {},
    setTimes: {},
    setDays: {},
    setMeals: {},
    cadenceDays: {},
    cadenceAt: {},
    night: {},
    timesADay: {},
    goals: {},
    quiet_hours: null,
    day_window: null,
    volume_unit: null,
    medicines: [],
    supply_brands: {},
    supply_details: {},
    supply_slots: [],
    heard_from: null,
  };
}

export type OnboardingAction =
  | { type: 'set_name'; value: string }
  | { type: 'set_role'; value: RoleChoice }
  | { type: 'set_household_name'; value: string | null }
  | { type: 'set_child_name'; value: string }
  | { type: 'set_child_photo'; uri: string | null }
  | { type: 'set_expecting'; value: boolean }
  | { type: 'set_birth_date'; value: string | null }
  | { type: 'confirm_birth_date' }
  | { type: 'set_born_early'; value: boolean }
  | { type: 'set_due_date'; value: string | null }
  | { type: 'toggle_feeding'; card: FeedingCard }
  | { type: 'toggle_extra'; module: ModuleId; value: boolean }
  | { type: 'set_interval'; module: ModuleId; minutes: number | null }
  | { type: 'set_cadence'; module: ModuleId; days: number | null }
  | { type: 'set_timing'; module: ModuleId; timing: 'INTERVAL' | 'FIXED' }
  | { type: 'set_rhythm'; module: ModuleId; rhythm: SetupRhythm }
  | { type: 'set_set_times'; module: ModuleId; times: readonly string[] }
  | { type: 'set_night'; module: ModuleId; mode: NightMode; everyMinutes: number | null }
  | { type: 'set_times_a_day'; module: ModuleId; times: number | null }
  | { type: 'set_goal'; module: ModuleId; minutes: number | null }
  | { type: 'set_quiet_hours'; hours: { from: string; to: string } | null }
  | { type: 'set_day_window'; window: { wake: string; bed: string } | null }
  | { type: 'set_volume_unit'; unit: VolumeUnit }
  /**
   * `category` here is the ENTRY KEY in `supply_brands` — the category id for the first of that
   * shelf, or a `supply_slots` id for a second product on the same shelf.
   */
  | { type: 'set_supply_brand'; category: string; brand: string }
  | { type: 'set_supply_detail'; category: string; field: string; value: string }
  | { type: 'add_supply_slot'; id: string; category: string }
  | { type: 'remove_supply_slot'; id: string }
  | { type: 'set_heard_from'; value: HeardFrom | null }
  | { type: 'add_medicine'; medicine: DraftMedicine }
  | { type: 'remove_medicine'; id: string }
  | { type: 'next'; today: string }
  | { type: 'back' }
  | { type: 'reset'; clientOpId: string };

export interface StepCheck {
  ok: boolean;
  reason?: string;
}

/**
 * TWO PEOPLE REACH STEP 1, AND ONLY ONE OF THEM HAS A BABY TO DESCRIBE (the first-day trace,
 * 2026-09-25).
 *
 * `setup` is somebody making a household: their name, the household's, their role in it, the
 * baby. `join` is somebody holding an invite — the partner who typed a code on the first screen,
 * or opened a link — and for them the household, its baby and their own role in it already exist
 * on the server. `accept_invite` (migration 0124) takes the code or the token and a display name,
 * and nothing else: the role is the INVITE's (`household_members.role = v_inv.role`), chosen by
 * whoever made the code, and the baby is the household's.
 *
 * So a joiner is asked their name and nothing more. Step 1 used to put all eight questions to them
 * and `canAdvance` required the baby's name and date of birth, so a partner had to invent a baby
 * the app then threw away — and pick a role the server overwrote without looking at it.
 */
export type OnboardingPath = 'setup' | 'join';

/**
 * Whether the current step may advance; the reasons are keys the screen turns into copy.
 *
 * On the `join` path there is one question whatever step a resumed draft stands on — the join
 * page is not one of the five, and nothing the other steps ask reaches `accept-invite`.
 */
export function canAdvance(
  d: OnboardingDraft,
  todayIso: string,
  path: OnboardingPath = 'setup',
): StepCheck {
  if (path === 'join') {
    return DisplayNameSchema.safeParse(d.display_name).success
      ? { ok: true }
      : { ok: false, reason: 'display_name' };
  }
  switch (d.step) {
    case 1: {
      if (!DisplayNameSchema.safeParse(d.display_name).success)
        return { ok: false, reason: 'display_name' };
      if (d.role_choice === null) return { ok: false, reason: 'role_choice' };
      if (
        !HouseholdNameSchema.safeParse(d.household_name ?? defaultHouseholdName(d.display_name))
          .success
      ) {
        return { ok: false, reason: 'household_name' };
      }
      if (d.expecting) {
        // a name may wait for the birth; one that is typed is held to the same rule
        if (d.child_name.trim() !== '' && !ChildNameSchema.safeParse(d.child_name).success)
          return { ok: false, reason: 'child_name' };
        const due = expectedDueVerdict(d.due_date, todayIso);
        return due === 'ok' ? { ok: true } : { ok: false, reason: `due_date.${due}` };
      }
      if (!ChildNameSchema.safeParse(d.child_name).success)
        return { ok: false, reason: 'child_name' };
      const verdict = birthDateVerdict(d.birth_date, todayIso);
      if (verdict === 'invalid' || verdict === 'future' || verdict === 'too_old')
        return { ok: false, reason: `birth_date.${verdict}` };
      if (verdict === 'confirm' && !d.birth_confirmed)
        return { ok: false, reason: 'birth_date.confirm' };
      if (d.born_early) {
        if (!d.due_date || !IsoDateSchema.safeParse(d.due_date).success)
          return { ok: false, reason: 'due_date' };
        if (!dueDateWithinWindow(d.birth_date as string, d.due_date))
          return { ok: false, reason: 'due_date.window' };
      }
      return { ok: true };
    }
    case 2:
      // a way to log a feed must exist, and since 2026-09-24 there is no skip to stand in for one
      // (the owner: "remove skip for now") — the day, the tiles and the rhythms are built from it
      if (d.feeding.length === 0) return { ok: false, reason: 'feeding' };
      return { ok: true };
    case 3:
    case 4:
    case 5:
      // steps 3 to 5 are entirely optional: a rhythm nobody picked is a rule nobody wanted,
      // and a brand nobody typed is a catalog entry nobody asked for
      return { ok: true };
  }
}

/** An invite as a phone holds it: a code of six letters (0144), or a link's token — one of the two. */
export interface InviteSecret {
  code?: string;
  token?: string;
}

/** Exactly what `accept-invite` is sent from the join page (see `OnboardingPath`). */
export interface JoinRequest {
  code?: string;
  token?: string;
  display_name: string;
}

/**
 * THE JOIN PAGE'S ONE CALL, built from the invite and the name typed above it and from nothing
 * else in the draft. A resumed draft can carry a baby, a household name and a role from a setup
 * that was started before the invite arrived; none of it is the server's business here, and none
 * of it is sent. A link's token wins over a code, as the server reads them (`accept_invite`).
 */
export function joinRequestFrom(d: OnboardingDraft, invite: InviteSecret): JoinRequest {
  const secret: InviteSecret = invite.token
    ? { token: invite.token }
    : invite.code
      ? { code: invite.code }
      : {};
  return { ...secret, display_name: d.display_name.trim() };
}

/**
 * WHICH RHYTHMS HAVE A NIGHT, so the preselect below never answers a question the screen does
 * not ask.
 *
 * NAPS DO NOT (the owner, 2026-09-22: *"Naps rhythm does not make sense to have 'night
 * interval', as baby sleeps through the whole night remove this option"*). The picker stopped
 * DRAWING the night chips for that row the same day (`rhythms.ts` `RhythmRow.night`), but the
 * reducer went on deriving one from the day value — so a parent who set "a nap about every 2h"
 * finished setup with a night rule saying "every 3h overnight" that they had never seen and
 * could not have cleared, and it reached the schedule.
 *
 * A list rather than a flag on the row, because the row shape lives in the app and this is the
 * pure half; the two are held together by `rhythms.test.ts`.
 */
/**
 * THE RHYTHMS THE RULE SHEET CAN STATE AS "EVERY FEW HOURS" — feeding (either side), pumping and
 * diapers. Solids and naps are set times or nothing on the Routine page (`modesFor`), so a setup
 * answer that made one an interval would be a rule that page has no segment for. The app's
 * `modesFor` is held to this list by `rhythmForm.test.ts`.
 */
export const INTERVAL_RHYTHMS: ReadonlySet<ModuleId> = new Set<ModuleId>([
  'bottle',
  'breastfeed',
  'pump',
  'diaper',
]);

const NIGHT_IS_ASKED: ReadonlySet<string> = new Set([
  'bottle',
  'breastfeed',
  'pump',
  'diaper',
  'solids',
]);

export function onboardingReducer(d: OnboardingDraft, a: OnboardingAction): OnboardingDraft {
  switch (a.type) {
    case 'set_name':
      return { ...d, display_name: a.value };
    case 'set_role':
      return { ...d, role_choice: a.value };
    case 'set_household_name':
      return { ...d, household_name: a.value };
    case 'set_child_name':
      return { ...d, child_name: a.value };
    case 'set_child_photo':
      return { ...d, child_photo_uri: a.uri };
    case 'set_expecting':
      // the due date stays whichever way the answer goes: typed for a baby on the way, it is the
      // date "Born early" asks for if the baby turns out to be here after all
      return { ...d, expecting: a.value, born_early: false, birth_confirmed: false };
    case 'set_birth_date':
      return { ...d, birth_date: a.value, birth_confirmed: false };
    case 'confirm_birth_date':
      return { ...d, birth_confirmed: true };
    case 'set_born_early':
      return { ...d, born_early: a.value, due_date: a.value ? d.due_date : null };
    case 'set_due_date':
      return { ...d, due_date: a.value };
    case 'toggle_feeding': {
      let feeding = d.feeding.includes(a.card)
        ? d.feeding.filter(c => c !== a.card)
        : [...d.feeding, a.card];
      let bottleSuggested = d.bottle_suggested;
      // Pumping without Bottles selects the Bottles card too — visibly, once, and the screen says
      // why (SETUP.md §2). A suggestion, not a lock: the parent can deselect it right here, and
      // it is not applied a second time.
      if (a.card === 'pumping' && modulesForFeeding(feeding, bottleSuggested).bottleSuggested) {
        feeding = [...feeding, 'bottles'];
        bottleSuggested = true;
      }
      return { ...d, feeding, bottle_suggested: bottleSuggested };
    }
    case 'toggle_extra':
      return { ...d, extras: { ...d.extras, [a.module]: a.value } };
    case 'set_interval': {
      // a second tap on the chosen chip clears it: the only way back to "no rhythm at all" once
      // one has been tapped, and the screen draws the chip as selected so the tap is obvious
      const intervals = { ...d.intervals };
      if (a.minutes === null) delete intervals[a.module];
      else intervals[a.module] = a.minutes;
      /**
       * THE NIGHT, PRESELECTED AN HOUR LONGER (the owner, 2026-09-22: "preselect the option +1
       * hour from whatever the default for during the day... remember user can always change
       * this, dont worry about preselecting for them"). A day value with no night answer yet gets
       * one for free — a longer gap is the ordinary shape of a night, and a parent who wants
       * something else is one tap away from any of the three night chips, or None. It is only a
       * STARTING point: this never overwrites a night the household already has an answer for,
       * and it never fires on its own — only the same tap that sets the day value.
       */
      const night =
        a.minutes === null || d.night[a.module] !== undefined || !NIGHT_IS_ASKED.has(a.module)
          ? d.night
          : { ...d.night, [a.module]: { mode: 'LONGER' as const, everyMinutes: a.minutes + 60 } };
      return { ...d, intervals, night };
    }
    case 'set_timing': {
      /* Switching away from set times does NOT clear them, and switching back does not clear the
         interval: a parent who taps the other segment to see what is there and taps back has not
         asked to lose what they typed. Only what the chosen timing points at is ever seeded. */
      return { ...d, timing: { ...d.timing, [a.module]: a.timing } };
    }
    case 'set_rhythm':
      return withRhythm(d, a.module, a.rhythm);
    case 'set_set_times': {
      const setTimes = { ...d.setTimes };
      // in clock order and without duplicates: two rules at 10:00 are one slot drawn twice
      const times = [...new Set(a.times)].sort();
      if (times.length === 0) delete setTimes[a.module];
      else setTimes[a.module] = times;
      // times given without meals are read by their clock again, never beside a stale meal list
      const setMeals = { ...d.setMeals };
      delete setMeals[a.module];
      return { ...d, setTimes, setMeals };
    }
    case 'set_night': {
      const night = { ...d.night };
      // NONE is "the same round the clock", which is the absence of a night rather than a mode
      if (a.mode === 'NONE') delete night[a.module];
      else night[a.module] = { mode: a.mode, everyMinutes: a.everyMinutes };
      return { ...d, night };
    }
    case 'set_quiet_hours':
      return { ...d, quiet_hours: a.hours };
    case 'set_day_window': {
      /*
        A REMINDER AT THE DAY'S START MOVES WITH IT (the owner, 2026-09-30: vitamin D *"depends on
        when baby's day starts. if it start at 7.30, then set 7.30, if 8.30, then 8.30"*). A
        medicine's "Morning" on this step is the wake time (the app's `medicineTimes`), so a morning
        chosen before the wake time is moved is at the new wake time, not left at the old one. Only
        while setup lasts: afterwards every time is the item's own.
      */
      const was = (d.day_window ?? DEFAULT_DAY_WINDOW).wake;
      const now = (a.window ?? DEFAULT_DAY_WINDOW).wake;
      const medicines =
        was === now
          ? d.medicines
          : d.medicines.map(m => ({
              ...m,
              times: [...new Set(m.times.map(at => (at === was ? now : at)))],
            }));
      return { ...d, day_window: a.window, medicines };
    }
    case 'set_volume_unit':
      return { ...d, volume_unit: a.unit };
    case 'set_heard_from':
      return { ...d, heard_from: a.value };
    case 'set_supply_brand': {
      /**
       * STORED AS TYPED, TRIMMED AT THE BOUNDARY.
       *
       * This used to `.trim()` on every keystroke, which meant a space could never survive one:
       * typing "Water" then space stored "Water", the field re-rendered as "Water", and the
       * cursor never moved. Every two-word brand on the shelf was unreachable — Water Wipes,
       * Dr. Brown's, Baby Dove (the owner, 2026-09-17: "spaces are not allowed to input").
       *
       * `setupSeedFrom` already trims when it builds the seed, which is the right place: the
       * field holds what the parent typed, the catalog gets it tidied. Only the EMPTINESS test
       * trims here, because "   " is a cleared field and a catalog item with no name in it is
       * worse than none (cleared is ABSENT, not an empty string).
       *
       * `a.category` is the ENTRY KEY (the category id, or a `supply_slots` id). Clearing an
       * EXTRA slot removes the row entirely; clearing the first of a category leaves the empty
       * "Tap to add" row.
       */
      const next = { ...d.supply_brands };
      if (a.brand.trim().length === 0) {
        delete next[a.category];
        const slots = d.supply_slots ?? [];
        const slot = slots.find(s => s.id === a.category);
        if (slot) {
          const details = { ...d.supply_details };
          delete details[a.category];
          return {
            ...d,
            supply_brands: next,
            supply_details: details,
            supply_slots: slots.filter(s => s.id !== a.category),
          };
        }
      } else next[a.category] = a.brand;
      return { ...d, supply_brands: next };
    }
    /**
     * The same rule as the brand, one level down: what the parent typed is kept verbatim, a
     * field trimmed to nothing is DELETED rather than stored as '', and a category whose last
     * field is cleared leaves no empty object behind — so `setupSeedFrom` can read "is there
     * anything here" as a key test rather than a scan.
     *
     * A field this build does not know is ignored. The onboarding draft is persisted and a
     * household can resume it after an update; a key from a later build must not become a
     * column nobody can read.
     */
    case 'set_supply_detail': {
      if (!SUPPLY_DETAIL_FIELDS.includes(a.field as SupplyDetailField)) return d;
      const forCategory = { ...(d.supply_details[a.category] ?? {}) };
      if (a.value.trim().length === 0) delete forCategory[a.field];
      else forCategory[a.field] = a.value;
      const next = { ...d.supply_details };
      if (Object.keys(forCategory).length === 0) delete next[a.category];
      else next[a.category] = forCategory;
      return { ...d, supply_details: next };
    }
    case 'add_supply_slot': {
      // a second (or third) product on a shelf the catalog knows — never a unknown category, and
      // never an id that collides with a category id (those keys are the first of each shelf)
      if (!(SUPPLY_CATEGORY_IDS as readonly string[]).includes(a.category)) return d;
      if ((SUPPLY_CATEGORY_IDS as readonly string[]).includes(a.id)) return d;
      const slots = d.supply_slots ?? [];
      if (slots.some(s => s.id === a.id)) return d;
      return { ...d, supply_slots: [...slots, { id: a.id, category: a.category }] };
    }
    case 'remove_supply_slot': {
      const slots = d.supply_slots ?? [];
      if (!slots.some(s => s.id === a.id)) return d;
      const brands = { ...d.supply_brands };
      const details = { ...d.supply_details };
      delete brands[a.id];
      delete details[a.id];
      return {
        ...d,
        supply_slots: slots.filter(s => s.id !== a.id),
        supply_brands: brands,
        supply_details: details,
      };
    }
    case 'set_times_a_day': {
      const timesADay = { ...d.timesADay };
      if (a.times === null) delete timesADay[a.module];
      else timesADay[a.module] = a.times;
      return { ...d, timesADay };
    }
    case 'set_goal': {
      const goals = { ...d.goals };
      if (a.minutes === null) delete goals[a.module];
      else goals[a.module] = a.minutes;
      return { ...d, goals };
    }
    case 'set_cadence': {
      const cadences = { ...d.cadences };
      if (a.days === null) delete cadences[a.module];
      else cadences[a.module] = a.days;
      return { ...d, cadences };
    }
    case 'add_medicine':
      return { ...d, medicines: [...d.medicines, a.medicine] };
    case 'remove_medicine':
      return { ...d, medicines: d.medicines.filter(m => m.id !== a.id) };
    case 'next': {
      if (!canAdvance(d, a.today).ok || d.step === LAST_ONBOARDING_STEP) return d;
      return { ...d, step: (d.step + 1) as OnboardingStep };
    }
    case 'back':
      return d.step === 1 ? d : { ...d, step: (d.step - 1) as OnboardingStep };
    case 'reset':
      return initialDraft(a.clientOpId);
  }
}

/**
 * ONE MODULE'S WHOLE ANSWER, written the way a Save on the Rule sheet writes one: the chosen way
 * and everything it needs, and every OTHER way's fields for that module cleared — so the draft
 * never carries a half-remembered goal beside a set of times, and what `setupSeedFrom` reads is
 * exactly what the sheet showed when the parent pressed Save.
 *
 * `OFF` is kept as an answer (`timing`), not as an absence, so a starting point the step applies
 * on arrival never lands on a rhythm the parent has turned off.
 */
function withRhythm(d: OnboardingDraft, module: ModuleId, r: SetupRhythm): OnboardingDraft {
  const without = <T>(map: Partial<Record<ModuleId, T>>): Partial<Record<ModuleId, T>> => {
    const next = { ...map };
    delete next[module];
    return next;
  };
  const cleared: OnboardingDraft = {
    ...d,
    intervals: without(d.intervals),
    night: without(d.night),
    setTimes: without(d.setTimes),
    setDays: without(d.setDays),
    setMeals: without(d.setMeals),
    cadences: without(d.cadences),
    cadenceDays: without(d.cadenceDays),
    cadenceAt: without(d.cadenceAt),
    goals: without(d.goals),
    timing: without(d.timing),
  };
  const everyDay = (days: readonly number[]): boolean =>
    days.length === 0 || new Set(days).size === 7;
  switch (r.mode) {
    case 'off':
      return { ...cleared, timing: { ...cleared.timing, [module]: 'OFF' } };
    case 'interval':
      return {
        ...cleared,
        timing: { ...cleared.timing, [module]: 'INTERVAL' },
        intervals: { ...cleared.intervals, [module]: r.everyMinutes },
        night:
          r.night === null || r.night.mode === 'NONE'
            ? cleared.night
            : { ...cleared.night, [module]: { ...r.night } },
      };
    case 'times': {
      // the meals in clock order, each one's time among the times whatever the caller sent
      const meals = r.meals === undefined ? [] : byClock(r.meals).map(m => ({ ...m }));
      // in clock order and without duplicates: two rules at 10:00 are one slot drawn twice
      const times = [...new Set([...r.times, ...meals.map(m => m.at)])].sort();
      if (times.length === 0) return { ...cleared, timing: { ...cleared.timing, [module]: 'OFF' } };
      const days = [...new Set(r.days)].sort((x, y) => x - y);
      return {
        ...cleared,
        timing: { ...cleared.timing, [module]: 'FIXED' },
        setTimes: { ...cleared.setTimes, [module]: times },
        setDays: everyDay(days) ? cleared.setDays : { ...cleared.setDays, [module]: days },
        setMeals: meals.length === 0 ? cleared.setMeals : { ...cleared.setMeals, [module]: meals },
      };
    }
    case 'cadence': {
      const days = [...new Set(r.days)].sort((x, y) => x - y);
      return {
        ...cleared,
        cadences: { ...cleared.cadences, [module]: r.everyDays },
        cadenceDays:
          days.length === 0 ? cleared.cadenceDays : { ...cleared.cadenceDays, [module]: days },
        cadenceAt: { ...cleared.cadenceAt, [module]: r.at },
      };
    }
    case 'quota':
      return { ...cleared, goals: { ...cleared.goals, [module]: r.minutes } };
  }
}

/**
 * The modules the draft turns on.
 *
 * THE BOTTLES SUGGESTION IS NEVER APPLIED HERE (2026-09-25), because the reducer has already
 * applied it where the parent can see it: to the CARDS (`toggle_feeding`), once, with a line on the
 * page saying why. So the Bottles card is the whole answer, and `true` tells `modulesForFeeding` the
 * suggestion has been dealt with. It used to pass `bottle_suggested`, which is false for a parent
 * who picked Bottles BEFORE Pumping — so turning the Bottles card off afterwards left the bottle
 * module on, with the card reading off. The pumping question (`pumpingWithout`) made that a lie
 * the parent is told to their face: "Keep it off" has to mean off.
 */
export function draftModules(d: OnboardingDraft): ModuleId[] {
  return enabledModuleIds(d.feeding, d.extras, true);
}

/**
 * WHAT "TURN THEM ON" DOES, answering the pumping question (`pumpingWithout`): each module that is
 * off, turned on through the very switch a tap on the page would use — the Bottles card and the
 * Milk stash switch — so the draft cannot tell the answer from the taps. Nothing for one that is
 * already on, and the card is only toggled while it is off, because `toggle_feeding` is a toggle.
 */
export function pumpingPartnersOn(
  d: OnboardingDraft,
  off: readonly PumpingPartner[],
): OnboardingAction[] {
  const actions: OnboardingAction[] = [];
  if (off.includes('bottles') && !d.feeding.includes('bottles'))
    actions.push({ type: 'toggle_feeding', card: 'bottles' });
  if (off.includes('stash')) actions.push({ type: 'toggle_extra', module: 'stash', value: true });
  return actions;
}

export interface SetupSeed {
  /**
   * An INTERVAL rule each, with the night the parent chose written into its own columns. `night`
   * is absent for a rhythm that runs the same round the clock, which is most of them.
   */
  intervals: {
    activity: ModuleId;
    everyMinutes: number;
    night?: SetupNight | undefined;
  }[];
  /** `days` — chosen weekdays — replaces "every N days" when present; `at` is the time of day. */
  cadences: {
    activity: ModuleId;
    everyDays: number;
    days?: number[] | undefined;
    at?: string | undefined;
  }[];
  /**
   * A FIXED rule per clock time — the Rule sheet's "At set times", answerable in setup since
   * 2026-09-21. One entry per activity, its times in clock order, and `days` when the times keep
   * only some weekdays (absent is every day).
   *
   * `meals`, for solids (2026-09-28): the meal each of those times is, so its rule is named for it —
   * "Breakfast", "Lunch", "Snack", "Dinner" — and a time no meal accounts for is written unnamed,
   * as it was. Absent for every other rhythm, and in a record from a build before meals.
   */
  setTimes: {
    activity: ModuleId;
    times: string[];
    days?: number[] | undefined;
    meals?: MealTime[] | undefined;
  }[];
  /**
   * THE BEDTIME, when the household moved the bed end of their day and tracks sleep.
   *
   * The Routine page's rule is that the bed time IS the bedtime: moving it writes the day window
   * AND the named FIXED sleep rule the day strip, Today's hero and the sleep anchor all read
   * (`RoutineScreen.setBedtime`). Setup asked the same question and wrote only the window, so a
   * brand-new household had a bed time everywhere except on its own schedule. `null` when they
   * left the two times alone or do not track sleep — no rule, exactly as before.
   */
  bedtime: string | null;
  /** A count per day, seeded as that many DAY-scoped FIXED rules (`setTimesADay`). */
  timesADay: { activity: ModuleId; times: number }[];
  /** A daily goal in minutes, seeded as the module's setting (`saveModuleGoal`) — no rule. */
  goals: { activity: ModuleId; minutes: number }[];
  /** Written to every remindable channel at once, the way the notifications screen writes it. */
  quietHours: { from: string; to: string } | null;
  /** The household's waking window, or null when the parent left it alone — no row is written. */
  dayWindow: { wake: string; bed: string } | null;
  /**
   * The household's milk unit (0128), or null when the parent never chose one — no row is written
   * and every phone reads ounces. Seeded whatever the modules say, like a brand: a household that
   * turns bottles on later still measures in the unit it chose.
   */
  volumeUnit: VolumeUnit | null;
  medicines: DraftMedicine[];
  /**
   * One catalog item per brand the parent named — several may share a category (the owner,
   * 2026-10-02) — in `SUPPLY_CATEGORIES` order, carrying whatever else they opened "add details"
   * and filled in. `details` is absent when they did not.
   */
  // `| undefined` explicitly, because this seed is PARSED from a stored record on the way back in
  // (`pending-setup.ts`) and a zod `.optional()` produces the key holding undefined, which
  // `exactOptionalPropertyTypes` treats as a different type from the key being absent
  supplies: { category: string; brand: string; details?: Record<string, string> | undefined }[];
}

/**
 * What step 5 asks the app to create once the household exists — the rules and the care items
 * `bootstrap_household` does not carry, because they are local-first writes like any other
 * (docs/OFFLINE_SYNC.md): the client makes them, the outbox pushes them, and they survive with
 * no network exactly as a logged feed does.
 *
 * A rhythm for a module that is OFF is dropped rather than created. A parent can pick "every
 * 3h" on step 5 and then go back to step 4 and turn the module off; creating the rule anyway
 * would put a schedule on the tab for something the app is not tracking. The order is the
 * registry's, so two runs of the same answers seed in the same order.
 */
export function setupSeedFrom(d: OnboardingDraft): SetupSeed {
  const on = new Set(draftModules(d));
  const positive = (n: number | undefined): n is number => typeof n === 'number' && n > 0;
  // "Off", chosen on the sheet: nothing of this module's is seeded, whatever else the draft holds
  const off = (m: ModuleId): boolean => d.timing[m] === 'OFF';
  const fixed = (m: ModuleId): boolean => d.timing[m] === 'FIXED';
  return {
    /* A row set to `FIXED` seeds its TIMES and not its interval, even where both are in the
       draft: the timing is the answer, and the other half is what the parent did not choose.
       And only where the Rule sheet can state an interval at all (`INTERVAL_RHYTHMS`): a nap or a
       meal "every 2h" is a rule the Routine page has no segment for. */
    intervals: MODULES.filter(
      m =>
        on.has(m.id) &&
        INTERVAL_RHYTHMS.has(m.id) &&
        positive(d.intervals[m.id]) &&
        !fixed(m.id) &&
        !off(m.id),
    ).map(m => {
      const night = d.night[m.id];
      return {
        activity: m.id,
        everyMinutes: d.intervals[m.id] as number,
        ...(night === undefined ? {} : { night }),
      };
    }),
    setTimes: MODULES.filter(
      m => on.has(m.id) && fixed(m.id) && (d.setTimes[m.id]?.length ?? 0) > 0,
    ).map(m => {
      const days = d.setDays[m.id];
      const times = [...(d.setTimes[m.id] as string[])].sort();
      /* SOLIDS' TIMES GO AS MEALS (2026-09-28): the table's own, or, for a draft from a build
         before the table, its times read by their clock — so what the form showed is what the
         seeder names, and a time no meal takes is still written, unnamed. */
      const kept = m.id === MEAL_ACTIVITY ? (d.setMeals[m.id] ?? []) : [];
      const meals =
        m.id !== MEAL_ACTIVITY
          ? []
          : kept.length > 0
            ? byClock(kept.filter(x => times.includes(x.at))).map(x => ({ ...x }))
            : mealsForTimes(times);
      return {
        activity: m.id,
        times,
        ...(days === undefined || days.length === 0 || days.length === 7
          ? {}
          : { days: [...days] }),
        ...(meals.length === 0 ? {} : { meals }),
      };
    }),
    /* The bed end of the day, when the household both moved it and tracks sleep. A bedtime rule
       for a household with the sleep module off would be a row on a tab that is not there. */
    bedtime: d.day_window !== null && on.has('sleep') ? d.day_window.bed : null,
    cadences: MODULES.filter(m => on.has(m.id) && !off(m.id) && positive(d.cadences[m.id])).map(
      m => {
        const days = d.cadenceDays[m.id];
        const at = d.cadenceAt[m.id];
        return {
          activity: m.id,
          everyDays: d.cadences[m.id] as number,
          ...(days === undefined || days.length === 0 ? {} : { days: [...days] }),
          ...(at === undefined ? {} : { at }),
        };
      },
    ),
    timesADay: MODULES.filter(m => on.has(m.id) && positive(d.timesADay[m.id])).map(m => ({
      activity: m.id,
      times: d.timesADay[m.id] as number,
    })),
    /* a goal is the "Daily goal" segment, so a row answered with times — or Off — seeds none */
    goals: MODULES.filter(
      m => on.has(m.id) && !fixed(m.id) && !off(m.id) && positive(d.goals[m.id]),
    ).map(m => ({
      activity: m.id,
      minutes: d.goals[m.id] as number,
    })),
    quietHours: d.quiet_hours,
    dayWindow: d.day_window,
    volumeUnit: d.volume_unit,
    // nothing to remind about if the module that draws them is off
    medicines: on.has('med') ? d.medicines.filter(m => m.name.trim().length > 0) : [],
    /**
     * A NAMED BRAND IS SEEDED WHATEVER THE MODULES SAY, unlike a rhythm. A rhythm for a module
     * that is off would put a schedule on a tab for something the app is not tracking; a catalog
     * entry is just a note about what this household buys, and the Supplies screen draws every
     * category regardless. Turning the diaper module off is not a reason to forget the brand.
     *
     * THE ORDER IS CATALOG ORDER, then extras of that category in the order they were added, so
     * two runs of the same answers seed identically. A category this build does not know is
     * dropped rather than seeded as `OTHER` — a wrong shelf is worse than a missing one.
     *
     * SEVERAL PRODUCTS ON ONE SHELF (the owner, 2026-10-02): the first of each category uses the
     * category id as its entry key; further ones live in `supply_slots` and are seeded beside it.
     */
    supplies: (() => {
      const out: SetupSeed['supplies'] = [];
      const emit = (entry: string, category: string) => {
        const brand = (d.supply_brands[entry] ?? '').trim();
        if (brand.length === 0) return;
        const typed = d.supply_details[entry] ?? {};
        const details: Record<string, string> = {};
        for (const field of SUPPLY_DETAIL_FIELDS) {
          const v = (typed[field] ?? '').trim().replace(/\s+/g, ' ');
          if (v.length > 0) details[field] = v;
        }
        out.push(
          Object.keys(details).length === 0 ? { category, brand } : { category, brand, details },
        );
      };
      for (const id of SUPPLY_CATEGORY_IDS) {
        emit(id, id);
        for (const slot of d.supply_slots ?? []) {
          if (slot.category === id) emit(slot.id, id);
        }
      }
      return out;
    })(),
  };
}

export interface BootstrapContext {
  locale: string;
  time_zone: string;
}

/** What the last step's button sends. */
export function bootstrapPayloadFrom(d: OnboardingDraft, ctx: BootstrapContext): BootstrapPayload {
  const payload: BootstrapPayload = {
    client_op_id: d.client_op_id,
    profile: { display_name: d.display_name.trim(), locale: ctx.locale, time_zone: ctx.time_zone },
    household: {
      name: (d.household_name ?? defaultHouseholdName(d.display_name)).trim(),
      home_time_zone: ctx.time_zone,
      // absent, not null: an unanswered optional question is not a fact about the household
      ...(d.heard_from ? { heard_from: d.heard_from } : {}),
    },
    child: d.expecting
      ? // on the way: the due date only, and the stand-in name when none was chosen yet
        { name: d.child_name.trim() || UNNAMED_CHILD, due_date: d.due_date ?? '' }
      : {
          name: d.child_name.trim(),
          birth_date: d.birth_date ?? '',
          ...(d.born_early && d.due_date ? { due_date: d.due_date } : {}),
        },
    modules: draftModules(d),
  };
  return BootstrapPayloadSchema.parse(payload);
}
