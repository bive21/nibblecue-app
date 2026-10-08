/**
 * EVERY SENTENCE ON NIBBLECUE'S OWN SCREENS, in one place: `copy.test.ts` holds each to the
 * studio's voice (sentence case, plain, warm, short, US English, no dashes in a sentence, nothing
 * from `NIBBLE_BANNED`). The plan's own words (reasons, form names, allergen states, sign names)
 * are core's (`packages/core/src/nibble/copy.ts`) and are not repeated here.
 */
import { BRAND } from '@nibblecue/brand';

const plus = BRAND.plusTierName;

/** The button on every Plus lock. */
export const PLUS_SEE = `See ${plus}`;

export const TODAY = {
  title: 'Today',
  emptyTitle: 'Nothing planned today',
  skipped: 'You skipped today. Tomorrow picks up where the plan left off.',
  unskip: 'Plan today after all',
  served: 'Served',
  servedDone: 'Served',
  servedAgain: 'Served again',
  allergensEmpty: 'Allergens show here once they are part of the week.',
  noChildTitle: 'No baby yet',
  noChildBody: 'Add your baby in Family to see the plan.',
  swap: 'Swap',
  howToServe: 'How to serve',
  readMore: 'Read more',
  allergensTitle: 'Allergens this week',
  allergensAll: 'All allergens',
  noticed: 'Something you noticed',
  noticedDetail: 'Write it down, with the time and the foods',
  tomorrow: 'Tomorrow',
  tomorrowNew: (food: string): string => `New tomorrow: ${food}`,
  logOther: 'Log another meal',
  setupTitle: 'Set up your baby’s food plan',
  setupBody:
    'A few questions, about two minutes. Then you get a plan for today and the next two weeks.',
  setupCta: 'Start',
  gettingReady: 'Getting ready for solids',
  gettingReadyBody: 'Most babies start around 6 months. Here is what readiness looks like.',
  started: 'We have started',
  tooYoung:
    'Solid food starts after 4 months, and most babies start around 6. Until then, milk is everything.',
  pausedAllergens: (day: string): string =>
    `New allergens wait until ${day}, two weeks after something you noticed. Foods already in the week carry on.`,
  firmStools: (n: number, days: number): string =>
    `${n} firmer stools logged in the last ${days} days.`,
  firmStoolsOffer: 'Lean on pears, prunes and peaches for a week',
  firmStoolsOn: 'Leaning on softening foods this week',
  firmStoolsStop: 'Stop',
  viewOnly: 'You can see the plan. Logging is for parents and caregivers.',
} as const;

export const SERVE = {
  title: (meal: string): string => `${meal}: how did it go?`,
  wholeMeal: 'The whole meal',
  eachFood: 'Rate each food',
  save: 'Save',
  saved: (meal: string): string => `${meal} logged`,
  didntOffer: 'We did not offer it',
  when: 'When',
  now: 'Now',
  earlier: 'Earlier today',
  yesterday: 'Yesterday',
} as const;

export const SWAP = {
  title: 'Swap for',
  none: 'Nothing else fits this meal today. You can still serve your own food and log it.',
  done: (food: string): string => `${food} is on the plan`,
} as const;

export const PLAN = {
  title: 'Plan',
  lede: 'The next two weeks, meal by meal. Every item says why it is there.',
  changing: 'What is changing',
  today: 'Today',
  tomorrow: 'Tomorrow',
  skipDay: 'Skip this day',
  unskipDay: 'Plan this day',
  skipped: 'Skipped. Nothing piles up on the next day.',
  pin: 'Add a food to this meal',
  remove: 'Take it off this meal',
  removed: 'Taken off. The plan fills the meal again.',
  pinned: (food: string): string => `${food} added`,
  refused: 'Could not be planned',
  why: 'Why it is on the plan',
  lockedTitle: 'See the next two weeks',
  lockedBody: `Today and tomorrow are free. ${plus} lays out the next two weeks and lets you shape any day.`,
  ideasOn: 'More ideas, suggested by AI and checked by the plan’s safety rules',
  ideasAsk: 'More ideas',
  ideasAdded: 'Ideas added. Each one passed the plan’s safety rules.',
  ideasOff: 'Ideas are not switched on yet. The plan is complete without them.',
  ideasLimit: 'That is all the ideas for today.',
  ideasLater: 'No ideas right now. Try again later.',
  textureNudge:
    'Around 9 months, lumpier textures and soft finger foods are a common next step. The plan offers them now.',
  newAllergenNext: (allergen: string): string => `Next new allergen: ${allergen}`,
} as const;

