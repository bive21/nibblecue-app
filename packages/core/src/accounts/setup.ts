/**
 * Setup — choosing what the app is (docs/SETUP.md). The four feeding cards and the "anything
 * else" groups are VIEWS over the module flags, derived on read; there is no feeding_method
 * anywhere (§5). Off means hidden, never deleted: the only write a toggle produces is one
 * module_settings row (§4), which the account providers' `setModuleEnabled` makes.
 */
import { MODULE_BY_ID, MODULES, type ModuleId } from '../modules/module-registry';
import { CARE_MODULES } from '../today/care';

export type FeedingCard = 'breast' | 'pumping' | 'bottles' | 'solids';

export interface FeedingCardDef {
  id: FeedingCard;
  label: string;
  hint: string;
  modules: ModuleId[];
}

/** SETUP.md §2, step 3. Solids never mentions an age. */
export const FEEDING_CARDS: readonly FeedingCardDef[] = [
  {
    id: 'breast',
    label: 'At the breast',
    hint: 'Nursing sessions with a per-side timer',
    modules: ['breastfeed'],
  },
  { id: 'pumping', label: 'Pumping', hint: 'Sessions and output', modules: ['pump'] },
  { id: 'bottles', label: 'Bottles', hint: 'Expressed milk or formula', modules: ['bottle'] },
  /*
   * THE STASH IS NOT A FEEDING CARD, AND THE FEEDING STEP NO LONGER DECIDES IT. It was a card for
   * a day — "Stored milk", added 2026-09-20 so a household on donor or purchased milk could reach
   * a stash without claiming to pump — and the owner moved it out the next morning (2026-09-21:
   * "at onboarding 'stored milk' should be separated to the 4 module ask").
   *
   * For one more day the Pumping card still carried `stash` in its modules and its hint, so a
   * pumping household had a whole tab switched on by a sentence, with no switch anywhere that
   * could turn it off — `extraGroups({ pumping })` dropped the row. The owner ended that on
   * 2026-09-22: *"i dont think the milk stash option toggle belong to that page, it should be on
   * the page before along with ask which module they want (if milk stash does need to be shown up
   * (logic wise that we built)"*. So the logic now decides the DEFAULT and never the visibility:
   * `suggestedExtras` suggests a stash ON for a household that pumps, the switch is drawn for
   * every household on the module step, and a pumper who keeps no stash can turn it off in one
   * tap. Which is the same answer the owner gave about every other module.
   */
  { id: 'solids', label: 'Solids', hint: 'Only once you have started', modules: ['solids'] },
];

/**
 * IS THE MILK STASH ASKED ABOUT ON THE FEEDING STEP? (the owner, 2026-09-22: *"milk stash in
 * onboarding question should not be on 'when you want it', it makes more sense to put it on the
 * how is chiara fed, as a sub-question... (only shown if pumping is not enable)"*.)
 *
 * A stash is milk that was expressed and kept, so it belongs with the question about where the
 * milk comes from rather than in a list of things a household might do this week.
 *
 * ALWAYS, SINCE 2026-09-22 — the answer is `true` and the parameter is kept only so the call
 * sites do not all have to change (the owner: *"just keep showing milk stash, no need to hide
 * when pumping is not selected. part of the reason is that it shows too many text otherwise"*).
 *
 * The version this replaces hid the row from a household that pumps, on the grounds that the two
 * answers are nearly the same — but hiding it meant the step had to EXPLAIN the stash it had
 * just turned on without asking, which is a paragraph, and the paragraph was the thing making
 * the page long. A switch that is simply there needs no sentence at all.
 */
export const stashAskedWithFeeding = (feeding: readonly FeedingCard[]): boolean => {
  void feeding;
  return true;
};

export interface ExtraGroupDef {
  id: 'every_day' | 'health' | 'when_you_want';
  label: string;
  /** Registry ids; a listed id the registry does not carry yet (supplies, WP6b) is skipped. */
  modules: string[];
  suggested: string[];
}

