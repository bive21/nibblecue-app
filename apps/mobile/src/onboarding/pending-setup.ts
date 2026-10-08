/**
 * What step 5 asked for, held on disk until there is a household to write it into.
 *
 * The rhythms and the medicines a parent chose during setup are NOT part of the bootstrap
 * payload: they are ordinary local-first writes (`docs/OFFLINE_SYNC.md`) — a schedule rule and
 * a care item, made by the client, pushed by the outbox — and the server has no branch for
 * them. So `finish()` writes them here, one record, and `SetupSeeder` drains it as soon as the
 * app has a household id and a local database.
 *
 * WHY A RECORD RATHER THAN A CALL IN `finish()`. The household is created by a round trip; the
 * onboarding screen is unmounted the moment the account refreshes and the navigator swaps to
 * the app. Anything awaited across that boundary is a write that can be lost to a re-render, a
 * kill or a dropped connection — and losing a log is the one thing this app may never do
 * (CLAUDE.md §2 rule 7). A record survives all three: the seeder retries on the next launch
 * and every write it makes is idempotent by its own client id.
 *
 * It is keyed by USER, like the draft it comes from, and it is not a device-level key, so
 * signing out clears it (`prefs/index.ts`).
 */
import {
  MEALS,
  MODULE_BY_ID,
  SUPPLY_CATEGORY_IDS,
  type Meal,
  type ModuleId,
  type SetupSeed,
} from '@nibblecue/core';
import { z } from 'zod';
import type { KeyValueStore } from '../prefs';

/** A module id the registry still carries: one dropped in a later release seeds nothing. */
const isModuleId = (id: string): id is ModuleId => id in MODULE_BY_ID;
/** A meal this build knows: one from a later build is left unnamed rather than lost (see below). */
const isMeal = (m: string): m is Meal => (MEALS as readonly string[]).includes(m);

const Medicine = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['MEDICINE', 'VITAMIN', 'CREAM', 'OTHER']),
  times: z.array(z.string()),
});

const Night = z.object({
  mode: z.enum(['NONE', 'LONGER', 'ONE', 'PAUSE']),
  everyMinutes: z.number().nullable(),
  // "once a night" at its own time (2026-09-24); a record from before it holds none
  at: z.string().nullable().optional(),
});

const Seed = z.object({
  intervals: z.array(
    z.object({
      activity: z.string(),
      everyMinutes: z.number(),
      // `.optional()` for the reason the counts below are `.default([])`: a record written before
      // setup could ask about the night is a record with no night in it, not a corrupt one
      night: Night.optional(),
    }),
  ),
  cadences: z.array(
    z.object({
      activity: z.string(),
      everyDays: z.number(),
      // chosen weekdays and a time of day (2026-09-24): absent in an older record, which is a
      // bath "every N days" at the sheet's own 6:30 PM — exactly what that record meant
      days: z.array(z.number()).optional(),
      at: z.string().optional(),
    }),
  ),
  // the Rule sheet's second segment, answerable in setup since 2026-09-21; same story, and the
  // weekdays the times keep since 2026-09-24 (absent is every day)
  setTimes: z
    .array(
      z.object({
        activity: z.string(),
        times: z.array(z.string()),
        days: z.array(z.number()).optional(),
        /*
          SOLIDS' MEALS (2026-09-28): absent in a record from a build before the table, whose times
          are then written unnamed, as they always were. A meal this build does not know is dropped
          from the list and its time is still in `times`, so it is written too — only its name is
          lost, never the time.
        */
        meals: z.array(z.object({ meal: z.string(), at: z.string() })).optional(),
      }),
    )
    .default([]),
  bedtime: z.string().nullable().default(null),
  // `.default([])` so a record written by a build before counts existed still loads: an older
  // seed is a seed with no counts in it, not a corrupt one to be thrown away (§ "never lose a log")
  timesADay: z.array(z.object({ activity: z.string(), times: z.number() })).default([]),
  // the daily goal per module (2026-09-19), `.default([])` for the same reason as the counts
  goals: z.array(z.object({ activity: z.string(), minutes: z.number() })).default([]),
  quietHours: z.object({ from: z.string(), to: z.string() }).nullable().default(null),
  dayWindow: z.object({ wake: z.string(), bed: z.string() }).nullable().default(null),
  // the household's milk unit (0128); a record written before it was asked has none, and any
  // value this build does not know is none too — ounces, which is what no row means
  volumeUnit: z.enum(['oz', 'ml']).nullable().catch(null),
  supplies: z
    .array(
      z.object({
        category: z.string(),
        brand: z.string(),
        // `.optional()` and not `.default({})`: absent means the parent never opened the row,
        // and a record written before this field existed must parse rather than be dropped
        details: z.record(z.string()).optional(),
      }),
    )
    .default([]),
  medicines: z.array(Medicine),
});

export const pendingSetupKey = (userId: string): string => `pending_setup:${userId}`;