export const FOODS = {
  title: 'Foods',
  search: 'Search foods',
  filters: {
    all: 'All',
    first: 'First foods',
    allergens: 'Allergens',
    iron: 'Iron-rich',
    untried: 'Not tried yet',
    tried: 'Tried',
  },
  tried: (n: number): string => (n === 1 ? 'Tried once' : `Tried ${n} times`),
  notTried: 'Not tried yet',
  notYet: (months: number): string => `From ${months} months`,
  addOwn: 'Add your own food',
  counts: (tried: number, total: number): string => `${tried} of ${total} tried`,
  empty: 'No food matches. Try another word, or add your own.',
} as const;

export const FOOD = {
  serving: (age: string): string => `How to serve at ${age}`,
  allServing: 'At other ages',
  choking: 'Choking',
  allergens: 'Contains',
  nutrients: 'Good for',
  ideas: 'Ideas',
  history: 'Your baby and this food',
  noHistory: 'Not offered yet.',
  lastTime: (when: string, response: string | null): string =>
    response === null ? `Last offered ${when}` : `Last offered ${when}: ${response}`,
  neverServe: 'Never plan this food',
  neverServeOn: 'Never planned',
  sources: 'Sources',
  custom: 'One of your own foods. Its serving advice is the general rule.',
  addToPlan: 'Add to tomorrow’s plan',
  pageTitle: 'Food',
  open: 'Open the food page',
  removeOwn: 'Remove this food',
  removed: (name: string): string => `${name} removed`,
  missing: 'Food not found',
  missingBody: 'It may have been removed on another phone.',
  added: 'On tomorrow’s plan',
} as const;

export const ADD_FOOD = {
  title: 'Add your own food',
  name: 'Name',
  namePlaceholder: 'Like Grandma’s lentil soup',
  category: 'What kind of food',
  allergens: 'Does it contain any of these?',
  allergensHint: 'Tick every one it contains. Check the label for a food you bought.',
  choking: 'How hard or round is it?',
  chokingLow: 'Soft or smooth',
  chokingMedium: 'Firm or in pieces',
  chokingHigh: 'Hard, round or sticky',
  iron: 'A good source of iron',
  save: 'Add food',
  saved: (name: string): string => `${name} added`,
  unsafe:
    'This food is never planned before 4 years, or never at all for a baby. It can still be logged.',
} as const;

export const ALLERGENS_PAGE = {
  title: 'Allergens',
  lede: 'One new allergen at a time, then kept in the week. You choose the order and the pace.',
  times: (n: number): string => (n === 1 ? 'Offered once' : `Offered ${n} times`),
  week: (n: number, target: number): string => `${n} of ${target} this week`,
  pause: 'Put on hold',
  resume: 'Take off hold',
  resumeConfirm: 'Talk to your pediatrician before offering it again. Take it off hold?',
  approve: 'My pediatrician says yes',
  approveDetail: 'From today, the plan may introduce it',
  order: 'Change the order',
  reaction: 'What a possible reaction can look like',
  nuts: 'Tree nuts',
  first: (day: string): string => `First offered ${day}`,
  modeEarly: 'Introducing early and often',
  modePediatrician: 'Introducing as your pediatrician directs',
  modeNone: 'Allergens are not planned',
} as const;

export const NOTICED = {
  title: 'Something you noticed',
  lede: 'Write down what you saw. It is kept with the time and the foods for your pediatrician.',
  signs: 'What did you see?',
  emergencyHint:
    'Trouble breathing, swelling of the face, lips or tongue, or a pale, blue or floppy baby: call for help first.',
  when: 'When did it start?',
  ongoing: 'Still going',
  foods: 'After which foods?',
  foodsHint: 'The meals logged in the hours before. Tick the ones it followed, if you know.',
  onset: 'How long after eating?',
  notes: 'In your own words',
  save: 'Save',
  saved: 'Saved. It is on the pediatrician summary and in CuddleCue too.',
  held: (names: string): string =>
    `${names} on hold. Talk to your pediatrician before offering it again.`,
  history: 'Everything you noticed',
  emergencyCard: 'Emergency card',
  fromCuddle: 'A health note from CuddleCue',
  after: (foods: string): string => `After ${foods}`,
  onsetText: (m: number): string =>
    m <= 60
      ? 'Under 2 hours after eating'
      : m <= 180
        ? '2 to 4 hours after eating'
        : 'Later after eating',
  noMeals: 'No meals logged in the hours before.',
  ago: (h: number): string => (h === 0 ? 'Now' : h === 1 ? '1 hour ago' : `${h} hours ago`),
  historyEmpty: 'Nothing written down yet.',
  onsetChoices: ['Under 2 hours', '2 to 4 hours', 'Later'] as const,
} as const;