/**
 * SETUP.md §2, step 4.
 *
 * EVERYTHING FOR THE BABY IS SUGGESTED ON (the owner, 2026-09-16: "during the onboarding setup,
 * all activities modules should be toggled on by default, except for the modules that were not
 * selected in the how do you feed your baby section — but users can still select if they want
 * it off"). Medicine, temperature, bath and water used to default off; a household that never
 * opened step 4 therefore met an app with no way to record a fever or a vitamin, and had to
 * know that More → What you track existed to find one. Every switch here is still a switch, and the
 * screen says so. (The button that put the suggestions back went on 2026-09-27, the owner's call:
 * with every switch suggested on, it could only undo what the parent had just turned off.)
 *
 * AND SINCE 2026-09-22 THERE IS NO EXCEPTION LEFT: every switch on this step starts ON (the
 * owner, "in onboarding all modules needs to automatically be turned on, i see temperature was
 * not initially selected"). "For mom" — hydration and self-care — was the one group suggested
 * off, and it is gone from the product entirely (`RETIRED_MODULES`); growth and temperature were
 * held back as the Log row's padding and are not any more.
 *
 * The feeding modules are NOT here at all: step 3's answer decides those, which is exactly what
 * "except for the modules that were not selected" means — solids stays off until it is chosen.
 */
export const EXTRA_GROUPS: readonly ExtraGroupDef[] = [
  {
    id: 'every_day',
    label: 'Every day',
    modules: ['diaper', 'sleep'],
    suggested: ['diaper', 'sleep'],
  },
  {
    id: 'health',
    label: 'Health record',
    // the Health note joins the record it belongs to (2026-10-08), on like the rest, so a household
    // finishing setup has it in the + grid without having to find What you track first
    modules: ['vaccine', 'growth', 'med', 'temp', 'wellbeing'],
    suggested: ['vaccine', 'growth', 'med', 'temp', 'wellbeing'],
  },
  {
    id: 'when_you_want',
    label: 'When you want it',
    /*
     * `stash` IS OFFERED HERE TO EVERY HOUSEHOLD, and suggested off unless they pump. Every other
     * switch in this group is a thing any household might do this week; a milk stash is a thing a
     * particular household keeps, and defaulting a whole tab on for a family that has never
     * frozen a bottle is the clutter this step exists to prevent. A pumper gets it suggested ON
     * (`suggestedExtras`) because a pumper nearly always keeps one — but as a switch they can see
     * and turn off, not as a consequence of an answer two steps back.
     */
    modules: ['bath', 'tummy', 'supplies'],
    suggested: ['bath', 'tummy', 'supplies'],
  },
];

const isModuleId = (id: string): id is ModuleId => id in MODULE_BY_ID;

/**
 * The extra groups with only the modules the registry actually has.
 *
 * NOTHING IS HIDDEN HERE ANY MORE. This used to take `{ pumping }` and drop the milk-stash row
 * for a household that pumps, on the grounds that the Pumping card had already answered it. The
 * owner ended that on 2026-09-22 (see `FEEDING_CARDS`): a module that is on with no switch the
 * parent can find is the one shape of settings screen this app is not allowed to have. The
 * pumping answer now moves the stash's DEFAULT, in `suggestedExtras`, and every household sees
 * the switch.
 */
export function extraGroups(): {
  id: ExtraGroupDef['id'];
  label: string;
  modules: ModuleId[];
  suggested: ModuleId[];
}[] {
  return EXTRA_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    modules: g.modules.filter(isModuleId),
    suggested: g.suggested.filter(isModuleId),
  }));
}

/** Which cards are "selected", read from the flags: pumping is on iff `pump` is on, and so on. */
export function feedingFromModules(enabled: Iterable<ModuleId>): FeedingCard[] {
  const on = new Set(enabled);
  return FEEDING_CARDS.filter(c => on.has(c.modules[0] as ModuleId)).map(c => c.id);
}

export interface FeedingModules {
  modules: ModuleId[];
  /** True when Pumping without Bottles just turned `bottle` on — a suggestion, applied once. */
  bottleSuggested: boolean;
}

/**
 * The modules a feeding selection turns on. Pumping without Bottles also turns on `bottle`
 * the first time, because expressed milk has to be given somehow; after that the parent's
 * own choice stands (`alreadySuggested`).
 */
export function modulesForFeeding(
  selected: readonly FeedingCard[],
  alreadySuggested = false,
): FeedingModules {
  const on = new Set<ModuleId>();
  for (const card of FEEDING_CARDS)
    if (selected.includes(card.id)) for (const m of card.modules) on.add(m);
  let bottleSuggested = false;
  if (selected.includes('pumping') && !selected.includes('bottles') && !alreadySuggested) {
    on.add('bottle');
    bottleSuggested = true;
  }
  return { modules: MODULES.filter(m => on.has(m.id)).map(m => m.id), bottleSuggested };
}