/** True when the seed asks for anything at all; nothing is stored for an empty one. */
export const seedIsEmpty = (seed: SetupSeed): boolean =>
  seed.intervals.length === 0 &&
  seed.cadences.length === 0 &&
  seed.timesADay.length === 0 &&
  seed.goals.length === 0 &&
  seed.setTimes.length === 0 &&
  seed.bedtime === null &&
  seed.quietHours === null &&
  seed.dayWindow === null &&
  seed.volumeUnit === null &&
  seed.supplies.length === 0 &&
  seed.medicines.length === 0;

export async function savePendingSetup(
  store: KeyValueStore,
  userId: string,
  seed: SetupSeed,
): Promise<void> {
  if (seedIsEmpty(seed)) return;
  await store.set(pendingSetupKey(userId), JSON.stringify(seed));
}

export async function loadPendingSetup(
  store: KeyValueStore,
  userId: string,
): Promise<SetupSeed | null> {
  const raw = await store.get(pendingSetupKey(userId));
  if (!raw) return null;
  try {
    return seedOf(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** A stored seed read the way `loadPendingSetup` reads it, or null when it does not parse. */
function seedOf(value: unknown): SetupSeed | null {
  {
    const parsed = Seed.safeParse(value);
    if (!parsed.success) return null;
    const d = parsed.data;
    return {
      intervals: d.intervals
        .filter(i => isModuleId(i.activity))
        .map(i => ({
          activity: i.activity as ModuleId,
          everyMinutes: i.everyMinutes,
          ...(i.night === undefined ? {} : { night: i.night }),
        })),
      setTimes: d.setTimes
        .filter(t => isModuleId(t.activity) && t.times.length > 0)
        .map(t => {
          const meals = (t.meals ?? []).flatMap(m =>
            isMeal(m.meal) && t.times.includes(m.at) ? [{ meal: m.meal, at: m.at }] : [],
          );
          return {
            activity: t.activity as ModuleId,
            times: [...t.times].sort(),
            ...(t.days === undefined || t.days.length === 0 ? {} : { days: [...t.days] }),
            ...(meals.length === 0 ? {} : { meals }),
          };
        }),
      bedtime: d.bedtime,
      cadences: d.cadences
        .filter(c => isModuleId(c.activity))
        .map(c => ({
          activity: c.activity as ModuleId,
          everyDays: c.everyDays,
          ...(c.days === undefined || c.days.length === 0 ? {} : { days: [...c.days] }),
          ...(c.at === undefined ? {} : { at: c.at }),
        })),
      timesADay: d.timesADay
        .filter(t => isModuleId(t.activity))
        .map(t => ({ activity: t.activity as ModuleId, times: t.times })),
      goals: d.goals
        .filter(g => isModuleId(g.activity))
        .map(g => ({ activity: g.activity as ModuleId, minutes: g.minutes })),
      quietHours: d.quietHours,
      dayWindow: d.dayWindow,
      volumeUnit: d.volumeUnit ?? null,
      // a category this build does not know is dropped, the same rule `setupSeedFrom` applies
      supplies: d.supplies.filter(x => SUPPLY_CATEGORY_IDS.includes(x.category)),
      medicines: d.medicines,
    };
  }
}

export const clearPendingSetup = (store: KeyValueStore, userId: string): Promise<void> =>
  store.remove(pendingSetupKey(userId));

/**
 * THE BABY'S ROUTINE, KEPT FOR THE BIRTH (2026-10-01; migration 0150). A household set up before
 * the birth gets the answers that need no baby at once (`seed.ts` `parts: 'settings'`), and the
 * ones that remind about the baby (the rhythms, the bedtime, the medicines) wait here, with the
 * babies they are for, until one of those babies is born: rules filed against a baby on the way
 * would ring before there is anyone to feed. Keyed by user like the pending record, so a sign-out
 * clears it with everything else of this person's (`prefs/index.ts`).
 */
export interface HeldSetup {
  childIds: string[];
  seed: SetupSeed;
}

export const heldSetupKey = (userId: string): string => `held_setup:${userId}`;

export async function saveHeldSetup(
  store: KeyValueStore,
  userId: string,
  held: HeldSetup,
): Promise<void> {
  if (seedIsEmpty(held.seed) || held.childIds.length === 0) return;
  await store.set(heldSetupKey(userId), JSON.stringify(held));
}

export async function loadHeldSetup(
  store: KeyValueStore,
  userId: string,
): Promise<HeldSetup | null> {
  const raw = await store.get(heldSetupKey(userId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { childIds?: unknown; seed?: unknown };
    const childIds = Array.isArray(value.childIds)
      ? value.childIds.filter((id): id is string => typeof id === 'string')
      : [];
    const seed = seedOf(value.seed);
    return seed === null || childIds.length === 0 ? null : { childIds, seed };
  } catch {
    return null;
  }
}

export const clearHeldSetup = (store: KeyValueStore, userId: string): Promise<void> =>
  store.remove(heldSetupKey(userId));