export const EMERGENCY = {
  title: 'Call for help now',
  body: 'Trouble breathing, swelling of the face, lips or tongue, repeated vomiting, or a pale, blue or floppy baby needs emergency help.',
  call: (n: string): string => `Call ${n}`,
  choking:
    'If your baby is choking: silent, cannot cough or cry, turning blue. Call and start back blows and chest thrusts.',
  back: 'Back to the note',
  done: 'Close',
} as const;

export const MILK = {
  title: 'Milk and drinks',
  lede: 'Your log from CuddleCue, added up. The guidance beside it is published guidance for this age.',
  week: 'Last 7 days',
  bottles: (n: number): string => (n === 1 ? '1 bottle' : `${n} bottles`),
  breastfeeds: (n: number): string => (n === 1 ? '1 breastfeed' : `${n} breastfeeds`),
  perDay: (text: string): string => `${text} a day on average`,
  from: (n: number): string => `From ${n} entries logged in CuddleCue.`,
  none: 'No milk entries in the last 7 days. Bottles and breastfeeds logged in CuddleCue show here.',
  guidance: 'For this age',
  locked: `${plus} adds up the milk you log in CuddleCue, week by week, beside your baby’s meals.`,
} as const;

export const SHEETS = {
  caregiverTitle: 'Caregiver sheet',
  caregiverLede: 'One page for daycare, a nanny or grandparents, made from your plan.',
  summaryTitle: 'Pediatrician summary',
  summaryLede: 'Foods, allergens and what you noticed, in the order a doctor asks for it.',
  share: 'Share',
  print: 'Print or save as PDF',
  approved: 'Foods already eaten',
  allergensIn: 'Allergens in the week',
  allergens: 'Allergens',
  caregiverHeading: (name: string): string => `${name}: food at a glance`,
  summaryHeading: (name: string, months: number): string =>
    `${name}, ${months} months: food summary`,
  caregiverLocked: `${plus} makes a one-page food sheet for anyone who feeds your baby.`,
  summaryLocked: `${plus} puts firsts, allergens and what you noticed on one page for your pediatrician.`,
  allergensNotYet: 'Allergens not introduced yet: please do not offer',
  never: 'Never serve',
  howToServe: 'How to serve at this age',
  newFoods: 'New foods: please offer new foods at home first.',
  noAdded: 'Please, no added sugar, salt or honey.',
  firsts: 'First tried',
  noticed: 'What was noticed',
  notMedical: 'General guidance, not medical advice.',
} as const;

