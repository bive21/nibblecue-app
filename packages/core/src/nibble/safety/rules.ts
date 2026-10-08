/**
 * ── THE HARD RULES ────────────────────────────────────────────────────────────────────────────
 *
 * Spec §8.2, from the research pack's evidence map (`03-journey-map.md`, "Hard rules the app must
 * encode"). A plan item that breaks one never reaches a screen, whoever proposed it: the rule
 * planner, the model (allowed by the owner on 2026-10-08) or a parent's pin. Each rule names its
 * sources so the app can show where it comes from; `rules.test.ts` holds every source to
 * `SOURCES`.
 */
export const HARD_RULES = [
  {
    id: 'not_before_4_months',
    text: 'No solid food before 4 months.',
    sources: ['usda-dga', 'aap-starting-solids', 'cdc-faqs'],
  },
  {
    id: 'not_before_age',
    text: 'A food is only planned from the age its guidance allows (honey, juice and cow’s milk as a drink from 12 months).',
    sources: ['usda-dga', 'cdc-faqs', 'aap-juice', 'cdc-milk'],
  },
  {
    id: 'before_six_months',
    text: 'Before 6 months, only smooth purées of single first foods, and no common allergen yet.',
    sources: ['aap-starting-solids', 'cdc-faqs', 'raisingchildren-solids'],
  },
  {
    id: 'no_honey_under_12',
    text: 'No honey before 12 months, raw or cooked, including in recipes.',
    sources: ['usda-dga', 'cdc-faqs'],
  },
  {
    id: 'no_high_mercury_fish',
    text: 'No shark, swordfish, marlin, king mackerel, orange roughy, tilefish or bigeye tuna.',
    sources: ['usda-dga', 'cdc-food-safety-under-5'],
  },
  {
    id: 'unsafe_food',
    text: 'No unpasteurized milk, cheese or juice, raw sprouts, raw or undercooked egg, meat or fish, raw dough, rice drinks, or the choking hazards kept off the menu until 4 years (popcorn, whole nuts, hot dogs, marshmallows, hard candy).',
    sources: ['cdc-food-safety-under-5', 'aap-choking'],
  },
  {
    id: 'choking_form',
    text: 'A food is offered only in a form that suits the age (grapes quartered lengthwise, nut butters thinned, no whole nuts).',
    sources: ['aap-choking', 'nhs-choking'],
  },
  {
    id: 'allergen_not_released',
    text: 'An allergen is offered for the first time only when the plan schedules it, one at a time.',
    sources: ['aap-allergens', 'niaid-peanut'],
  },
  {
    id: 'allergen_held',
    text: 'An allergen your doctor said to avoid, one you put on hold, or one followed by a noticed sign is never planned.',
    sources: ['aap-allergens'],
  },
  {
    id: 'restriction',
    text: 'Nothing the family has said never to serve, and nothing outside the family’s diet and rules.',
    // the family's own rule, not published guidance: it cites nothing
    sources: [],
  },
  {
    id: 'one_new_food_a_day',
    text: 'At most one new food a day besides a new allergen.',
    sources: ['aap-allergens', 'cdc-faqs'],
  },
  {
    id: 'one_new_allergen_a_day',
    text: 'At most one new allergen a day, never on the same day as another new food.',
    sources: ['aap-allergens'],
  },
  {
    id: 'new_allergen_timing',
    text: 'A new allergen is first offered at the first meal of the day, at home, at least 3 days after the last new allergen and 14 days after any noticed sign.',
    sources: ['aap-allergens', 'niaid-peanut'],
  },
  {
    id: 'rotate_grains',
    text: 'Rice cereal is never the only grain: it is planned at most twice a week.',
    sources: ['cdc-faqs', 'cdc-iron'],
  },
  {
    id: 'kosher_meat_dairy',
    text: 'For a kosher kitchen, meat and dairy are never in the same meal.',
    sources: [],
  },
] as const;

export type HardRuleId = (typeof HARD_RULES)[number]['id'];

export const HARD_RULE_BY_ID: ReadonlyMap<HardRuleId, (typeof HARD_RULES)[number]> = new Map(
  HARD_RULES.map(r => [r.id, r]),
);

/** Names a custom food may not carry: the high-mercury fish (hard rule 6), matched as words. */
export const HIGH_MERCURY = [
  'shark',
  'swordfish',
  'marlin',
  'king mackerel',
  'orange roughy',
  'tilefish',
  'bigeye',
] as const;

export const isHighMercuryName = (name: string): boolean =>
  HIGH_MERCURY.some(f => new RegExp(`\\b${f}\\b`, 'i').test(name));

/** Unsafe preparations a custom food's name may not describe (hard rule 7). */
export const UNSAFE_NAMES = [
  'raw egg',
  'raw milk',
  'unpasteurized',
  'unpasteurised',
  'sprouts',
  'raw dough',
  'cookie dough',
  'sushi',
  'popcorn',
  'whole nut',
  'whole grape',
  'hot dog',
  'marshmallow',
  'hard candy',
  'rice milk',
  'rice drink',
] as const;

export const isUnsafeName = (name: string): boolean =>
  UNSAFE_NAMES.some(f => new RegExp(`\\b${f}`, 'i').test(name));
