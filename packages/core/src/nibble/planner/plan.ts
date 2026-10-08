/**
 * ── THE RULE PLANNER ──────────────────────────────────────────────────────────────────────────
 *
 * "The plan, not the encyclopedia" (spec §1). Given the baby's profile, the household's own log,
 * what the parent has noticed and pinned, and (optionally) a model's draft, it lays out the next
 * days meal by meal. Pure and deterministic: the same inputs give the same plan on every phone, so
 * two parents see one plan without the plan being stored anywhere (it is derived, like every
 * total in CuddleCue, never cached). Every item passes the validator (`safety/validator.ts`).
 *
 * HOW A DAY IS BUILT, in order, each step only what the validator accepts:
 *   1. the parent's pins (a pin that breaks a rule is reported, never shown as planned)
 *   2. a first exposure to the next allergen in the family's order, at the first meal, when the
 *      timing allows (three days after the last new allergen, fourteen after any noticed sign)
 *   3. otherwise one new food, within the stage's weekly budget
 *   4. keeping tolerated allergens going (spec §6.5: about twice a week)
 *   5. an iron-rich food every day, with vitamin C beside plant iron
 *   6. the rest from foods already offered: liked ones, a retry in a new form a week after a
 *      "didn't like it" (two weeks after three in a row), variety across days and food groups;
 *      from twelve months one familiar food at every meal (spec §6.12)
 *
 * LATER DAYS ASSUME THE EARLIER ONES HAPPEN. Day three's plan treats day one's new food as tried,
 * so the plan moves forward; tomorrow it is rebuilt from what was really logged, which is how a
 * logged reaction changes the plan in the same session (spec §3).
 */
import { addDays, daysBetween, monthsBetween, type DayOf, type IsoDay } from '../days';
import { allergenOrder } from '../allergens';
import {
  allergenStates,
  foodStatuses,
  keyForFood,
  lastNoticedDay,
  type AllergenState,
  type Exposure,
  type FoodStatus,
} from '../history';
import { servingFor } from '../catalog';
import { bandFor, mealsFor, STAGE_INFO, stageFor, type Stage } from '../stage';
import {
  checkItem,
  isRiceCereal,
  newAllergensOf,
  type DaySoFar,
  type ItemContext,
  type Violation,
} from '../safety/validator';
import type {
  AgeBand,
  AllergenId,
  Approach,
  Food,
  Form,
  MealName,
  NibbleProfile,
  Noticed,
  PlanMark,
} from '../types';

export const REASONS = [
  'pinned',
  'first_allergen',
  'new_food',
  'keep_going',
  'iron',
  'vitamin_c',
  'liked',
  'retry',
  'familiar',
  'variety',
  'softening',
  'suggested',
  'again_today',
] as const;
export type Reason = (typeof REASONS)[number];

export interface PlanItem {
  foodId: string;
  form: Form;
  /** Never offered before this day. */
  isNew: boolean;
  /** The allergen this item offers for the first time, if any. */
  firstAllergen: AllergenId | null;
  /** Tolerated allergens this item keeps going. */
  keepGoing: AllergenId[];
  reasons: Reason[];
  by: 'rules' | 'ai' | 'parent';
  /** The model's one-line reason, already scanned (only when `by === 'ai'`). */
  note: string | null;
}

export interface PlanMeal {
  meal: MealName;
  items: PlanItem[];
}

export interface PlanDay {
  day: IsoDay;
  months: number;
  stage: Stage;
  band: AgeBand;
  skip: boolean;
  meals: PlanMeal[];
  /** Pinned or suggested foods the validator refused, with the rules they broke. */
  refused: Violation[];
}

export interface AiDraftItem {
  day: IsoDay;
  meal: MealName;
  foodId: string;
  note: string | null;
}

export interface PlanInput {
  childId: string;
  birthDate: IsoDay;
  today: IsoDay;
  days: number;
  profile: NibbleProfile;
  foods: readonly Food[];
  exposures: readonly Exposure[];
  noticed: readonly Noticed[];
  marks: readonly PlanMark[];
  /** A model's draft, already reduced to ids and scanned notes (`planner/ai.ts`). */
  ai?: readonly AiDraftItem[] | null;
  /** The parent chose to lean on softening foods until this day (spec §6.8, parent's choice). */
  softeningUntil?: IsoDay | null;
  offsetMinutes?: DayOf;
}

