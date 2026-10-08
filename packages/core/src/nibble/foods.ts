/**
 * ── THE FOOD LIBRARY ──────────────────────────────────────────────────────────────────────────
 *
 * Data (`foods.data.ts`), parsed once through the `Food` schema so a bad entry fails the build
 * rather than a screen. The helpers that need no data live in `catalog.ts`.
 */
import { FOOD_DATA } from './foods.data';
import { Food } from './types';

export const FOODS: readonly Food[] = FOOD_DATA.map(f => Food.parse(f));

export const FOOD_BY_ID: ReadonlyMap<string, Food> = new Map(FOODS.map(f => [f.id, f]));
