/**
 * ── WHERE EVERY RULE AND EVERY SENTENCE OF GUIDANCE COMES FROM ────────────────────────────────
 *
 * Published guidance only, each with its publisher, its page and the date it was last checked
 * (bpnc-studio product-and-design.md: "Published guidance only, versioned, with its source and
 * date"). A food, a hard rule or a guidance card names its sources by id; `sources.test.ts` fails
 * the build when an id is cited that is not here. The list is the research pack's
 * (`03-journey-map.md`, last checked 2026-10-01).
 */
export interface Source {
  id: string;
  publisher: string;
  title: string;
  url: string;
  /** The day the page was last read against what the app says. */
  checked: string;
}

export const GUIDANCE_VERSION = '2026-10-01';

const c = GUIDANCE_VERSION;

export const SOURCES: readonly Source[] = [
  {
    id: 'aap-starting-solids',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'Starting solid foods',
    url: 'https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/Starting-Solid-Foods.aspx',
    checked: c,
  },
  {
    id: 'aap-allergens',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'When to introduce egg, peanut butter and other common allergens',
    url: 'https://www.healthychildren.org/English/healthy-living/nutrition/Pages/when-to-introduce-egg-peanut-butter-and-other-common-food-allergens-to-your-baby-food-allergy-prevention-tips.aspx',
    checked: c,
  },
  {
    id: 'aap-choking',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'Choking prevention',
    url: 'https://www.healthychildren.org/English/health-issues/injuries-emergencies/Pages/Choking-Prevention.aspx',
    checked: c,
  },
  {
    id: 'aap-bottle',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'Discontinuing the bottle',
    url: 'https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/Discontinuing-the-Bottle.aspx',
    checked: c,
  },
  {
    id: 'aap-juice',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'Where we stand: fruit juice',
    url: 'https://www.healthychildren.org/English/healthy-living/nutrition/Pages/Where-We-Stand-Fruit-Juice.aspx',
    checked: c,
  },
  {
    id: 'aap-vitamins',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'Vitamin D and iron supplements for babies',
    url: 'https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/Vitamin-Iron-Supplements.aspx',
    checked: c,
  },
  {
    id: 'aap-toddler-milk',
    publisher: 'AAP (HealthyChildren.org)',
    title: 'Your toddler only wants milk',
    url: 'https://www.healthychildren.org/English/ages-stages/toddler/nutrition/Pages/your-toddler-only-wants-milk-how-to-ease-milk-dependency-and-encourage-a-healthy-diet.aspx',
    checked: c,
  },
  {
    id: 'cdc-faqs',
    publisher: 'CDC',
    title: 'Infant and toddler nutrition: frequently asked questions',
    url: 'https://www.cdc.gov/infant-toddler-nutrition/faqs/index.html',
    checked: c,
  },
  {
    id: 'cdc-iron',
    publisher: 'CDC',
    title: 'Iron',
    url: 'https://www.cdc.gov/infant-toddler-nutrition/vitamins-minerals/iron.html',
    checked: c,
  },
  {
    id: 'cdc-milk',
    publisher: 'CDC',
    title: "Cow's milk and milk alternatives",
    url: 'https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/cows-milk-and-milk-alternatives.html',
    checked: c,
  },
  {
    id: 'cdc-mealtime',
    publisher: 'CDC',
    title: 'Mealtime routines',
    url: 'https://www.cdc.gov/infant-toddler-nutrition/mealtime/',
    checked: c,
  },
  {
    id: 'cdc-food-safety-under-5',
    publisher: 'CDC',
    title: 'Food safety for children under 5',
    url: 'https://cdc.gov/food-safety/foods/children-under-5.html',
    checked: c,
  },
  {
    id: 'cdc-milestones',
    publisher: 'CDC',
    title: 'Developmental milestones',
    url: 'https://www.cdc.gov/act-early/milestones/index.html',
    checked: c,
  },
  {
    id: 'usda-dga',
    publisher: 'USDA and HHS',
    title: 'Dietary Guidelines for Americans: infants and toddlers',
    url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-11/2020-2025_DGA_HealthcareProfessionalsPresentation_InfantsToddlers.pdf',
    checked: c,
  },
  {
    id: 'niaid-peanut',
    publisher: 'NIAID (via AAFP)',
    title: 'Addendum guidelines for the prevention of peanut allergy',
    url: 'https://www.aafp.org/afp/2017/0715/p130',
    checked: c,
  },
  {
    id: 'nhs-choking',
    publisher: 'NHS',
    title: 'Choking and gagging on food',
    url: 'https://www.nhs.uk/best-start-in-life/baby/weaning/safe-weaning/choking-and-gagging-on-food/',
    checked: c,
  },
  {
    id: 'nhs-7-9',
    publisher: 'NHS',
    title: 'What to feed your baby: 7 to 9 months',
    url: 'https://www.nhs.uk/start-for-life/baby/weaning/what-to-feed-your-baby/7-to-9-months/',
    checked: c,
  },
  {
    id: 'nhs-10-12',
    publisher: 'NHS',
    title: 'What to feed your baby: 10 to 12 months',
    url: 'https://www.nhs.uk/start-for-life/baby/weaning/what-to-feed-your-baby/10-to-12-months/',
    checked: c,
  },
  {
    id: 'nhs-over-12',
    publisher: 'NHS',
    title: 'What to feed your baby: over 12 months',
    url: 'https://www.nhs.uk/best-start-in-life/baby/weaning/what-to-feed-your-baby/over-12-months/',
    checked: c,
  },
  {
    id: 'nhs-salt',
    publisher: 'NHS',
    title: 'Salt in your diet',
    url: 'https://www.nhs.uk/live-well/eat-well/food-types/salt-in-your-diet/',
    checked: c,
  },
  {
    id: 'health-canada-6-24',
    publisher: 'Health Canada',
    title: 'Nutrition for healthy term infants: 6 to 24 months',
    url: 'https://www.canada.ca/en/health-canada/services/canada-food-guide/resources/nutrition-healthy-term-infants/nutrition-healthy-term-infants-recommendations-birth-six-months/6-24-months.html',
    checked: c,
  },
  {
    id: 'raisingchildren-solids',
    publisher: 'raisingchildren.net.au',
    title: 'Introducing solids',
    url: 'https://raisingchildren.net.au/babies/breastfeeding-bottle-feeding-solids/solids-drinks/introducing-solids',
    checked: c,
  },
  {
    id: 'unicef-6-12',
    publisher: 'UNICEF',
    title: 'Feeding your baby: 6 to 12 months',
    url: 'https://www.unicef.org/parenting/food-nutrition/feeding-your-baby-6-12-months',
    checked: c,
  },
  {
    id: 'harvard-constipation',
    publisher: 'Harvard Health',
    title: 'Constipation in infants and children',
    url: 'https://www.health.harvard.edu/decision_guide/constipation-in-infants',
    checked: c,
  },
  {
    id: 'satter-sdor',
    publisher: 'Ellyn Satter Institute',
    title: 'Division of responsibility in feeding',
    url: 'https://www.ellynsatterinstitute.org/wp-content/uploads/2025/06/Satter-Division-of-Responsibility-in-Feeding-2025-1.pdf',
    checked: c,
  },
  {
    id: 'healthlink-vegan',
    publisher: 'HealthLink BC',
    title: 'Vegan feeding guidelines for babies and toddlers',
    url: 'https://www.healthlinkbc.ca/healthlinkbc-files/vegan-feeding-guidelines-babies-and-toddlers',
    checked: c,
  },
];

export const SOURCE_BY_ID: ReadonlyMap<string, Source> = new Map(SOURCES.map(s => [s.id, s]));