/**
 * HOW MANY LOG TILES SETUP AIMS FOR (the owner, 2026-09-21: "try to make there are exactly 6
 * activated modules for quick log… if 1 remove, add growth, then if only 2 selected, add growth
 * and temperature, but only if 1 module selected … then you can keep it 3 row, where diaper and
 * sleep is always picked").
 *
 * The row is the feeding answer plus diaper and sleep, which are always on. Two rows of three
 * is the shape Today draws best, so the row aims for six.
 *
 * IT IS NO LONGER A REASON FOR A MODULE TO BE OFF (2026-09-22). `suggestedExtras` used to hold
 * growth and temperature back and add them only when the row was short of six, so how many ways
 * a household feeds decided whether it could record a fever — see the comment there. The two
 * padding tiles (`QUICK_ROW_PADDING`, growth and temperature) stayed named after that, and went
 * on 2026-09-27: nothing padded a row with them any more.
 */
const QUICK_ROW_TARGET = 6;

/** The extras setup suggests ON for this feeding answer: the groups' defaults, sized to the row. */
export function suggestedExtras(
  feeding: readonly FeedingCard[],
  bottleAlreadySuggested = false,
): Set<ModuleId> {
  const on = new Set<ModuleId>();
  /*
    EVERY SUGGESTED MODULE, WITH NOTHING HELD BACK (the owner, 2026-09-22: "in onboarding all
    modules needs to automatically be turned on, i see temperature was not initially selected").

    Growth and temperature used to be excluded here and added back only as ROW PADDING — on
    unless the feeding answer had already filled six tiles. A household that chose three ways of
    feeding therefore finished setup with no way to record a fever, having never seen the switch
    go by, which is the same defect the 2026-09-16 decision was made about. The row target is
    about which tiles TODAY draws; it was never a reason for a module to be off.
  */
  for (const g of extraGroups()) for (const m of g.suggested) on.add(m);
  // and the milk stash with them, for every household rather than only a pumping one — it is an
  // ordinary switch on the feeding step now, seen and turnable off like the rest
  on.add('stash');
  void feeding;
  void bottleAlreadySuggested;
  return on;
}

/** Every module the draft turns on: the feeding answer plus the extras, defaults applied. */
export function enabledModuleIds(
  feeding: readonly FeedingCard[],
  extras: Partial<Record<ModuleId, boolean>>,
  bottleAlreadySuggested = false,
): ModuleId[] {
  const on = new Set<ModuleId>(modulesForFeeding(feeding, bottleAlreadySuggested).modules);
  const suggested = suggestedExtras(feeding, bottleAlreadySuggested);
  for (const g of extraGroups()) {
    for (const m of g.modules) {
      const chosen = extras[m] ?? suggested.has(m);
      if (chosen) on.add(m);
    }
  }
  /**
   * THE MILK STASH IS RESOLVED HERE, OUTSIDE THE GROUPS, because it is no longer in one: the
   * owner moved the question onto the feeding step on 2026-09-22 (`stashAskedWithFeeding`), and
   * this loop only ever walks `extraGroups`. Left to the loop alone, a household that switched
   * the stash on during setup would have been given an app without it — the switch would have
   * written a draft value nothing ever read.
   *
   * The rule is the same one every other module gets: whatever the parent said, and otherwise
   * whatever was suggested (`suggestedExtras` suggests it on for a household that pumps).
   */
  if (extras.stash ?? suggested.has('stash')) on.add('stash');
  return MODULES.filter(m => on.has(m.id)).map(m => m.id);
}

/** The two modules pumped milk goes through: given in a bottle, or kept in the stash. */
export type PumpingPartner = 'bottles' | 'stash';

/**
 * PUMPING WITH BOTTLES OR THE MILK STASH OFF IS ASKED ABOUT, NEVER REFUSED (the owner, 2026-09-25:
 * *"On onboarding, if the pumping module is on, but bottles or milk stash is for, create a
 * confirmation warning as user click 'conitnue' that says basically are you sure you want these
 * module (bottle and/or milk stash off) while having pumping on?"*).
 *
 * The feeding step's Continue asks when this returns a list, and the list is what the question
 * names: which of the two are off, bottles first because that is the order the page draws them.
 * Null is nothing to ask — no pumping, or pumping with both on. "Keep them off" goes on with the
 * switches exactly as they stand, so this is a question and not a gate: a household that pumps
 * and wants neither has given a real answer.
 *
 * IT READS THE MODULES SETUP WILL TURN ON (`draftModules`), not the cards, so the question is
 * about exactly what the household is about to get. On the ordinary path it never fires: tapping
 * Pumping with Bottles off turns Bottles on with it (`modulesForFeeding`, once, and the page says
 * so), and the stash is on for everyone by default (`suggestedExtras`). It is asked only after the
 * parent has turned one of them off themselves.
 */
