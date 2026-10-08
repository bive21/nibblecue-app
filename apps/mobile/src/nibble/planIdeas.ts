/**
 * ── PLAN IDEAS FROM THE MODEL (NibbleCue Plus) ────────────────────────────────────────────────
 *
 * The request is built here from what the phone already knows, and holds only tokens and food ids
 * (`aiSummary`): never a name, a birth date or a note. The server function (`nibble-plan-ideas` in
 * cuddlecue-app) refuses anything else, asks the model, and drops ids it was not offered. What
 * comes back is read with `parseDraft` (only the days asked, only offered ids, every reason
 * scanned by `safeNote`), kept on this phone for the days it covers, and handed to the rule planner
 * as `input.ai`, where every idea goes through the same validator as every other item. An idea the
 * rules refuse never reaches the plan.
 *
 * With no key on the server, no network, the daily cap, or a refusal, nothing is kept and the
 * plan is the rule planner's alone.
 */
import {
  aiSummary,
  parseDraft,
  type AiDraftItem,
  type Food,
  type FoodStatus,
  type NibbleProfile,
  type PlanDay,
  type Stage,
  type AllergenId,
  type AllergenState,
} from '@nibblecue/core/nibble';
import type { KeyValueStore } from '../prefs';

/** At most this many days per ask (the server's MAX_DAYS). */
export const IDEA_DAYS = 7;
const MAX_CANDIDATES = 600;

export interface IdeasInput {
  householdId: string;
  childId: string;
  months: number;
  stage: Stage;
  profile: NibbleProfile;
  foods: readonly Food[];
  statuses: ReadonlyMap<string, FoodStatus>;
  allergens: Readonly<Record<AllergenId, AllergenState>>;
  plan: readonly PlanDay[];
}

/** The foods the model may choose from: old enough, not refused by the family, never a first allergen. */
export function ideaCandidates(input: IdeasInput): Food[] {
  return input.foods
    .filter(f => !input.profile.neverServe.includes(f.id))
    .filter(f => input.months >= f.notBeforeMonths)
    .filter(f => input.statuses.has(`id:${f.id}`) || f.allergens.length === 0)
    .slice(0, MAX_CANDIDATES);
}

/** The body `nibble-plan-ideas` takes: the next days that have meals, and the summary. */
export function ideasRequest(input: IdeasInput): Record<string, unknown> | null {
  const days = input.plan
    .filter(d => !d.skip && d.meals.length > 0)
    .slice(0, IDEA_DAYS)
    .map(d => ({ day: d.day, meals: d.meals.map(m => m.meal) }));
  const candidates = ideaCandidates(input);
  if (days.length === 0 || candidates.length === 0) return null;
  return {
    household_id: input.householdId,
    child_id: input.childId,
    days,
    summary: aiSummary({
      months: input.months,
      stage: input.stage,
      profile: input.profile,
      statuses: input.statuses,
      allergens: input.allergens,
      candidates,
    }),
  };
}

/** The server's draft, made safe for the planner: only the days asked and the ids offered. */
export function ideasFrom(draft: unknown, request: Record<string, unknown>): AiDraftItem[] {
  const days = (request['days'] as { day: string }[]).map(d => d.day);
  const summary = request['summary'] as { candidates: string[] };
  return parseDraft(draft, { days, foodIds: new Set(summary.candidates) });
}

/* ── kept on this phone, per baby ────────────────────────────────────────────────────────── */

const key = (childId: string): string => `nibble_ideas:${childId}`;
const kept = new Map<string, AiDraftItem[]>();
const listeners = new Set<() => void>();
const EMPTY: AiDraftItem[] = [];

export function ideasFor(childId: string | null): AiDraftItem[] {
  return childId === null ? EMPTY : (kept.get(childId) ?? EMPTY);
}

export function subscribeIdeas(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function keepIdeas(
  store: KeyValueStore,
  childId: string,
  items: AiDraftItem[],
): Promise<void> {
  kept.set(childId, items);
  listeners.forEach(l => l());
  await store.set(key(childId), JSON.stringify(items));
}

/** Read back what an earlier ask kept, dropping days that have passed. */
export async function loadIdeas(
  store: KeyValueStore,
  childId: string,
  today: string,
): Promise<void> {
  if (kept.has(childId)) return;
  const raw = await store.get(key(childId));
  if (raw === null) return;
  try {
    const items = (JSON.parse(raw) as AiDraftItem[]).filter(i => i.day >= today);
    kept.set(childId, items);
    listeners.forEach(l => l());
  } catch {
    /* an unreadable copy is no ideas, and the next ask writes a good one */
  }
}
