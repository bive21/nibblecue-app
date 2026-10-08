/**
 * ── EVERYTHING A NIBBLECUE SCREEN READS, FOR THE BABY ON SCREEN ───────────────────────────────
 *
 * One read of the phone's mirror (the household's NibbleCue records, its solids meals and its
 * Health notes), re-run when a write or a pull bumps one of its keys, and one derivation from it:
 * the profile, the food list (the library and the household's own foods), this baby's exposures,
 * what was noticed, the allergen states and the plan. The plan is DERIVED, never stored (CuddleCue's
 * rule for every total): both parents' phones compute the same plan from the same log, and a
 * logged meal or a noticed sign changes it the moment it is written.
 */
import {
  allergenStates,
  buildPlan,
  customFoodToFood,
  exposuresFrom,
  FOOD_BY_ID,
  FOODS,
  foodStatuses,
  makeMatcher,
  noticedForPlan,
  NibbleProfile,
  profileFor,
  readRecords,
  stageFor,
  bandFor,
  monthsBetween,
  type AllergenId,
  type AllergenState,
  type Exposure,
  type Food,
  type FoodStatus,
  type HealthNote,
  type IsoDay,
  type Noticed,
  type PlanDay,
  type PlanInput,
  type PlanMark,
  type ReadRecord,
  type Stage,
  type AgeBand,
} from '@nibblecue/core/nibble';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLocalQuery } from '../data/useLocalQuery';
import { keys } from '../data/store';
import {
  healthNotes,
  nibbleRecords,
  solidsMeals,
  type HealthNoteRow,
  type NibbleRecordRow,
  type SolidsMealRow,
} from '../db/queries/nibble';
import { useChild } from '../household/ChildContext';
import { dayKeyAt, useDayKey } from '../time/useDayKey';
import { useTimeZone } from '../time/useZone';
import { usePlan } from '../plan/PlanProvider';
import { prefsStore } from '../prefs/async-storage';
import { ideasFor, loadIdeas, subscribeIdeas } from './planIdeas';
import { nibbleKey } from './writes';

/** How far ahead the plan is laid out (spec §6.2: the next 14 days in detail). */
export const PLAN_DAYS = 14;

interface Raw {
  loaded: boolean;
  records: NibbleRecordRow[];
  meals: SolidsMealRow[];
  notes: HealthNoteRow[];
}

const EMPTY: Raw = { loaded: false, records: [], meals: [], notes: [] };

/** The household's raw rows, re-read when NibbleCue's records or the log change. */
export function useNibbleRaw(): Raw {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const watch =
    householdId === null
      ? []
      : [nibbleKey(householdId), keys.household(householdId), keys.timeline(null, 'all')];
  return useLocalQuery<Raw>(
    watch,
    async db => {
      if (householdId === null) return { ...EMPTY, loaded: true };
      const [records, meals, notes] = await Promise.all([
        nibbleRecords(db, householdId),
        solidsMeals(db, householdId),
        healthNotes(db, householdId),
      ]);
      return { loaded: true, records, meals, notes };
    },
    EMPTY,
  );
}

export interface NibbleView {
  loaded: boolean;
  householdId: string | null;
  childId: string | null;
  childName: string;
  birthDate: IsoDay | null;
  today: IsoDay;
  months: number;
  band: AgeBand;
  stage: Stage;
  /** The baby's food profile; null until setup has been done for this baby. */
  profile: NibbleProfile | null;
  profileRecord: ReadRecord<'profile'> | null;
  /** The library and this household's own foods. */
  foods: readonly Food[];
  foodById: (id: string) => Food | undefined;
  customFoods: ReadRecord<'custom_food'>[];
  exposures: Exposure[];
  statuses: Map<string, FoodStatus>;
  noticed: Noticed[];
  noticedRecords: ReadRecord<'noticed'>[];
  healthNotes: HealthNoteRow[];
  marks: ReadRecord<'plan_mark'>[];
  allergens: Record<AllergenId, AllergenState>;
  plan: PlanDay[];
  /** What the plan was built from, for a swap to ask the planner again (`swapOptions`). */
  planInput: PlanInput | null;
  /** The record ids of the plan marks, by `day:meal:kind:foodId`, so a mark can be taken back. */
  markIds: Map<string, string>;
  /** The meals logged for this baby, newest first, as the mirror holds them. */
  meals: SolidsMealRow[];
}

