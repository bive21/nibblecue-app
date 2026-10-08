/**
 * ── NIBBLECUE'S VOCABULARY ────────────────────────────────────────────────────────────────────
 *
 * Every word the planner, the safety validator, the screens and the server agree on, as Zod
 * schemas with their inferred types. Pure data: nothing here reads a clock, a database or a model.
 *
 * WHERE EACH THING LIVES (docs/ARCHITECTURE.md):
 *   · A MEAL is CuddleCue's own `activities` row of type `solids` with its `solids_details.items`
 *     list (CuddleCue migration 0114). NibbleCue writes it through the same `sync_push`, so a
 *     meal logged in either app is one row both apps read ("log once"). The extra keys NibbleCue
 *     puts on a line (`food_id`, `form`, `plan_item`) are allowed by the server's own check and
 *     ignored by CuddleCue.
 *   · Everything only NibbleCue needs (the baby's food profile, custom foods, what was noticed,
 *     plan pins and swaps) is a `NibbleRecord`: one row per thing in the shared server's
 *     `nibble_records` table, written through `nibble_sync_push` (docs/SERVER.md).
 *   · Foods, allergens, stages, rules and guidance are DATA in this package, versioned with their
 *     sources, never typed into a screen.
 */
import { z } from 'zod';

/* ---------- regions ---------- */

/** Where the guidance comes from. US first; the others change milk timing, snacks and drops. */
export const REGIONS = ['US', 'UK', 'CA', 'AU'] as const;
export const Region = z.enum(REGIONS);
export type Region = z.infer<typeof Region>;

/* ---------- allergens ---------- */

/**
 * The nine priority allergens, with tree nuts tracked one nut at a time (a baby can be fine with
 * almond and not with cashew, and each is introduced on its own day). `group` is how a screen
 * folds the nuts into one row.
 */
export const ALLERGEN_IDS = [
  'egg',
  'peanut',
  'milk',
  'wheat',
  'soy',
  'sesame',
  'almond',
  'cashew',
  'walnut',
  'pecan',
  'pistachio',
  'hazelnut',
  'fish',
  'shellfish',
] as const;
export const AllergenId = z.enum(ALLERGEN_IDS);
export type AllergenId = z.infer<typeof AllergenId>;

export const ALLERGEN_GROUPS = [
  'egg',
  'peanut',
  'milk',
  'wheat',
  'soy',
  'sesame',
  'tree_nut',
  'fish',
  'shellfish',
] as const;
export type AllergenGroup = (typeof ALLERGEN_GROUPS)[number];

/* ---------- foods ---------- */

export const FOOD_CATEGORIES = [
  'vegetable',
  'fruit',
  'grain',
  'meat',
  'fish',
  'plant_protein',
  'dairy',
  'egg',
  'nut_seed',
  'fat',
  'herb_spice',
  'pouch_jar',
  'drink',
] as const;
export const FoodCategory = z.enum(FOOD_CATEGORIES);
export type FoodCategory = z.infer<typeof FoodCategory>;

export const CUISINES = [
  'american',
  'mediterranean',
  'south_asian',
  'east_asian',
  'southeast_asian',
  'latin_american',
  'middle_eastern',
  'west_african',
  'caribbean',
  'european',
] as const;
export const Cuisine = z.enum(CUISINES);
export type Cuisine = z.infer<typeof Cuisine>;

/**
 * HOW A FOOD IS OFFERED. The texture ladder runs purée → mashed → lumpy → minced → chopped →
 * family; finger shapes (`soft_stick`, `finger`) sit beside it for baby-led weaning. `spread` is a
 * thin layer on something else (nut butters), `mixed_in` is stirred into a food already tried (an
 * allergen's first, small exposure), `drink` is from an open or straw cup.
 */
