/**
 * ── THE FOOD SETUP'S ANSWERS, AND THE PROFILE THEY MAKE ───────────────────────────────────────
 *
 * The setup screen (`screens/nibble/FoodSetupScreen.tsx`) holds the parent's answers in the shape
 * the questions ask them (docs/research/MARKET_AND_SETUP.md §2.4), and this turns them into the
 * one profile the planner reads. Pure, so every branch is tested without a screen.
 *
 * The answers start from what the household already has: the profile when there is one, the
 * solids CuddleCue logged (`preAnswerFromLog`), the phone's region, and the defaults the research
 * sets by the baby's age.
 */
import {
  ALLERGENS,
  defaultStartChoice,
  excludedByDiet,
  FOOD_BY_ID,
  FOODS,
  NibbleProfile,
  type AllergenId,
  type AllergenMode,
  type Food,
  type Approach,
  type CulturalRule,
  type Cuisine,
  type Diet,
  type IsoDay,
  type LogPreAnswer,
  type ReadinessSign,
  type Region,
  type StartChoice,
} from '@nibblecue/core/nibble';

export type Where = 'not_yet' | 'started' | 'lots';
export type Texture = 'smooth' | 'lumps' | 'pieces' | 'family';
export type EczemaAnswer = 'none' | 'mild' | 'severe' | 'unsure';

export interface SetupAnswers {
  where: Where | null;
  firstTaste: IsoDay | null;
  signs: ReadinessSign[];
  start: StartChoice;
  startOn: IsoDay | null;
  approach: Approach;
  texture: Texture;
  diet: Diet;
  rules: CulturalRule[];
  cuisines: Cuisine[];
  tried: string[];
  doctor: boolean;
  diagnosed: AllergenId[];
  eczema: EczemaAnswer;
  introduced: AllergenId[];
  mode: AllergenMode;
  region: Region;
}

/** §2.4 Q3': the texture default by age. */
export const textureForAge = (months: number): Texture =>
  months >= 12 ? 'family' : months >= 9 ? 'pieces' : 'lumps';

const ECZEMA_IN: Readonly<Record<NibbleProfile['eczema'], EczemaAnswer>> = {
  none: 'none',
  mild_moderate: 'mild',
  severe: 'severe',
};

/** The answers a setup opens on: the profile's own, else the log's, else the age's defaults. */
export function initialAnswers(input: {
  profile: NibbleProfile | null;
  log: LogPreAnswer;
  months: number;
  today: IsoDay;
  region: Region;
}): SetupAnswers {
  const p = input.profile;
  const fromLog = input.log.stage !== 'getting_ready';
  const where: Where | null = p
    ? p.stage === 'getting_ready'
      ? 'not_yet'
      : p.stage === 'started'
        ? 'started'
        : 'lots'
    : fromLog
      ? input.log.stage === 'started'
        ? 'started'
        : 'lots'
      : null;
  const signs = p?.signsSeen ?? [];
  return {
    where,
    firstTaste: p?.startedOn ?? input.log.firstDay,
    signs,
    start: p?.startOn
      ? p.startOn <= input.today
        ? 'today'
        : 'day'
      : p && !p.ready
        ? 'signs'
        : defaultStartChoice(signs.length, input.months),
    startOn: p?.startOn ?? null,
    approach: p?.approach ?? 'mix',
    texture: p ? (p.holdTexture ? 'smooth' : textureOf(p.approach)) : textureForAge(input.months),
    diet: p?.diet ?? 'omnivore',
    rules: p?.rules ?? [],
    cuisines: p?.cuisines ?? [],
    tried: [...new Set([...(p?.triedBefore ?? []), ...input.log.foodIds])],
    doctor: (p?.diagnosed.length ?? 0) > 0,
    diagnosed: p?.diagnosed ?? [],
    eczema: p ? ECZEMA_IN[p.eczema] : 'none',
    introduced: p?.introducedBefore.map(i => i.allergen) ?? allergensIn(input.log.foodIds),
    mode: p?.allergenMode ?? 'early',
    region: p?.region ?? input.region,
  };
}

const textureOf = (approach: Approach): Texture =>
  approach === 'puree' ? 'lumps' : approach === 'blw' ? 'family' : 'pieces';

/** The allergens inside a set of foods: yogurt counts as milk, pasta as wheat. */
export function allergensIn(foodIds: readonly string[]): AllergenId[] {
  const out = new Set<AllergenId>();
  for (const id of foodIds) for (const a of FOOD_BY_ID.get(id)?.allergens ?? []) out.add(a);
  return (Object.keys(ALLERGENS) as AllergenId[]).filter(a => out.has(a));
}