/** NibbleCue's view of one baby: the one on the chip, or the first when the chip shows them all. */
export function useNibble(): NibbleView {
  const { account } = useAuth();
  const child = useChild();
  const raw = useNibbleRaw();
  const zone = useTimeZone();
  const today = useDayKey(zone);
  const householdId = account?.memberships[0]?.household_id ?? null;
  const baby = child.child ?? child.children[0] ?? null;
  const babyId = baby?.id ?? null;
  // the model's ideas, kept on this phone, only while NibbleCue Plus is on (`planIdeas.ts`)
  const ideasOn = usePlan().can('planIdeas');
  const ideas = useSyncExternalStore(subscribeIdeas, () => ideasFor(babyId));
  useEffect(() => {
    if (babyId !== null) void loadIdeas(prefsStore, babyId, today);
  }, [babyId, today]);

  return useMemo<NibbleView>(() => {
    const dayFn = (ms: number): IsoDay => dayKeyAt(zone, ms);
    const childId = baby?.id ?? null;
    const records = raw.records.map(r => ({ ...r, body: r.body }));
    const custom = readRecords(records, 'custom_food');
    const customFoods = custom.map(c => customFoodToFood(c.id, c.body));
    const foods: Food[] = [...FOODS, ...customFoods];
    const byId = new Map(foods.map(f => [f.id, f]));
    const foodById = (id: string): Food | undefined => byId.get(id) ?? FOOD_BY_ID.get(id);
    const match = makeMatcher(foods);

    const mine = raw.meals.filter(m => childId !== null && m.child_id === childId);
    const exposures = exposuresFrom(
      mine.map(m => ({
        id: m.id,
        childId: m.child_id,
        startAt: m.start_at,
        meal: m.meal,
        items: m.items,
        food: m.food,
      })),
      ({ id, name }) => (id !== null ? foodById(id) : undefined) ?? match(name),
      dayFn,
    );
    const statuses = foodStatuses(exposures);

    const profileRecord = childId === null ? null : profileFor(records, childId);
    const profile = profileRecord?.body ?? null;
    const noticedRecords = readRecords(records, 'noticed').filter(r => r.childId === childId);
    const notes: HealthNote[] = raw.notes
      .filter(n => n.child_id === childId)
      .map(n => ({ id: n.id, childId: n.child_id, startAt: n.start_at }));
    const noticed = noticedForPlan(
      noticedRecords.map(r => r.body),
      notes,
    );
    const marks = readRecords(records, 'plan_mark').filter(r => r.childId === childId);
    const effective = profile ?? NibbleProfile.parse({ stage: 'started' });
    const allergens = allergenStates({
      profile: effective,
      exposures,
      noticed,
      foodById,
      today,
      offsetMinutes: dayFn,
    });
    const birthDate = (baby?.birth_date ?? null) as IsoDay | null;
    const months = birthDate === null ? 0 : monthsBetween(birthDate, today);
    const stage: Stage =
      birthDate === null
        ? 'too_young'
        : stageFor({
            birthDate,
            day: today,
            profile: effective,
            firstMealDay: exposures[0]?.day ?? null,
          });
    const planInput: PlanInput | null =
      birthDate === null || profile === null || childId === null
        ? null
        : {
            childId,
            birthDate,
            today,
            days: PLAN_DAYS,
            profile,
            foods,
            exposures,
            noticed,
            marks: marks.map(m => m.body as PlanMark),
            ai: ideasOn ? ideas : null,
            offsetMinutes: dayFn,
          };
    const plan = planInput === null ? [] : buildPlan(planInput);
    const markIds = new Map(
      marks.map(m => [`${m.body.day}:${m.body.meal}:${m.body.kind}:${m.body.foodId ?? ''}`, m.id]),
    );
    return {
      loaded: raw.loaded,
      householdId,
      childId,
      childName: baby?.name ?? '',
      birthDate,
      today,
      months,
      band: bandFor(months),
      stage,
      profile,
      profileRecord,
      foods,
      foodById,
      customFoods: custom,
      exposures,
      statuses,
      noticed,
      noticedRecords,
      healthNotes: raw.notes.filter(n => n.child_id === childId),
      marks,
      allergens,
      plan,
      planInput,
      markIds,
      meals: [...mine].reverse(),
    };
  }, [raw, zone, today, baby, householdId, ideasOn, ideas]);
}