export function pumpingWithout(enabled: readonly ModuleId[]): PumpingPartner[] | null {
  if (!enabled.includes('pump')) return null;
  const off: PumpingPartner[] = [];
  if (!enabled.includes('bottle')) off.push('bottles');
  if (!enabled.includes('stash')) off.push('stash');
  return off.length === 0 ? null : off;
}

/**
 * HOW MANY LOG TILES TODAY DRAWS BY DEFAULT — and it is six, not five, because the grid is three
 * across (the owner, 2026-09-22: *"we need to keep it showing 6 rowmodule, to make it fit into a
 * 2x3 table. with diaper and sleep always shown. but if a single module is selected … then a 1x3
 * is sufficient"*).
 *
 * It was five, from a time when a sixth cell held a More tile and 5 + 1 filled two rows of three.
 * That tile was removed on 2026-09-18 and nothing moved this number, so setup suggested six
 * modules (`QUICK_ROW_TARGET`) and then both the summary preview and Today drew five of them:
 * a ragged 3 + 2, with the sixth switch the parent had just seen turned on going nowhere. Six
 * agrees with the target, fills the grid, and keeps the one-feeding-answer case at a single row
 * of three, because `suggestedExtras` does not pad a row of three at all.
 */
export const TODAY_QUICK_SLOTS = QUICK_ROW_TARGET;

/** The Quick row: the enabled quick-log modules in registry order (schema.sql's comment). */
export function quickRow(enabled: readonly ModuleId[]): ModuleId[] {
  const on = new Set(enabled);
  return MODULES.filter(m => on.has(m.id) && m.quickLog).map(m => m.id);
}

/**
 * WHAT TODAY'S LOG SECTION CAN DRAW: the Quick row minus the Care modules.
 *
 * The Care strip sits directly under Log and already carries a cell for a bath, tummy time, a
 * medicine and a temperature, with its own due state and its count for the day — so a tile
 * above it logged the same thing twice on one screen. The first pass at this only kept them out
 * of the DEFAULT five, which left them switchable in Log → Edit, and they were still there (the
 * owner, 2026-09-16: "turn off the options to show for bath, tummytime, and medicine, since
 * they are already available in the 'care' module right under it", then "i still see tummy time
 * and bath module in log edit").
 *
 * So this is the whole list the Log section and its editor work from: a Care module is not
 * offered, cannot be switched on, and cannot come back through a stored preference. It is NOT
 * gone from the app — `quickRow` is unchanged, so the "+" grid still lists all of them and the
 * Care cell opens the same sheet. Only the duplicate is gone.
 */
export function logRow(enabled: readonly ModuleId[]): ModuleId[] {
  const care = CARE_MODULES as readonly string[];
  return quickRow(enabled).filter(id => !care.includes(id));
}

/**
 * What a household did to its Quick row (the owner, 2026-09-15: which module shows first, and
 * which shows at all). Stored rather than derived, so turning a module on later never
 * reshuffles a row somebody arranged.
 */
export interface QuickRowPrefs {
  /** The ids the household placed, in the order it placed them. */
  order: ModuleId[];
  /** The ids it took OFF the row; they stay in the Quick Log sheet, never gone. */
  hidden: ModuleId[];
}

export const DEFAULT_QUICK_ROW_PREFS: QuickRowPrefs = { order: [], hidden: [] };

/**
 * The row as it is drawn: the household's own order first, then anything enabled since, in
 * registry order, minus what it hid. An id in the stored order that is no longer enabled is
 * dropped rather than remembered, so turning a module off and on again does not resurrect a
 * position nobody chose.
 */
