/**
 * ── THE MODEL'S DRAFT, MADE SAFE TO READ ──────────────────────────────────────────────────────
 *
 * The owner allowed AI on 2026-10-08 (*"ai is fine"*). The model PROPOSES; the validator decides
 * (spec §8). This file is the phone's half of the boundary:
 *
 *   · what is sent: a summary built here (`aiSummary`): age, stage, region, approach, diet and
 *     rules, the foods tried with counts and the last answer, allergen states, and the candidate
 *     foods the validator already allows. Never a name, never a note a parent typed.
 *   · what comes back is parsed forgivingly (`parseDraft`): an unknown food id, a day outside the
 *     plan, a meal the day does not hold or a malformed entry is dropped, never an error.
 *   · every reason the model wrote passes `bannedIn` and the length limit, or it is replaced by
 *     the plan's own words. Nothing a model writes reaches a screen unscanned.
 *
 * Then `buildPlan` runs each suggestion through the validator like any other item.
 */
import { bannedIn } from '../copy.banned';
import type { AllergenState, FoodStatus } from '../history';
import type { Stage } from '../stage';
import { MEALS, type AllergenId, type Food, type MealName, type NibbleProfile } from '../types';
import type { AiDraftItem } from './plan';

export const AI_NOTE_MAX = 90;

export interface AiSummary {
  ageMonths: number;
  stage: Stage;
  region: NibbleProfile['region'];
  approach: NibbleProfile['approach'];
  diet: NibbleProfile['diet'];
  rules: NibbleProfile['rules'];
  cuisines: NibbleProfile['cuisines'];
  triedFoods: { id: string; times: number; lastResponse: FoodStatus['lastResponse'] }[];
  allergenStates: Partial<Record<AllergenId, AllergenState['kind']>>;
  candidates: string[];
}

export function aiSummary(input: {
  months: number;
  stage: Stage;
  profile: NibbleProfile;
  statuses: ReadonlyMap<string, FoodStatus>;
  allergens: Readonly<Record<AllergenId, AllergenState>>;
  candidates: readonly Food[];
}): AiSummary {
  return {
    ageMonths: input.months,
    stage: input.stage,
    region: input.profile.region,
    approach: input.profile.approach,
    diet: input.profile.diet,
    rules: input.profile.rules,
    cuisines: input.profile.cuisines,
    triedFoods: [...input.statuses.values()]
      .filter(s => s.foodId !== null)
      .map(s => ({ id: s.foodId as string, times: s.times, lastResponse: s.lastResponse })),
    allergenStates: Object.fromEntries(
      Object.values(input.allergens).map(s => [s.allergen, s.kind]),
    ) as AiSummary['allergenStates'],
    candidates: input.candidates.map(f => f.id),
  };
}

/** A reason the model wrote, or null when it may not be shown. */
export function safeNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s === '' || s.length > AI_NOTE_MAX) return null;
  if (bannedIn(s).length > 0) return null;
  // no dashes in a sentence, no numbers that look like amounts (a portion is the parent's call)
  if (/\s[-–—]\s|—|–/.test(s)) return null;
  if (/\d/.test(s)) return null;
  return s;
}

export function parseDraft(
  raw: unknown,
  opts: { days: readonly string[]; foodIds: ReadonlySet<string> },
): AiDraftItem[] {
  const out: AiDraftItem[] = [];
  const days = (raw as { days?: unknown } | null)?.days;
  if (!Array.isArray(days)) return out;
  for (const d of days) {
    const day = (d as { day?: unknown }).day;
    if (typeof day !== 'string' || !opts.days.includes(day)) continue;
    const meals = (d as { meals?: unknown }).meals;
    if (!Array.isArray(meals)) continue;
    for (const m of meals) {
      const meal = (m as { meal?: unknown }).meal;
      if (typeof meal !== 'string' || !(MEALS as readonly string[]).includes(meal)) continue;
      const items = (m as { items?: unknown }).items;
      if (!Array.isArray(items)) continue;
      for (const it of items.slice(0, 3)) {
        const foodId =
          (it as { foodId?: unknown; id?: unknown }).foodId ?? (it as { id?: unknown }).id;
        if (typeof foodId !== 'string' || !opts.foodIds.has(foodId)) continue;
        out.push({
          day,
          meal: meal as MealName,
          foodId,
          note: safeNote(
            (it as { reason?: unknown; note?: unknown }).reason ?? (it as { note?: unknown }).note,
          ),
        });
      }
    }
  }
  return out;
}
