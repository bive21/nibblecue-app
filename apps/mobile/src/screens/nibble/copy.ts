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

/** The two states before a plan exists: too young, and getting ready (`NotStarted.tsx`). */
export const NOT_STARTED = {
  tooYoungTitle: 'Not time for solids yet',
  tooYoung: (name: string, from4: string, around6: string): string =>
    `${name} can start solids from 4 months, on ${from4}. Most babies start around 6 months, on ${around6}. Until then, milk is everything.`,
  tooYoungSetup: 'Food setup opens from 4 months. The food library is open to browse now.',
  readyTitle: 'Getting ready for solids',
  signsTitle: 'Signs you have seen',
  readyLede: 'Tick each sign when you see it. Nothing here holds the plan back.',
  allSigns: 'You have seen all four signs. Pick a day to start?',
  countdown: (name: string, day: string, weeks: number): string =>
    weeks <= 0
      ? `${name} turns 6 months on ${day}.`
      : weeks === 1
        ? `${name} turns 6 months on ${day}, in about a week.`
        : `${name} turns 6 months on ${day}, in about ${weeks} weeks.`,
  startsOn: (name: string, day: string, days: number): string =>
    days === 1
      ? `${name}’s first food day is tomorrow, ${day}.`
      : `${name}’s first food day is ${day}, in ${days} days.`,
  previewIf: 'If you start today, the first days look like this',
  previewOn: 'The first days',
  shopFirst: 'Add the first days’ foods to the grocery list',
  shopDone: 'On your grocery list',
  getReadyTitle: 'Things to have ready',
  getReady: [
    'A high chair or a seat where your baby sits upright',
    'A small soft spoon',
    'An open cup or a straw cup',
    'A bib or two',
  ],
  getReadyAdd: 'Add these to the grocery list',
  learnTitle: 'Before day one',
  tongueNote:
    'Pushing food back out with the tongue is common on the first tries. It usually fades within a few days of practice.',
  readyCta: 'Start the plan today',
  chooseDay: 'Choose a day',
  startedCta: 'We have already started',
  startedWhen: 'When was the first taste?',
  startedSave: 'Save the first taste',
  notAll:
    'Most babies show all four around 6 months. You can start the plan any time you feel ready.',
  firstDayTitle: (name: string): string => `${name}’s first food day`,
  firstDayChecks: [
    'Your baby sits upright, in a high chair if you have one',
    'You stay within arm’s reach',
    'Start with a teaspoon or two. Your baby decides how much',
  ],
  firstTries:
    'On the first tries, watch whether the food goes back and is swallowed. If most of it comes back out, that is common at first. Try a thinner mash, or try again in a week or two.',
  dayOf: (day: number, tried: number): string =>
    `Day ${day} of solids. ${tried === 1 ? '1 food tried' : `${tried} foods tried`}.`,
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

/**
 * THE FOOD SETUP (docs/research/MARKET_AND_SETUP.md §2.4): the baby's name in every title, a
 * question only where its answer changes the plan, and nothing a parent cannot know before the
 * first spoon. `n` is the baby's name, or "your baby" when there is none yet.
 */
export const SETUP = {
  title: 'Food setup',
  next: 'Next',
  back: 'Back',
  finish: 'Make the plan',
  step: (n: number, of: number): string => `Step ${n} of ${of}`,
  introTitle: (n: string): string => `Let’s plan ${n}’s first foods`,
  introBody: (n: string, age: string, steps: number): string =>
    `${n} is ${age}. ${steps} quick questions, then you see ${n}’s plan. You can change any answer later.`,
  introLearn: 'Before you start, it helps to know two things.',
  introLearnItems: [
    'Gagging is common and noisy: your baby coughs, the tongue pushes forward, and the food comes back up. Choking is silent. Stay within arm’s reach at every meal.',
    'A possible reaction can be hives, vomiting or swelling soon after a new food. Trouble breathing or swelling of the face, lips or tongue means call your emergency number.',
  ],
  start: 'Start',
  tooYoungTitle: 'Solid food is for later',
  tooYoungBody: (n: string, age: string, from4: string, around6: string): string =>
    `${n} is ${age}. Babies can start solids from 4 months, on ${from4} for ${n}. Most start around 6 months, on ${around6}. Until then, milk is everything. Come back to this setup any time from ${from4}.`,
  tooYoungDone: 'Back to Today',
  whereTitle: (n: string): string => `Has ${n} had any solid food yet?`,
  whereOptions: {
    not_yet: 'Not yet',
    started: 'Yes, we have just started',
    lots: (n: string): string => `Yes, ${n} eats lots of foods`,
  },
  firstTaste: (n: string): string => `When was ${n}’s first taste?`,
  firstTasteHint: 'Roughly is fine.',
  fromLog: (meals: number, since: string): string =>
    meals === 1
      ? `We found 1 meal logged in CuddleCue on ${since}.`
      : `We found ${meals} meals logged in CuddleCue since ${since}.`,
  signsTitle: (n: string): string => `Which of these have you seen ${n} do?`,
  signsHint:
    'These are the signs published guidance looks for. Tick what you have seen so far. None yet is fine.',
  signs: {
    head: 'Holds the head steady and upright',
    sits: 'Sits up with a little help, without slumping over',
    mouthing: 'Grabs toys and brings them to the mouth',
    interest: 'Watches you eat, or reaches for your food',
  },
  allSigns: 'You have seen all four signs.',
  whenTitle: 'When would you like to start?',
  whenOptions: {
    today: 'Today',
    day: 'On a day I choose',
    signs: 'When I see the signs',
  },
  whenDay: 'Start on',
  whenSignsHint: 'The plan waits. Today shows the signs to watch for, and you start with one tap.',
  beforeSix: (n: string, six: string): string =>
    `Most babies start around 6 months. ${n} turns 6 months on ${six}. If you plan to start before then, check with your pediatrician first. Until 6 months the plan offers smooth purées of single foods, and allergens start from 6 months.`,
  beforeSixUK: (n: string, six: string): string =>
    `The NHS suggests starting around 6 months. ${n} turns 6 months on ${six}. If you plan to start before then, check with your health visitor or doctor first. Until 6 months the plan offers smooth purées of single foods, and allergens start from 6 months.`,
  approachTitle: (n: string): string => `How would you like to offer food to ${n}?`,
  approachOptions: {
    puree: 'On a spoon: purées and mashes',
    blw: (n: string): string => `Finger foods ${n} picks up`,
    mix: 'Some of each',
  },
  approachHints: {
    puree: 'Sweet potato comes mashed, on a preloaded spoon.',
    blw: 'Sweet potato comes as soft wedges the size of your finger.',
    mix: 'Some days mashed, some days soft wedges.',
  },
  textureTitle: (n: string): string => `What does ${n} eat most easily right now?`,
  textureOptions: {
    smooth: 'Smooth purées',
    lumps: 'Mashed, with soft lumps',
    pieces: 'Soft pieces and finger foods',
    family: 'Most of what we eat, cut up',
  },
  familyTitle: 'What does your family eat?',
  rulesTitle: 'Any of these?',
  cuisines: 'Add the foods you cook at home',
  cuisinesHint: 'Optional. The plan leans toward them.',
  veganLine: (n: string): string =>
    `Iron in ${n}’s plan comes from beans, lentils, tofu and fortified cereal, with a vitamin C food beside it.`,
  vegetarianLine: (n: string): string =>
    `No meat or fish in ${n}’s plan. Iron comes from eggs, beans, lentils and fortified cereal.`,
  triedTitle: (n: string): string => `Which foods has ${n} had?`,
  triedHint: (n: string): string => `Tap the ones ${n} has tried. Skip any you are not sure of.`,
  triedFromLog: 'From your log',
  triedFruitVeg: 'Tick all the fruits and vegetables',
  triedMore: 'Search for more',
  triedCount: (k: number): string => (k === 1 ? '1 food ticked' : `${k} foods ticked`),
  triedPick: 'Add a food',
  doctorTitle: (n: string): string => `Has a doctor told you ${n} has a food allergy?`,
  doctorOptions: { no: 'No', yes: 'Yes' },
  doctorWhich: 'Which foods?',
  doctorHint: 'These are never planned, whatever else is set.',
  eczemaTitle: (n: string): string => `Does ${n} have eczema?`,
  eczemaOptions: {
    none: 'No',
    mild: 'Yes, mild, or it comes and goes',
    severe: 'Yes, a lot, and it keeps coming back even with prescription creams',
    unsure: 'Not sure',
  },
  eczemaUnsure: 'You can change this after your next visit.',
  peanutWaits: (n: string): string =>
    `With eczema like this, or an egg allergy, guidance says to talk to your pediatrician before peanut. Peanut waits in ${n}’s plan until you tell us they said yes. The other allergens follow the plan.`,
  introducedTitle: (n: string): string => `Which of these has ${n} had?`,
  introducedHint: 'Ticked from the foods above: yogurt counts as milk, pasta as wheat.',
  modeTitle: 'How would you like to introduce allergens?',
  modeOptions: {
    early: 'One at a time, starting soon',
    pediatrician: 'Only the ones my pediatrician says yes to',
    none: 'Not now',
  },
  modeHints: {
    early: 'Current guidance is to introduce common allergens early and often.',
    pediatrician: 'You mark each one as approved, from that day.',
    none: 'No allergen is offered for the first time. You can change this any time.',
  },
  previewTitle: (n: string): string => `${n}’s plan so far`,
  previewIf: (day: string): string => `If you start ${day}`,
  previewEmpty: 'Answer the questions above and the first days appear here.',
  previewDay: (k: number, day: string): string => `Day ${k}, ${day}`,
  summaryTitle: (n: string): string => `${n}’s plan is ready`,
  summaryWaitsTitle: (n: string): string => `${n}’s plan is ready when you are`,
  startsToday: (day: string, n: string, age: string): string =>
    `Starts today, ${day}. ${n} is ${age}.`,
  startsOn: (day: string, n: string, age: string): string => `Starts ${day}. ${n} is ${age} today.`,
  startedOn: (k: number, n: string, age: string): string =>
    k === 1 ? `Day 1 of solids. ${n} is ${age}.` : `Day ${k} of solids. ${n} is ${age}.`,
  waits: (n: string, six: string): string =>
    `The plan waits for the signs. ${n} turns 6 months on ${six}. When you are ready, tap Start on Today and the first week appears.`,
  firstWeek: 'First week',
  firstAllergen: (a: string): string => `First ${a}`,
  newFood: 'New',
  allergensTitle: 'Allergens',
  allergenStarts: (a: string, day: string): string => `${a} starts ${day}.`,
  allergenOrder: (list: string): string =>
    `Then one new allergen every few days, in this order: ${list}. Each one stays in the week, about twice a week, once it is started.`,
  allergensNone:
    'No allergen is offered for the first time. You can change this on the food profile.',
  allergensAsk:
    'Allergens are offered only once you mark them as approved by your pediatrician, on the Allergens page.',
  peanutLine: 'Peanut waits until you tell us your pediatrician said yes.',
  becauseTitle: 'Because you told us',
  because: {
    puree: 'Spoon: foods come as purées and mashes.',
    blw: 'Finger foods: foods come as soft wedges and pieces.',
    mix: 'Finger foods and spoon: foods alternate between soft wedges and mashes.',
    smooth: 'Smooth purées for now. The plan suggests a little more texture when it fits.',
    vegetarian: 'Vegetarian: no meat or fish in the plan.',
    vegan: 'Vegan: no meat, fish, eggs or dairy in the plan.',
    pescatarian: 'Pescatarian: no meat in the plan.',
    tried: (k: number, n: string): string =>
      k === 1
        ? `${n} has tried 1 food: the plan will not offer it as new.`
        : `${n} has tried ${k} foods: the plan will not offer them as new.`,
  },
  buyTitle: (k: number): string =>
    k === 1 ? 'For the first days, 1 thing to buy' : `For the first days, ${k} things to buy`,
  buyAdd: 'Add to grocery list',
  buyDone: 'On your grocery list',
  region: (r: string): string => `Using ${r} guidance.`,
  regionChange: 'Change',
  seeToday: 'See today',
  saved: 'Your food plan is ready',
  savedWaits: 'Saved. The plan waits for the signs.',
} as const;

export const PROFILE = {
  title: 'Baby’s food profile',
  save: 'Save',
  saved: 'Saved. The plan is updated.',
  where: 'Where are you with solids?',
  whereOptions: {
    getting_ready: 'Not started yet',
    started: 'Just started',
    eating_many: 'Eating lots of foods',
  },
  startedOn: 'When did you start?',
  signs: 'Signs you have seen',
  signsHint: 'Each can be seen before the first spoon. They never hold the plan back on their own.',
  tried: 'Foods tried before the app',
  triedHint: 'The plan never offers these as new. Tap one to take it off.',
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

/** The grocery list's card of the meal plan's foods (`FromPlanCard.tsx`). */
export const GROCERY = {
  title: 'From your meal plan',
  lede: (days: number): string =>
    days === 1 ? 'The foods on today’s plan.' : `The foods on the plan for the next ${days} days.`,
  addAll: 'Add all to the list',
  addOne: (name: string): string => `${name}, add to the list`,
  added: (n: number): string =>
    n === 1 ? '1 food added to the list' : `${n} foods added to the list`,
  onList: 'On the list',
  forDay: (day: string): string => `For ${day}`,
  meals: (n: number): string => (n === 1 ? 'In 1 meal' : `In ${n} meals`),
  allOn: 'Everything on the plan is on the list.',
  more: `See the next two weeks with ${plus}`,
  aisle: {
    produce: 'Fruit and vegetables',
    grains: 'Bread, grains and cereal',
    protein: 'Meat and fish',
    dairy: 'Dairy and eggs',
    pantry: 'Pantry',
    drinks: 'Drinks',
  },
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