/** The steps a branch walks, in order (§2.3). Under four months there are no questions. */
export type Step =
  | 'too_young'
  | 'intro'
  | 'where'
  | 'start'
  | 'approach'
  | 'texture'
  | 'family'
  | 'tried'
  | 'allergens';

export function stepsFor(where: Where | null, months: number): Step[] {
  if (months < 4) return ['too_young'];
  const tail: Step[] = ['family'];
  if (where === 'not_yet') return ['intro', 'where', 'start', 'approach', ...tail, 'allergens'];
  if (where === 'lots') return ['intro', 'where', 'texture', ...tail, 'tried', 'allergens'];
  return ['intro', 'where', 'approach', ...tail, 'tried', 'allergens'];
}

/** The profile the answers make, keeping everything setup does not ask from the one there was. */
export function profileFromAnswers(
  a: SetupAnswers,
  base: NibbleProfile | null,
  today: IsoDay,
): NibbleProfile {
  const notYet = a.where === 'not_yet';
  const startOn = notYet
    ? a.start === 'today'
      ? today
      : a.start === 'day'
        ? a.startOn
        : null
    : null;
  const lots = a.where === 'lots';
  const approach: Approach = lots
    ? a.texture === 'family'
      ? 'blw'
      : a.texture === 'pieces'
        ? 'mix'
        : 'puree'
    : a.approach;
  return NibbleProfile.parse({
    ...(base ?? {}),
    stage: notYet ? 'getting_ready' : a.where === 'started' ? 'started' : 'eating_many',
    startedOn: notYet ? null : (a.firstTaste ?? today),
    startOn,
    ready: notYet ? a.start !== 'signs' : true,
    signsSeen: a.signs,
    approach,
    holdTexture: lots ? a.texture === 'smooth' : (base?.holdTexture ?? false),
    diet: a.diet,
    rules: a.rules,
    cuisines: a.cuisines,
    triedBefore: notYet ? (base?.triedBefore ?? []) : a.tried,
    diagnosed: a.doctor ? a.diagnosed : [],
    eczema: a.eczema === 'severe' ? 'severe' : a.eczema === 'none' ? 'none' : 'mild_moderate',
    introducedBefore: notYet
      ? (base?.introducedBefore ?? [])
      : a.introduced.map(allergen => ({
          allergen,
          on: base?.introducedBefore.find(i => i.allergen === allergen)?.on ?? null,
        })),
    allergenMode: a.mode,
    region: a.region,
  });
}

/**
 * The profile the live preview plans from. "When I see the signs" makes a plan that waits, so the
 * preview shows what the first days would be if the family started today, and says so.
 */
export function previewProfile(
  a: SetupAnswers,
  base: NibbleProfile | null,
  today: IsoDay,
): NibbleProfile {
  const hypothetical =
    a.where === 'not_yet' && (a.start === 'signs' || (a.start === 'day' && a.startOn === null));
  return profileFromAnswers(hypothetical ? { ...a, start: 'today' } : a, base, today);
}

/** §2.4 Q5: the first foods most families start with, in the order the grid shows them. */
export const COMMON_FIRST_FOODS: readonly string[] = [
  'sweet-potato',
  'avocado',
  'banana',
  'infant-oat-cereal',
  'carrot',
  'butternut-squash',
  'peas',
  'pear',
  'apple',
  'broccoli',
  'egg',
  'plain-yogurt',
  'beef',
  'chicken-thigh',
  'salmon',
  'red-lentils',
  'black-beans',
  'tofu',
  'bread',
  'pasta',
  'oatmeal',
  'mango',
  'peach',
  'blueberry',
];

/** The grid for this family: the common first foods their diet and rules allow. */
export function commonFoodsFor(a: SetupAnswers, base: NibbleProfile | null, today: IsoDay): Food[] {
  const p = profileFromAnswers(a, base, today);
  return COMMON_FIRST_FOODS.map(id => FOOD_BY_ID.get(id)).filter(
    (f): f is Food => f !== undefined && !excludedByDiet(f, p),
  );
}

/** "Tick all the fruits and vegetables": the library's whole fruits and vegetables the diet allows. */
export function fruitAndVegFor(
  a: SetupAnswers,
  base: NibbleProfile | null,
  today: IsoDay,
): string[] {
  const p = profileFromAnswers(a, base, today);
  return FOODS.filter(
    f => (f.category === 'fruit' || f.category === 'vegetable') && !excludedByDiet(f, p),
  ).map(f => f.id);
}

/** Q6 c starts from every allergen inside the foods ticked in Q5, kept with any ticked by hand. */
export function withTriedAllergens(a: SetupAnswers): SetupAnswers {
  const more = allergensIn(a.tried).filter(x => !a.introduced.includes(x));
  return more.length === 0 ? a : { ...a, introduced: [...a.introduced, ...more] };
}