export const FORMS = [
  'puree',
  'mashed',
  'lumpy',
  'soft_stick',
  'finger',
  'minced',
  'chopped',
  'family',
  'spread',
  'mixed_in',
  'drink',
] as const;
export const Form = z.enum(FORMS);
export type Form = z.infer<typeof Form>;

/** Age bands for serving guidance, in months: [from, to). */
export const AGE_BANDS = ['6-8', '9-11', '12-17', '18-24'] as const;
export const AgeBand = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof AgeBand>;

export const ChokingRisk = z.enum(['low', 'medium', 'high']);
export type ChokingRisk = z.infer<typeof ChokingRisk>;

/** 0 none, 1 some, 2 good, 3 rich. Highlights only: never a number of milligrams (spec §16.1). */
export const Level = z.number().int().min(0).max(3);

export const Serving = z.object({
  band: AgeBand,
  /** The forms that are safe to offer in this band. A high-choking-risk food in any other form is
   *  refused by the validator (rule `choking_form`). Empty = not offered in this band. */
  forms: z.array(Form),
  /** One or two plain sentences: how to cut or cook it for this age. */
  how: z.string().min(1).max(240),
});
export type Serving = z.infer<typeof Serving>;

export const Food = z.object({
  /** A stable slug, never renamed once shipped: logs and plans hold it. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1).max(40),
  /** Other names a parent might type ("garbanzo" for chickpea); used for search and log matching. */
  aliases: z.array(z.string()).default([]),
  category: FoodCategory,
  cuisines: z.array(Cuisine).default([]),
  /** Which priority allergens it contains. Yogurt is `milk`, pasta is `wheat`, mayo is `egg`. */
  allergens: z.array(AllergenId).default([]),
  /** Earliest age in months it may be planned at all (honey 12, cow's milk as a drink 12). */
  notBeforeMonths: z.number().int().min(4).max(60),
  chokingRisk: ChokingRisk,
  /** A good first food: soft, single ingredient, easy to prepare. */
  firstFood: z.boolean().default(false),
  ironRich: z.boolean().default(false),
  vitaminC: z.boolean().default(false),
  /** Tends to firm stools (rice cereal, banana in quantity). */
  firming: z.boolean().default(false),
  /** Tends to soften stools (prunes, pears, peaches). */
  softening: z.boolean().default(false),
  /** Animal-derived flags the dietary rules read. */
  meat: z.enum(['beef', 'pork', 'poultry', 'lamb', 'goat', 'other']).nullable().default(null),
  animal: z.enum(['none', 'dairy', 'egg', 'fish', 'shellfish', 'meat', 'honey']).default('none'),
  /** A root or bulb vegetable (Jain diets exclude these). */
  root: z.boolean().default(false),
  nutrients: z.object({
    iron: Level,
    protein: Level,
    fat: Level,
    fiber: Level,
    calcium: Level,
  }),
  serving: z.array(Serving).length(4),
  /** The one choking sentence a parent must read, for a medium or high risk food. */
  chokingNote: z.string().max(200).nullable().default(null),
  /** Two or three ways to serve or retry it, each a short sentence. */
  ideas: z.array(z.string().max(160)).max(4).default([]),
  /** Ids into `SOURCES`. Every food cites at least one. */
  sources: z.array(z.string()).min(1),
});
export type Food = z.infer<typeof Food>;
export type FoodInput = z.input<typeof Food>;

/* ---------- the baby's food profile ---------- */

export const Approach = z.enum(['puree', 'blw', 'mix']);
export type Approach = z.infer<typeof Approach>;

export const Diet = z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian']);
export type Diet = z.infer<typeof Diet>;

export const CULTURAL_RULES = [
  'halal',
  'kosher',
  'no_beef',
  'no_pork',
  'no_shellfish',
  'jain',
] as const;
export const CulturalRule = z.enum(CULTURAL_RULES);
export type CulturalRule = z.infer<typeof CulturalRule>;

export const Eczema = z.enum(['none', 'mild_moderate', 'severe']);
export type Eczema = z.infer<typeof Eczema>;

