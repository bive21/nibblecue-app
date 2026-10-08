/**
 * ── THE NINE PRIORITY ALLERGENS ───────────────────────────────────────────────────────────────
 *
 * Names, groups and the default order of introduction (spec §8.4, from AAP and NIAID guidance:
 * egg, peanut, dairy, wheat, soy, sesame, tree nuts one at a time, fish, shellfish). The order is
 * the parent's to change; this is only where it starts.
 */
import type { AllergenGroup, AllergenId, Region } from './types';

export interface AllergenInfo {
  id: AllergenId;
  group: AllergenGroup;
  /** How a parent reads it: "Egg", "Peanut", "Cashew". */
  name: string;
  /** The group's name, for the folded tree-nut row. */
  groupName: string;
}

const info = (id: AllergenId, group: AllergenGroup, name: string, groupName = name) => ({
  id,
  group,
  name,
  groupName,
});

export const ALLERGENS: Readonly<Record<AllergenId, AllergenInfo>> = {
  egg: info('egg', 'egg', 'Egg'),
  peanut: info('peanut', 'peanut', 'Peanut'),
  milk: info('milk', 'milk', "Cow's milk", 'Dairy'),
  wheat: info('wheat', 'wheat', 'Wheat'),
  soy: info('soy', 'soy', 'Soy'),
  sesame: info('sesame', 'sesame', 'Sesame'),
  almond: info('almond', 'tree_nut', 'Almond', 'Tree nuts'),
  cashew: info('cashew', 'tree_nut', 'Cashew', 'Tree nuts'),
  walnut: info('walnut', 'tree_nut', 'Walnut', 'Tree nuts'),
  pecan: info('pecan', 'tree_nut', 'Pecan', 'Tree nuts'),
  pistachio: info('pistachio', 'tree_nut', 'Pistachio', 'Tree nuts'),
  hazelnut: info('hazelnut', 'tree_nut', 'Hazelnut', 'Tree nuts'),
  fish: info('fish', 'fish', 'Fish'),
  shellfish: info('shellfish', 'shellfish', 'Shellfish'),
};

/** Spec §8.4's default order. Tree nuts one at a time, the most common first. */
export const DEFAULT_ALLERGEN_ORDER: readonly AllergenId[] = [
  'egg',
  'peanut',
  'milk',
  'wheat',
  'soy',
  'sesame',
  'cashew',
  'almond',
  'walnut',
  'hazelnut',
  'pecan',
  'pistachio',
  'fish',
  'shellfish',
];

/** The parent's order where they set one, then everything they left out in the default order. */
export function allergenOrder(parentOrder: readonly AllergenId[]): AllergenId[] {
  const seen = new Set<AllergenId>();
  const out: AllergenId[] = [];
  for (const a of [...parentOrder, ...DEFAULT_ALLERGEN_ORDER]) {
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/** The number the emergency card dials, by region. */
export const EMERGENCY_NUMBER: Readonly<Record<Region, string>> = {
  US: '911',
  CA: '911',
  UK: '999',
  AU: '000',
};

/**
 * Times a week a tolerated allergen is offered to keep it in the diet (spec §6.5: at least twice a
 * week; peanut three times for a baby at higher risk, NIAID). A target for the plan's own
 * scheduling, shown as a count; never a verdict when it is missed.
 */
export function keepGoingTarget(allergen: AllergenId, higherRisk: boolean): number {
  return allergen === 'peanut' && higherRisk ? 3 : 2;
}