/* ── small deterministic helpers ─────────────────────────────────────────────────────────── */

/** FNV-1a: a stable tie-break, so a plan never depends on the order foods were loaded in. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

const FORM_ORDER: Readonly<Record<Approach, readonly Form[]>> = {
  puree: [
    'puree',
    'mashed',
    'lumpy',
    'minced',
    'chopped',
    'family',
    'mixed_in',
    'spread',
    'soft_stick',
    'finger',
    'drink',
  ],
  blw: [
    'soft_stick',
    'finger',
    'chopped',
    'family',
    'spread',
    'mashed',
    'lumpy',
    'minced',
    'puree',
    'mixed_in',
    'drink',
  ],
  mix: [
    'mashed',
    'soft_stick',
    'lumpy',
    'finger',
    'minced',
    'chopped',
    'family',
    'spread',
    'puree',
    'mixed_in',
    'drink',
  ],
};

/** Smooth purée is a step to move past by nine months (hard rule 14 is a nudge, never a block). */
const PAST_PUREE: readonly Form[] = ['puree'];

export function chooseForm(
  food: Food,
  band: AgeBand,
  approach: Approach,
  opts: { firstAllergen?: boolean; avoid?: Form | null; holdTexture?: boolean } = {},
): Form | null {
  const forms = servingFor(food, band).forms;
  if (forms.length === 0) return null;
  if (opts.firstAllergen) {
    for (const f of ['mixed_in', 'spread', 'mashed', 'puree'] as const)
      if (forms.includes(f)) return f;
  }
  let order = FORM_ORDER[approach].filter(f => forms.includes(f));
  if (band !== '6-8' && !opts.holdTexture) {
    const moved = order.filter(f => !PAST_PUREE.includes(f));
    if (moved.length > 0) order = moved;
  }
  if (opts.avoid) {
    const other = order.filter(f => f !== opts.avoid);
    if (other.length > 0) order = other;
  }
  return order[0] ?? forms[0] ?? null;
}

/* ── the planner ─────────────────────────────────────────────────────────────────────────── */

interface Sim {
  exposures: Exposure[];
  /** Foods first offered on a planned day, by day. */
  newOn: Map<IsoDay, number>;
  lastNewAllergen: IsoDay | null;
  lastServed: Map<string, IsoDay>;
  riceDays: IsoDay[];
}

const NEW_ALLERGEN_KINDS = new Set(['not_started']);