/** How allergens are introduced. `pediatrician`: only the ones the parent entered as approved. */
export const AllergenMode = z.enum(['early', 'pediatrician', 'none']);
export type AllergenMode = z.infer<typeof AllergenMode>;

export const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export const MealName = z.enum(MEALS);
export type MealName = z.infer<typeof MealName>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockTime = z.string().regex(/^\d{2}:\d{2}$/);

export const NibbleProfile = z.object({
  /** Where the family is on the journey when they start. */
  stage: z.enum(['getting_ready', 'started', 'eating_many']),
  startedOn: IsoDate.nullable().default(null),
  approach: Approach.default('mix'),
  diet: Diet.default('omnivore'),
  rules: z.array(CulturalRule).default([]),
  cuisines: z.array(Cuisine).default([]),
  eczema: Eczema.default('none'),
  /** A parent or sibling with a food allergy. */
  familyAllergy: z.boolean().default(false),
  /** Allergies a doctor has diagnosed. Always excluded, whatever else is set. */
  diagnosed: z.array(AllergenId).default([]),
  allergenMode: AllergenMode.default('early'),
  /** Pediatrician-directed: the allergens approved, each from its date. */
  approved: z.array(z.object({ allergen: AllergenId, from: IsoDate })).default([]),
  /** The parent's order of introduction; the default comes from `DEFAULT_ALLERGEN_ORDER`. */
  allergenOrder: z.array(AllergenId).default([]),
  /** Allergens the parent has put on hold (for example while talking to their pediatrician). */
  paused: z.array(AllergenId).default([]),
  /**
   * Allergens the parent has taken off hold after something they noticed, each with the day they
   * did. A hold from a sign noticed BEFORE that day no longer applies. The app never suggests this
   * (spec §1: it never tells a parent to re-introduce an allergen on its own authority); the
   * parent chooses it, after the words "talk to your pediatrician first".
   */
  cleared: z.array(z.object({ allergen: AllergenId, on: IsoDate })).default([]),
  /** Allergens and foods offered before the app, with a date when the parent knows it. */
  introducedBefore: z.array(z.object({ allergen: AllergenId, on: IsoDate.nullable() })).default([]),
  triedBefore: z.array(z.string()).default([]),
  /** Food ids (or custom food ids) never to plan. */
  neverServe: z.array(z.string()).default([]),
  /** Who else feeds the baby; switches on the caregiver sheet. */
  feeders: z.array(z.enum(['grandparents', 'daycare', 'nanny'])).default([]),
  /** Meals a day the parent chose; null follows the stage (two, then three, then three and a snack). */
  mealsPerDay: z.number().int().min(1).max(4).nullable().default(null),
  mealTimes: z.array(z.object({ meal: MealName, at: ClockTime })).default([]),
  region: Region.default('US'),
  /** The parent has confirmed the readiness signs (only asked before about six months). */
  ready: z.boolean().default(true),
  /** The parent has held the texture stage (the nudge past nine months stays a nudge). */
  holdTexture: z.boolean().default(false),
});
export type NibbleProfile = z.infer<typeof NibbleProfile>;
export type NibbleProfileInput = z.input<typeof NibbleProfile>;

/* ---------- what was noticed ---------- */

/**
 * SIGNS, IN THE PARENT'S WORDS FOR WHAT THEY SAW: never a condition. "Hives" is something seen;
 * "allergy" is a conclusion the app never draws (product-and-design.md, "Softening a sensitive
 * name"). `breathing` and `swelling` open the emergency card before anything is saved.
 */
export const SIGNS = [
  'rash',
  'hives',
  'itchy_mouth',
  'vomiting',
  'diarrhea',
  'mucus_stool',
  'swelling',
  'breathing',
  'pale_floppy',
  'other',
] as const;
export const Sign = z.enum(SIGNS);
export type Sign = z.infer<typeof Sign>;