export const PROFILE = {
  title: 'Baby’s food profile',
  setupTitle: 'Food setup',
  next: 'Next',
  back: 'Back',
  finish: 'See the plan',
  save: 'Save',
  saved: 'Saved. The plan is updated.',
  step: (n: number, of: number): string => `Step ${n} of ${of}`,
  where: 'Where are you with solids?',
  whereOptions: {
    getting_ready: 'Not started yet',
    started: 'Just started',
    eating_many: 'Eating lots of foods',
  },
  startedOn: 'When did you start?',
  readiness: 'Can your baby do all of these?',
  readinessItems: [
    'Holds the head steady',
    'Sits with support',
    'Opens the mouth for a spoon',
    'Swallows food rather than pushing it out',
  ],
  readinessYes: 'Yes, all of them',
  readinessNotYet: 'Not yet',
  approach: 'How do you want to offer food?',
  approachOptions: {
    puree: 'Purées and mashes',
    blw: 'Finger foods (baby-led)',
    mix: 'A mix of both',
  },
  diet: 'Your family’s diet',
  dietOptions: {
    omnivore: 'Everything',
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    pescatarian: 'Pescatarian',
  },
  rules: 'Any of these?',
  ruleOptions: {
    halal: 'Halal',
    kosher: 'Kosher',
    no_beef: 'No beef',
    no_pork: 'No pork',
    no_shellfish: 'No shellfish',
    jain: 'Jain',
  },
  cuisines: 'Foods your family cooks',
  cuisinesHint: 'Optional. The plan leans toward them.',
  cuisineOptions: {
    american: 'American',
    mediterranean: 'Mediterranean',
    south_asian: 'South Asian',
    east_asian: 'East Asian',
    southeast_asian: 'Southeast Asian',
    latin_american: 'Latin American',
    middle_eastern: 'Middle Eastern',
    west_african: 'West African',
    caribbean: 'Caribbean',
    european: 'European',
  },
  allergy: 'Allergy history',
  eczema: 'Eczema',
  eczemaOptions: { none: 'None', mild_moderate: 'Mild or moderate', severe: 'Severe' },
  family: 'A parent or sibling has a food allergy',
  diagnosed: 'Food allergies your doctor has confirmed',
  diagnosedHint: 'Never planned, whatever else is set.',
  peanutTalk:
    'With severe eczema or an egg allergy, guidance says to talk to your pediatrician before peanut. The plan waits for peanut until you say they have.',
  mode: 'How do you want allergens introduced?',
  modeOptions: {
    early: 'Early and often',
    pediatrician: 'As my pediatrician directs',
    none: 'Not planned',
  },
  modeHints: {
    early: 'Current guidance recommends introducing common allergens early and often.',
    pediatrician: 'Only the allergens you mark as approved, from the day you mark them.',
    none: 'The plan offers no allergen for the first time. You can change this any time.',
  },
  introduced: 'Allergens already offered',
  introducedHint: 'Tick any your baby has had before.',
  never: 'Foods never to serve',
  neverHint: 'Dislikes or family rules. Search and tick.',
  region: 'Where you live',
  regionHint: 'Guidance differs a little by country.',
  regionOptions: { US: 'United States', UK: 'United Kingdom', CA: 'Canada', AU: 'Australia' },
  meals: 'Meals a day',
  mealsAuto: 'Follow the plan',
  holdTexture: 'Keep the texture where it is for now',
  done: 'Your first plan is ready',
} as const;

export const MORE = {
  title: 'More',
  food: 'Food',
  family: 'Family',
  app: 'The app',
  allergensDetail: 'Introduced, in the week, and what waits',
  noticedDetail: 'What you noticed, and when',
  milkDetail: 'Milk alongside meals, from CuddleCue',
  caregiverDetail: 'One page for daycare and grandparents',
  summaryDetail: 'For your next visit',
  profileTitle: 'Baby’s food profile',
  profileDetail: 'Diet, allergy history, region',
  suppliesTitle: 'Supplies',
  suppliesDetail: 'What you buy again and again',
  familyDetail: 'Members and invites',
  helpTitle: 'Help and guides',
  helpDetail: 'Published guidance, and how to reach us',
  plusTitle: plus,
  plusDetail: 'The 14-day plan, sheets and more',
} as const;

export const HELP_NIBBLE = {
  title: 'Help and guides',
  guides: 'Guides',
  contact: 'Email us',
  contactDetail: 'We read every message',
  notMedical:
    'General guidance, not medical advice. Follow your pediatrician’s advice for your baby.',
} as const;

/** A food's kind, in a parent's words. */
export const CATEGORY_LABEL = {
  vegetable: 'Vegetable',
  fruit: 'Fruit',
  grain: 'Grain',
  meat: 'Meat',
  fish: 'Fish',
  plant_protein: 'Beans and lentils',
  dairy: 'Dairy',
  egg: 'Egg',
  nut_seed: 'Nuts and seeds',
  fat: 'Oils and fats',
  herb_spice: 'Herbs and spices',
  pouch_jar: 'Pouch or jar',
  drink: 'Drink',
} as const;

/** What a food is good for, from its nutrient highlights (never an amount, spec §16.1). */
export const NUTRIENT_LABEL = {
  iron: 'Iron',
  protein: 'Protein',
  fat: 'Healthy fats',
  fiber: 'Fiber',
  calcium: 'Calcium',
} as const;
