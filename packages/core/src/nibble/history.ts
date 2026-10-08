/**
 * ── WHAT THE HOUSEHOLD HAS LOGGED, READ AS EXPOSURES ──────────────────────────────────────────
 *
 * The plan learns only from the household's own record: every solids meal either app logged
 * (CuddleCue's `activities` of type `solids`), one exposure per food line, and every sign a parent
 * noticed. Counts, dates and the parent's own answers; nothing here guesses at what the baby felt.
 *
 * A line NibbleCue wrote carries `food_id`; a line typed in CuddleCue is matched to the library by
 * its name (`makeMatcher`), and a name the library does not know stays the parent's own food, keyed
 * by `foodKey`, so it still counts as tried.
 */
import { foodKey, type FoodResponse } from '../solids/items';
import { ALLERGEN_IDS, FORMS, type AllergenId, type Food, type Form, type Noticed } from './types';
import { addDays, daysBetween, dayOf, type DayOf, type IsoDay } from './days';
import { keepGoingTarget } from './allergens';
import type { NibbleProfile } from './types';

/** One meal as the mirror holds it: the activity and its solids detail. */
export interface MealRow {
  id: string;
  childId: string | null;
  startAt: string;
  deletedAt?: string | null;
  meal?: string | null;
  /** `solids_details.items` as stored (JSON text or parsed). */
  items: unknown;
  /** `solids_details.food`, the older meals' text. */
  food?: string | null;
}

export interface Exposure {
  activityId: string;
  at: string;
  day: IsoDay;
  /** The library or custom food id, when known. */
  foodId: string | null;
  /** `foodKey` of the line's name: the identity of a food the library does not know. */
  key: string;
  name: string;
  response: FoodResponse | null;
  form: Form | null;
  allergens: AllergenId[];
  meal: string | null;
}

interface RawLine {
  name?: unknown;
  response?: unknown;
  food_id?: unknown;
  form?: unknown;
}

const RESPONSES: readonly string[] = ['LOVED', 'LIKED', 'UNSURE', 'DISLIKED'];

function linesOf(row: MealRow): RawLine[] {
  let raw = row.items;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = null;
    }
  }
  if (Array.isArray(raw))
    return raw.filter((l): l is RawLine => typeof l === 'object' && l !== null);
  // an older CuddleCue meal: its one text field, split the way CuddleCue splits it
  const text = row.food ?? '';
  return text
    .split(/[,;\n]|\s\+\s/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(name => ({ name }));
}

