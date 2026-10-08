/** The household's meals and the foods in them — what the solids sheet suggests from and marks new against. */
import { summarizeFoods, type FoodSummary, type MealEntry } from '@nibblecue/core';
import { useMemo } from 'react';
import { useAuth } from '../../../../auth/AuthContext';
import { keys } from '../../../../data/store';
import { useLocalQuery } from '../../../../data/useLocalQuery';
import { mealHistory } from '../../../../db/queries/solids';

const NONE: MealEntry[] = [];

export interface MealHistory {
  meals: readonly MealEntry[];
  /** Every food, most recently eaten first. */
  foods: readonly FoodSummary[];
}

export function useMealHistory(): MealHistory {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  // `household/…` is in every activity write's invalidation set (`activityKeys`), whichever
  // child the meal was for — the per-child timeline keys would miss a twin's meal
  const storeKeys = useMemo(
    () => (householdId === null ? [] : [keys.household(householdId)]),
    [householdId],
  );
  const meals = useLocalQuery(
    storeKeys,
    db => (householdId === null ? Promise.resolve(NONE) : mealHistory(db, householdId)),
    NONE,
  );
  const foods = useMemo(() => summarizeFoods(meals), [meals]);
  return { meals, foods };
}