export function buildPlan(input: PlanInput): PlanDay[] {
  const { profile, foods } = input;
  const offset = input.offsetMinutes ?? 0;
  const byId = new Map(foods.map(f => [f.id, f]));
  const triedBefore = new Set(profile.triedBefore);
  const noticedLast = lastNoticedDay(input.noticed, offset);

  const logFirstNewAllergen = (): IsoDay | null => {
    // the latest day an allergen was first offered in the record
    const first = new Map<AllergenId, IsoDay>();
    for (const e of input.exposures) {
      for (const a of e.allergens) if (!first.has(a)) first.set(a, e.day);
    }
    const days = [...first.values()].sort();
    return days[days.length - 1] ?? null;
  };

  const sim: Sim = {
    exposures: [...input.exposures],
    newOn: new Map(),
    lastNewAllergen: logFirstNewAllergen(),
    lastServed: new Map(),
    riceDays: [],
  };
  for (const e of input.exposures) {
    if (e.foodId) sim.lastServed.set(e.foodId, e.day);
    const f = e.foodId ? byId.get(e.foodId) : undefined;
    if (f && isRiceCereal(f)) sim.riceDays.push(e.day);
  }
  const firstMealDay = input.exposures[0]?.day ?? null;

  const out: PlanDay[] = [];
  for (let i = 0; i < input.days; i += 1) {
    const day = addDays(input.today, i);
    out.push(planDay(day));
  }
  return out;

  function planDay(day: IsoDay): PlanDay {
    const months = monthsBetween(input.birthDate, day);
    const band = bandFor(months);
    const plannedStart = firstPlannedDay();
    const stage = stageFor({
      birthDate: input.birthDate,
      day,
      profile,
      firstMealDay: firstMealDay ?? plannedStart,
    });
    const base: PlanDay = { day, months, stage, band, skip: false, meals: [], refused: [] };
    if (stage === 'too_young' || stage === 'getting_ready') return base;

    const marks = input.marks.filter(m => m.day === day);
    if (marks.some(m => m.kind === 'skip_day')) return { ...base, skip: true };

    const meals = mealsFor(stage, profile.mealsPerDay);
    if (meals.length === 0) return base;
    const firstMeal = meals[0] as MealName;
    const info = STAGE_INFO[stage];
    const states = allergenStates({
      profile,
      exposures: sim.exposures.filter(e => e.day < day),
      noticed: input.noticed,
      foodById: id => byId.get(id),
      today: addDays(day, -1),
      offsetMinutes: offset,
    });
    // a day's view of "tried": the record, the profile, and every earlier planned day
    const statuses = foodStatuses(sim.exposures.filter(e => e.day < day));
    const tried = (f: Food): boolean => statuses.has(keyForFood(f)) || triedBefore.has(f.id);

    const placed: PlanMeal[] = meals.map(meal => ({ meal, items: [] }));
    const daySoFar: { items: DaySoFar['items'][number][] } = { items: [] };
    const refused: Violation[] = [];
    const removed = (meal: MealName, foodId: string): boolean =>
      marks.some(m => m.kind === 'remove' && m.meal === meal && m.foodId === foodId);
    const riceThisWeek = sim.riceDays.filter(d => d < day && daysBetween(d, day) <= 6).length;

    const ctxFor = (meal: MealName): ItemContext => ({
      day,
      months,
      band,
      meal,
      firstMeal,
      profile,
      allergens: states,
      tried,
      skipDay: false,
      lastNewAllergenDay: sim.lastNewAllergen,
      lastNoticedDay: noticedLast,
      riceCerealThisWeek: riceThisWeek,
      daySoFar,
    });

    const mealOf = (meal: MealName): PlanMeal => placed.find(p => p.meal === meal) as PlanMeal;
    const inMeal = (meal: MealName, food: Food): boolean =>
      mealOf(meal).items.some(it => it.foodId === food.id);
    const roomIn = (meal: MealName): boolean => mealOf(meal).items.length < info.itemsPerMeal;

    /** Validate and place. Returns false (and records nothing) when a rule refuses it. */
    const tryPlace = (
      food: Food,
      meal: MealName,
      form: Form | null,
      reasons: Reason[],
      by: PlanItem['by'],
      note: string | null = null,
      report = false,
    ): boolean => {
      if (form === null || removed(meal, food.id) || inMeal(meal, food)) return false;
      const violations = checkItem(food, form, ctxFor(meal));
      if (violations.length > 0) {
        if (report) refused.push(...violations);
        return false;
      }
      const repeatToday = daySoFar.items.some(it => it.food.id === food.id);
      const fresh = repeatToday ? [] : newAllergensOf(food, states);
      const isNew = !tried(food) && !repeatToday;
      const keepGoing = food.allergens.filter(a => !fresh.includes(a) && states[a].due);
      mealOf(meal).items.push({
        foodId: food.id,
        form,
        isNew,
        firstAllergen: fresh[0] ?? null,
        keepGoing,
        reasons: [
          ...new Set([...reasons, ...(keepGoing.length > 0 ? (['keep_going'] as const) : [])]),
        ],
        by,
        note,
      });
      daySoFar.items.push({ food, meal, isNew, newAllergens: fresh });
      return true;
    };

    // 1. the parent's pins
    for (const m of marks.filter(x => x.kind === 'pin' && x.foodId !== null)) {
      const food = byId.get(m.foodId as string);
      if (!food || !meals.includes(m.meal)) continue;
      const form = chooseForm(food, band, profile.approach, { holdTexture: profile.holdTexture });
      tryPlace(food, m.meal, form, ['pinned'], 'parent', null, true);
    }

    const newToday = (): boolean => daySoFar.items.some(it => it.isNew);
    const newThisWeek = (): number => {
      let n = 0;
      for (const [d, count] of sim.newOn) if (d < day && daysBetween(d, day) <= 6) n += count;
      return n;
    };
    const triedCount = [...statuses.values()].length + triedBefore.size;

    // 2. a first exposure to the next allergen. Its own cadence (the validator's three days), ahead
    // of ordinary new foods: they never use up the week an allergen was waiting for.
    if (!newToday() && triedCount >= 2) {
      for (const allergen of allergenOrder(profile.allergenOrder)) {
        if (!NEW_ALLERGEN_KINDS.has(states[allergen].kind)) continue;
        let placedIt = false;
        let waiting = false;
        for (const carrier of firstExposureFoods(allergen, states)) {
          const form = chooseForm(carrier, band, profile.approach, { firstAllergen: true });
          if (form === null) continue;
          const refusals = checkItem(carrier, form, ctxFor(firstMeal)).map(x => x.rule);
          if (refusals.length === 0) {
            placedIt = tryPlace(carrier, firstMeal, form, ['first_allergen'], 'rules');
            break;
          }
          if (refusals.includes('new_allergen_timing')) waiting = true;
        }
        // placed, or the timing says wait: either way no other allergen jumps the queue (one at
        // a time, in the family's order). An allergen with no food this family can offer (egg for
        // a vegan family) is passed over rather than holding every allergen behind it.
        if (placedIt || waiting) break;
      }
    }

    // 3. one new food, but not the day after a new allergen: a sign that day is then easier to
    // place, because nothing else new was offered beside it
    const dayAfterAllergen =
      sim.lastNewAllergen !== null && daysBetween(sim.lastNewAllergen, day) === 1;
    if (!newToday() && !dayAfterAllergen && newThisWeek() < info.newFoodsPerWeek) {
      const candidates = foods
        .filter(f => !tried(f) && newAllergensOf(f, states).length === 0)
        .map(f => ({ f, s: newFoodScore(f, stage, day, states) }))
        .sort((a, b) => b.s - a.s);
      // the first meal of the day, as for a first allergen: a sign after it is seen in daylight
      const target = firstMeal;
      for (const { f } of candidates) {
        const form = chooseForm(f, band, profile.approach, { holdTexture: profile.holdTexture });
        const reasons: Reason[] = ['new_food'];
        if (f.ironRich) reasons.push('iron');
        if (tryPlace(f, target, form, reasons, 'rules')) break;
      }
    }

    // the model's suggestions, each through the validator like everything else
    for (const s of (input.ai ?? []).filter(a => a.day === day)) {
      const food = byId.get(s.foodId);
      if (!food || !meals.includes(s.meal) || !roomIn(s.meal)) continue;
      const form = chooseForm(food, band, profile.approach, { holdTexture: profile.holdTexture });
      tryPlace(food, s.meal, form, ['suggested'], 'ai', s.note);
    }

    // 4. keep tolerated allergens going
    const due = (Object.values(states) as AllergenState[])
      .filter(s => s.due)
      .sort(
        (a, b) =>
          a.lastSevenDays - b.lastSevenDays || (a.lastDay ?? '').localeCompare(b.lastDay ?? ''),
      );
    const keepGoingCap = stage === 'first_foods' ? 1 : 3;
    let kept = 0;
    for (const s of due) {
      if (kept >= keepGoingCap) break;
      const covered = daySoFar.items.some(it => it.food.allergens.includes(s.allergen));
      if (covered) continue;
      const options = foods
        .filter(f => f.allergens.includes(s.allergen) && tried(f))
        .map(f => ({ f, s: fillScore(f, day, statuses.get(keyForFood(f))) }))
        .sort((a, b) => b.s - a.s);
      let done = false;
      for (const meal of mealsByRoom()) {
        for (const { f } of options) {
          const form = chooseForm(f, band, profile.approach, { holdTexture: profile.holdTexture });
          if (tryPlace(f, meal, form, ['keep_going'], 'rules')) {
            done = true;
            break;
          }
        }
        if (done) break;
      }
      if (done) kept += 1;
    }

    // 5. iron every day
    if (!daySoFar.items.some(it => it.food.ironRich)) {
      const options = foods
        .filter(f => f.ironRich && tried(f))
        .map(f => ({ f, s: fillScore(f, day, statuses.get(keyForFood(f))) }))
        .sort((a, b) => b.s - a.s);
      outer: for (const meal of mealsByRoom()) {
        for (const { f } of options) {
          const form = chooseForm(f, band, profile.approach, { holdTexture: profile.holdTexture });
          if (tryPlace(f, meal, form, ['iron'], 'rules')) break outer;
        }
      }
    }

    // 6. fill from foods already offered
    for (const meal of meals) {
      let guard = 0;
      while (roomIn(meal) && guard < 6) {
        guard += 1;
        const mealItems = mealOf(meal)
          .items.map(it => byId.get(it.foodId))
          .filter(Boolean) as Food[];
        const needsFamiliar =
          stage === 'toddler' &&
          !mealItems.some(f => (statuses.get(keyForFood(f))?.loved ?? 0) > 0);
        const plantIron = mealItems.some(f => f.ironRich && f.animal === 'none');
        const hasC = mealItems.some(f => f.vitaminC);
        const options = foods
          .filter(f => tried(f) || daySoFar.items.some(it => it.food.id === f.id && it.isNew))
          .map(f => {
            const st = statuses.get(keyForFood(f));
            let s = fillScore(f, day, st);
            if (needsFamiliar && (st?.loved ?? 0) > 0) s += 4;
            if (plantIron && !hasC && f.vitaminC) s += 2;
            if (mealItems.some(m => m.category === f.category)) s -= 2;
            if (daySoFar.items.some(it => it.food.id === f.id)) s -= 5;
            if (input.softeningUntil && day <= input.softeningUntil) {
              if (f.softening) s += 2.5;
              if (f.firming) s -= 3;
            }
            return { f, s, st };
          })
          .sort((a, b) => b.s - a.s);
        let placedOne = false;
        for (const { f, st } of options) {
          const reasons: Reason[] = [];
          const retry = isRetryDue(st, day);
          const againToday = daySoFar.items.some(it => it.food.id === f.id && it.isNew);
          if (againToday) reasons.push('again_today');
          else if (needsFamiliar && (st?.loved ?? 0) > 0) reasons.push('familiar');
          else if (retry) reasons.push('retry');
          else if ((st?.loved ?? 0) > 0) reasons.push('liked');
          else reasons.push('variety');
          if (plantIron && !hasC && f.vitaminC) reasons.push('vitamin_c');
          if (f.ironRich) reasons.push('iron');
          if (input.softeningUntil && day <= input.softeningUntil && f.softening)
            reasons.push('softening');
          const form = chooseForm(f, band, profile.approach, {
            holdTexture: profile.holdTexture,
            avoid: retry ? (st?.lastForm ?? null) : null,
          });
          if (tryPlace(f, meal, form, reasons, 'rules')) {
            placedOne = true;
            break;
          }
        }
        if (!placedOne) break;
      }
    }

    // the day is decided: let later days see it as happened
    for (const pm of placed) {
      for (const it of pm.items) {
        const food = byId.get(it.foodId) as Food;
        sim.exposures.push({
          activityId: `plan:${day}:${pm.meal}`,
          at: `${day}T12:00:00.000Z`,
          day,
          foodId: food.id,
          key: keyForFood(food),
          name: food.name,
          response: null,
          form: it.form,
          allergens: food.allergens,
          meal: pm.meal,
        });
        sim.lastServed.set(food.id, day);
        if (isRiceCereal(food)) sim.riceDays.push(day);
        if (it.isNew && !it.firstAllergen) sim.newOn.set(day, (sim.newOn.get(day) ?? 0) + 1);
        if (it.firstAllergen) sim.lastNewAllergen = day;
      }
    }
    sim.exposures.sort((a, b) => a.at.localeCompare(b.at));

    return { ...base, meals: placed, refused };

    function mealsByRoom(): MealName[] {
      return [...meals].sort(
        (a, b) =>
          mealOf(a).items.length - mealOf(b).items.length || meals.indexOf(a) - meals.indexOf(b),
      );
    }
  }

  function firstPlannedDay(): IsoDay | null {
    const planned = sim.exposures.filter(e => e.activityId.startsWith('plan:'));
    return planned[0]?.day ?? null;
  }

  /** The foods a first exposure to an allergen may be offered in: that allergen alone, gentlest first. */
  function firstExposureFoods(
    allergen: AllergenId,
    states: Readonly<Record<AllergenId, AllergenState>>,
  ): Food[] {
    const risk = { low: 0, medium: 1, high: 2 } as const;
    return foods
      .filter(f => f.allergens.includes(allergen))
      .filter(f => newAllergensOf(f, states).length === 1)
      .filter(f => f.category !== 'pouch_jar')
      .sort(
        (a, b) =>
          risk[a.chokingRisk] - risk[b.chokingRisk] ||
          Number(b.firstFood) - Number(a.firstFood) ||
          a.allergens.length - b.allergens.length ||
          a.id.localeCompare(b.id),
      );
  }

  function newFoodScore(
    f: Food,
    stage: Stage,
    day: IsoDay,
    states: Readonly<Record<AllergenId, AllergenState>>,
  ): number {
    void states;
    let s = 0;
    if (stage === 'first_foods' && f.firstFood) s += 3;
    if (f.ironRich) s += 2;
    if (f.vitaminC) s += 0.5;
    if (f.category === 'pouch_jar' || f.category === 'drink' || f.category === 'herb_spice') s -= 6;
    if (f.category === 'fat') s -= 2;
    if (profile.cuisines.some(c => f.cuisines.includes(c))) s += 1;
    // a food group not offered in the last two days
    const recentCats = new Set(
      sim.exposures
        .filter(e => e.day < day && daysBetween(e.day, day) <= 2 && e.foodId)
        .map(e => byId.get(e.foodId as string)?.category),
    );
    if (!recentCats.has(f.category)) s += 1;
    return s + hash(`${input.childId}:${day}:${f.id}`);
  }

  function fillScore(f: Food, day: IsoDay, st: FoodStatus | undefined): number {
    let s = 0;
    if (st) {
      s += Math.min(st.loved, 4) * 0.75;
      if (st.lastResponse === 'DISLIKED' && !isRetryDue(st, day)) s -= 6;
      if (isRetryDue(st, day)) s += 1;
    }
    const last = sim.lastServed.get(f.id);
    if (last !== undefined) {
      const ago = daysBetween(last, day);
      if (ago <= 1) s -= 3;
      else if (ago === 2) s -= 1;
    }
    if (f.category === 'pouch_jar') s -= 2;
    if (f.category === 'drink' || f.category === 'herb_spice' || f.category === 'fat') s -= 5;
    return s + hash(`${input.childId}:${day}:fill:${f.id}`);
  }
}

/**
 * A food the baby did not like comes back, in a different form, a week later; after three in a
 * row, two weeks later. It is never dropped unless the parent removes it (spec §6.4).
 */
export function isRetryDue(st: FoodStatus | undefined, day: IsoDay): boolean {
  if (!st || st.refusalsInRow === 0) return false;
  const wait = st.refusalsInRow >= 3 ? 14 : 7;
  return daysBetween(st.lastDay, day) >= wait;
}

/** Every item of a plan, flat, for tests and the shopping list. */
export function planItems(
  plan: readonly PlanDay[],
): (PlanItem & { day: IsoDay; meal: MealName })[] {
  return plan.flatMap(d =>
    d.meals.flatMap(m => m.items.map(it => ({ ...it, day: d.day, meal: m.meal }))),
  );
}

/** A profile as the planner reads it, for callers holding the raw record body. */
export type { NibbleProfile };