export function exposuresFrom(
  rows: readonly MealRow[],
  resolve: (idOrName: { id: string | null; name: string }) => Food | undefined,
  offsetMinutes: DayOf = 0,
): Exposure[] {
  const out: Exposure[] = [];
  for (const row of rows) {
    if (row.deletedAt) continue;
    const day = dayOf(Date.parse(row.startAt), offsetMinutes);
    for (const line of linesOf(row)) {
      const name = typeof line.name === 'string' ? line.name : '';
      if (name.trim() === '') continue;
      const id = typeof line.food_id === 'string' ? line.food_id : null;
      const food = resolve({ id, name });
      const response =
        typeof line.response === 'string' && RESPONSES.includes(line.response)
          ? (line.response as FoodResponse)
          : null;
      const form =
        typeof line.form === 'string' && (FORMS as readonly string[]).includes(line.form)
          ? (line.form as Form)
          : null;
      out.push({
        activityId: row.id,
        at: row.startAt,
        day,
        foodId: food?.id ?? id,
        key: food ? `id:${food.id}` : `name:${foodKey(name)}`,
        name,
        response,
        form,
        allergens: food?.allergens ?? [],
        meal: row.meal ?? null,
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The identity the plan and the log share for a food. */
export const keyForFood = (food: Pick<Food, 'id'>): string => `id:${food.id}`;

export interface FoodStatus {
  key: string;
  foodId: string | null;
  name: string;
  times: number;
  firstDay: IsoDay;
  lastDay: IsoDay;
  lastResponse: FoodResponse | null;
  /** "Didn't like it" answers in a row, most recent last. Information, never failure (spec §6.4). */
  refusalsInRow: number;
  lastForm: Form | null;
  loved: number;
}

export function foodStatuses(exposures: readonly Exposure[]): Map<string, FoodStatus> {
  const map = new Map<string, FoodStatus>();
  for (const e of exposures) {
    const prev = map.get(e.key);
    const refused = e.response === 'DISLIKED';
    if (!prev) {
      map.set(e.key, {
        key: e.key,
        foodId: e.foodId,
        name: e.name,
        times: 1,
        firstDay: e.day,
        lastDay: e.day,
        lastResponse: e.response,
        refusalsInRow: refused ? 1 : 0,
        lastForm: e.form,
        loved: e.response === 'LOVED' || e.response === 'LIKED' ? 1 : 0,
      });
      continue;
    }
    prev.times += 1;
    prev.lastDay = e.day;
    if (e.response !== null) {
      prev.lastResponse = e.response;
      prev.refusalsInRow = refused ? prev.refusalsInRow + 1 : 0;
    }
    if (e.form !== null) prev.lastForm = e.form;
    if (e.response === 'LOVED' || e.response === 'LIKED') prev.loved += 1;
  }
  return map;
}

/* ── allergens ────────────────────────────────────────────────────────────────────────────── */

export type AllergenStateKind =
  | 'not_started'
  | 'introduced'
  | 'keeping_going'
  | 'established'
  | 'held'
  | 'excluded'
  | 'ask_first'
  | 'not_planned';

export type HoldReason = 'diagnosed' | 'paused' | 'noticed';

export interface AllergenState {
  allergen: AllergenId;
  kind: AllergenStateKind;
  times: number;
  firstDay: IsoDay | null;
  lastDay: IsoDay | null;
  /** Times offered in the seven days ending today. */
  lastSevenDays: number;
  /** The plan's own weekly target for keeping it going. */
  target: number;
  /** In the diet and offered fewer times than the target this week. */
  due: boolean;
  hold: HoldReason | null;
  /** The day of the latest sign noticed after a food containing it. */
  noticedOn: IsoDay | null;
}

/** Eight weeks of regular offers before an allergen reads as established (spec §6.5). */
export const ESTABLISHED_DAYS = 56;
const ESTABLISHED_TIMES = 8;

/** Severe eczema or an egg allergy: the NIAID group whose families talk to their doctor first. */
export function higherPeanutRisk(profile: Pick<NibbleProfile, 'eczema' | 'diagnosed'>): boolean {
  return profile.eczema === 'severe' || profile.diagnosed.includes('egg');
}

export interface AllergenInput {
  profile: NibbleProfile;
  exposures: readonly Exposure[];
  noticed: readonly Noticed[];
  /** Every food a noticed record may name, to learn which allergens it contained. */
  foodById: (id: string) => Food | undefined;
  today: IsoDay;
  offsetMinutes?: DayOf;
}

/** The allergens in the foods a noticed sign followed: named foods and the linked meal's lines. */
export function noticedAllergens(
  n: Noticed,
  exposures: readonly Exposure[],
  foodById: (id: string) => Food | undefined,
): Set<AllergenId> {
  const out = new Set<AllergenId>();
  for (const id of n.foodIds) for (const a of foodById(id)?.allergens ?? []) out.add(a);
  if (n.activityId !== null) {
    for (const e of exposures)
      if (e.activityId === n.activityId) e.allergens.forEach(a => out.add(a));
  }
  return out;
}

export function allergenStates(input: AllergenInput): Record<AllergenId, AllergenState> {
  const { profile, exposures, noticed, today } = input;
  const offset = input.offsetMinutes ?? 0;
  const higher = higherPeanutRisk(profile);
  const weekStart = addDays(today, -6);

  const noticedDay = new Map<AllergenId, IsoDay>();
  for (const n of noticed) {
    const day = dayOf(Date.parse(n.at), offset);
    for (const a of noticedAllergens(n, exposures, input.foodById)) {
      const cleared = profile.cleared.find(c => c.allergen === a);
      if (cleared && cleared.on >= day) continue;
      const prev = noticedDay.get(a);
      if (!prev || day > prev) noticedDay.set(a, day);
    }
  }

  const out = {} as Record<AllergenId, AllergenState>;
  for (const allergen of ALLERGEN_IDS) {
    const mine = exposures.filter(e => e.allergens.includes(allergen) && e.day <= today);
    const before = profile.introducedBefore.find(i => i.allergen === allergen);
    const days = mine.map(e => e.day);
    const firstDay =
      [before?.on ?? null, days[0] ?? null].filter((d): d is IsoDay => d !== null).sort()[0] ??
      (before ? today : null);
    const lastDay = days[days.length - 1] ?? before?.on ?? null;
    const times = mine.length + (before ? 1 : 0);
    const lastSevenDays = new Set(mine.filter(e => e.day >= weekStart).map(e => `${e.activityId}`))
      .size;
    const target = keepGoingTarget(allergen, higher);
    const noticedOn = noticedDay.get(allergen) ?? null;

    let kind: AllergenStateKind;
    let hold: HoldReason | null = null;
    if (profile.diagnosed.includes(allergen)) {
      kind = 'excluded';
      hold = 'diagnosed';
    } else if (profile.paused.includes(allergen)) {
      kind = 'held';
      hold = 'paused';
    } else if (noticedOn !== null) {
      kind = 'held';
      hold = 'noticed';
    } else if (times === 0) {
      const approved = profile.approved.some(a => a.allergen === allergen && a.from <= today);
      if (profile.allergenMode === 'none') kind = 'not_planned';
      else if (profile.allergenMode === 'pediatrician' && !approved) kind = 'not_planned';
      else if (allergen === 'peanut' && higher && !approved) kind = 'ask_first';
      else kind = 'not_started';
    } else if (
      firstDay !== null &&
      daysBetween(firstDay, today) >= ESTABLISHED_DAYS &&
      times >= ESTABLISHED_TIMES
    ) {
      kind = 'established';
    } else if (times >= 3) {
      kind = 'keeping_going';
    } else {
      kind = 'introduced';
    }

    const inDiet = kind === 'introduced' || kind === 'keeping_going' || kind === 'established';
    out[allergen] = {
      allergen,
      kind,
      times,
      firstDay,
      lastDay,
      lastSevenDays,
      target,
      due: inDiet && lastSevenDays < target,
      hold,
      noticedOn,
    };
  }
  return out;
}

/** The latest day any sign was noticed, for the fourteen-day pause before a new allergen. */
export function lastNoticedDay(
  noticed: readonly Noticed[],
  offsetMinutes: DayOf = 0,
): IsoDay | null {
  let last: IsoDay | null = null;
  for (const n of noticed) {
    const d = dayOf(Date.parse(n.at), offsetMinutes);
    if (last === null || d > last) last = d;
  }
  return last;
}