/** The signs that mean "call emergency services now" (journey map, hard rule 18). */
export const EMERGENCY_SIGNS: readonly Sign[] = ['breathing', 'swelling', 'pale_floppy'];

export const Noticed = z.object({
  /** When it was seen. */
  at: z.string().datetime(),
  /** The meal it followed, when the parent linked one (a CuddleCue solids activity id). */
  activityId: z.string().uuid().nullable().default(null),
  /**
   * The CuddleCue Health note this is the food side of (a `wellbeing` activity, CuddleCue's
   * migration 0160): the sign, the time and the parent's words are written there, ONCE, so both
   * apps and the pediatrician sheet read one entry ("log once"). This record adds what only
   * NibbleCue knows: the foods it followed and the onset.
   */
  noteId: z.string().uuid().nullable().default(null),
  foodIds: z.array(z.string()).default([]),
  signs: z.array(Sign).min(1),
  /** Minutes from the meal to the first sign, when the parent knows it. */
  onsetMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullable()
    .default(null),
  notes: z.string().max(2000).nullable().default(null),
});
export type Noticed = z.infer<typeof Noticed>;

/* ---------- custom foods ---------- */

export const CustomFood = z.object({
  name: z.string().min(1).max(40),
  category: FoodCategory,
  allergens: z.array(AllergenId).default([]),
  chokingRisk: ChokingRisk.default('medium'),
  notBeforeMonths: z.number().int().min(6).max(60).default(6),
  ironRich: z.boolean().default(false),
});
export type CustomFood = z.infer<typeof CustomFood>;

/* ---------- plan marks ---------- */

/** A parent's hand on the plan: kept through every re-plan. */
export const PlanMark = z.object({
  day: IsoDate,
  meal: MealName,
  kind: z.enum(['pin', 'remove', 'skip_day']),
  foodId: z.string().nullable().default(null),
});
export type PlanMark = z.infer<typeof PlanMark>;

/* ---------- guidance cards ---------- */

/**
 * WHEN A CARD IS SHOWN. A card is published guidance in a sentence or three, with its source:
 * never generated, never about this baby's state (it says what is common, not what is wrong).
 */
export const CARD_TRIGGERS = [
  'always',
  'getting_ready',
  'first_week',
  'first_allergen',
  'first_finger_food',
  'texture_step',
  'cup',
  'stools',
  'refusal',
  'toddler',
  'daycare',
  'travel',
] as const;
export const CardTrigger = z.enum(CARD_TRIGGERS);
export type CardTrigger = z.infer<typeof CardTrigger>;

export const GuidanceCard = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1).max(60),
  /** Short: at most three sentences a tired parent reads in one breath. */
  body: z.string().min(1).max(360),
  /** Optional longer points, one line each, shown when the card is opened. */
  points: z.array(z.string().max(200)).max(8).default([]),
  trigger: CardTrigger,
  /** Inclusive month range the card applies to. */
  fromMonths: z.number().int().min(0).max(36),
  toMonths: z.number().int().min(0).max(36),
  /** Empty = every region. */
  regions: z.array(Region).default([]),
  sources: z.array(z.string()).min(1),
});
export type GuidanceCard = z.infer<typeof GuidanceCard>;
export type GuidanceCardInput = z.input<typeof GuidanceCard>;

/* ---------- the records NibbleCue keeps on the shared server ---------- */

export const RECORD_KINDS = ['profile', 'custom_food', 'noticed', 'plan_mark'] as const;
export const RecordKind = z.enum(RECORD_KINDS);
export type RecordKind = z.infer<typeof RecordKind>;

/** The body each kind carries, checked on the phone before it is written. */
export const RECORD_BODY = {
  profile: NibbleProfile,
  custom_food: CustomFood,
  noticed: Noticed,
  plan_mark: PlanMark,
} as const satisfies Record<RecordKind, z.ZodTypeAny>;