export function quickRowWith(
  enabled: readonly ModuleId[],
  prefs: QuickRowPrefs = DEFAULT_QUICK_ROW_PREFS,
): ModuleId[] {
  const available = logRow(enabled);
  const on = new Set(available);
  const hidden = new Set(prefs.hidden);
  // the stored order is data from a device and may repeat an id or name one that is off; a row
  // that drew a module twice would log the same thing from two tiles
  const placed = new Set<ModuleId>();
  const chosen = prefs.order.filter(id => on.has(id) && !placed.has(id) && placed.add(id) !== null);
  return [...chosen, ...available.filter(id => !placed.has(id))].filter(id => !hidden.has(id));
}

/**
 * The tiles Today's LOG section draws — and the one place the 5-slot preset is a PRESET rather
 * than a ceiling.
 *
 * Before this, Today sliced the row to `TODAY_QUICK_SLOTS` after `quickRowWith` had already
 * honored the household's arrangement. Switching a sixth module on in Edit → therefore did
 * nothing at all, which is why the sheet read as module settings rather than as "what shows
 * here" (the owner, 2026-09-16: "the edit button needs to be … what you want to be shown in the
 * log menu. You should be able to have more than 6 boxes, and it would just create a new row").
 *
 * So: a household that has never touched the row gets the first `TODAY_QUICK_SLOTS` — six, two
 * full rows of three. A household that HAS arranged the row gets
 * precisely what it arranged, however many that is — `QuickRow` already wraps at three across,
 * so the seventh tile starts a fourth row rather than vanishing.
 *
 * THE CARE MODULES ARE NOT IN IT AT ALL: `logRow` is the list this works from, and it says why.
 */
export function todayQuickTiles(
  enabled: readonly ModuleId[],
  prefs: QuickRowPrefs = DEFAULT_QUICK_ROW_PREFS,
): ModuleId[] {
  const row = quickRowWith(enabled, prefs);
  const arranged = prefs.order.length > 0 || prefs.hidden.length > 0;
  return arranged ? row : row.slice(0, TODAY_QUICK_SLOTS);
}

/**
 * The preferences that mean "draw exactly these tiles, in this order".
 *
 * The editor writes through this and nothing else, so the stored shape is always a COMPLETE
 * membership: `order` is what shows, `hidden` is every other quick-loggable module. Storing a
 * partial view is what let one switch change five tiles — the sheet listed everything available
 * while Today drew the first five, so the first write promoted four modules nobody had asked for
 * (the owner, 2026-09-16: "the log is now showing every module turned on, and the toggle to
 * disable it does not work"). `todayQuickTiles(enabled, quickRowFrom(available, shown))` returns
 * `shown`, and `quickRow.test.ts` holds that round trip.
 */
export function quickRowFrom(
  available: readonly ModuleId[],
  shown: readonly ModuleId[],
  listed: readonly ModuleId[] = shown,
): QuickRowPrefs {
  const on = shown.filter(id => available.includes(id));
  // The order carries EVERY available module, not only the ones that are on, so a row can be
  // moved while it is switched off — `quickRowWith` filters `hidden` out of the drawn row at the
  // end, so an id in both is simply not drawn, and turning it back on restores it where the
  // household put it (the owner, 2026-09-16: "cannot sort"). Anything the caller did not list
  // keeps its registry position at the end.
  const seen = new Set<ModuleId>();
  const order = [...listed, ...available].filter(
    id => available.includes(id) && !seen.has(id) && seen.add(id) !== null,
  );
  return { order, hidden: available.filter(id => !on.includes(id)) };
}

export interface WhatYouTrackRow {
  module: ModuleId;
  label: string;
  enabled: boolean;
  entries: number;
  /** The sentence beside the switch; SETUP.md §3. */
  detail: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The permanent "What you track" screen, with the proof of promise 1 on every row. */
export function whatYouTrackRows(
  enabled: readonly ModuleId[],
  entries: Partial<Record<ModuleId, number>>,
): WhatYouTrackRow[] {
  const on = new Set(enabled);
  return MODULES.map(m => {
    const kept = entries[m.id] ?? 0;
    const isOn = on.has(m.id);
    const parts = [plural(kept, 'entry kept', 'entries kept')];
    if (isOn && m.quickLog) parts.push('quick log');
    const detail = isOn
      ? parts.join(' · ')
      : kept > 0
        ? `${plural(kept, 'entry kept', 'entries kept')}, back if you turn this on`
        : 'Nothing logged yet';
    return { module: m.id, label: m.label, enabled: isOn, entries: kept, detail };
  });
}
