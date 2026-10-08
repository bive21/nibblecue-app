/**
 * THE module registry. One declaration per trackable activity.
 * Adding a module must not require editing navigation, quick log, widgets or reports:
 * every one of those surfaces is generated from this list plus the household's
 * `module_settings` row (enabled + sort_order overrides).
 *
 * Keep this file in `packages/domain/src/modules.ts` and import it from mobile, admin
 * and edge functions. Color keys resolve through `packages/ui/src/theme/design-tokens.json`.
 */

export type ModuleId =
  | 'bottle' | 'breastfeed' | 'pump' | 'diaper' | 'sleep' | 'solids' | 'med'
  | 'water' | 'growth' | 'temp' | 'tummy' | 'bath'
  /**
   * RETIRED MODULES. Neither `note` (the owner, 2026-09-16: "the Note module is not very useful,
   * we can remove this completely") nor `milestone` (the owner, same day: "remove milestones
   * module completely") is a module any more. The TYPE keeps both, because the database's
   * `activity_type` enum does and a household that logged one before this build must still be
   * able to read it: the timeline renders the existing row, the export carries it, and nothing
   * deletes it — CLAUDE.md §2 rule 7, "never lose a log". What is gone is the way to make a NEW
   * one: the registry entry below, the Quick Log tile, the sheet, the onboarding offer and the
   * deep link. Dropping the enum value instead would need a migration that rewrites rows, which
   * §7 forbids without a reversible path.
   */
  | 'note' | 'milestone'
  | 'stash' | 'hydration' | 'selfcare' | 'vaccine'
  /**
   * THE HEALTH NOTE (the owner, 2026-10-08, from a parent's feedback: "we need something to log
   * any irregularities … so that it can be looked back what happened before that … and most
   * importantly the entries will be shown in pediatricians sheet"). Something a parent noticed, in
   * their own words, with chips for what was SEEN, a start and an optional end. The id is not
   * `note`: that value is retired with a different meaning (DATABASE.md §3 forbids reusing one),
   * and `wellbeing` stays true if the label falls back to "Wellbeing note" (`label` below is the
   * one place the name lives; docs/HEALTH_NOTES.md).
   */
  | 'wellbeing';

export type ModuleGroup = 'baby' | 'mom';

/** How the activity is captured. Drives which Quick Entry sheet is rendered. */
export type CaptureKind =
  | 'amount'      // bottle, water: stepper + type
  | 'timerSides'  // breastfeed: left/right timers
  | 'timerOutput' // pump: timer then left/right output
  | 'oneTap'      // diaper: four one-tap buttons
  | 'timer'       // sleep, tummy: start/stop
  | 'choice'      // solids: meal + food + how much
  | 'text'        // med, selfcare (and the retired note and milestone rows)
  | 'measure'     // growth, temp
  | 'inventory'   // stash (not an activity; opens its own screen)
  | 'schedule';   // vaccine: a published schedule the parent records against

export interface ModuleDef {
  id: ModuleId;
  label: string;              // user-facing; localise via i18n key `module.<id>`
  icon: string;               // icon name in the shared icon set
  group: ModuleGroup;
  capture: CaptureKind;
  defaultEnabled: boolean;
  /**
   * Eligible for the Quick Log sheet and the "+" grid — and therefore, for a module with no
   * screen of its own, WHETHER THERE IS ANY WAY IN AT ALL. Growth and Mom self-care were each
   * `false` with no screen behind them: enabled in Setup, listed in
   * "What you track", counted in the totals, and reachable from nowhere (the owner,
   * 2026-09-15: "i set growth to be enabled, but i dont see it anywhere"). `moduleReach.test
   * .ts` now fails the build for any module in that position, which is the only reason this
   * cannot happen again.
   */
  quickLog: boolean;
  schedulable: boolean;       // may appear in a routine phase as a schedule rule
  remindable: boolean;        // may raise reminders
  widgetable: boolean;        // may appear on a widget
  reportable: boolean;        // has a report section
  color: string;              // token key in design-tokens.color.*
  sortOrder: number;
  /** Household-level (not per child). Pumping and stash belong to a person, not a baby. */
  householdScoped?: boolean;
  /** May be marked private to its owner (mom privacy). */
  privacyCapable?: boolean;
  /** Supports a CADENCE schedule rule: a rhythm in days, matched by day (see SCHEDULE_LOGIC.md §5b). */
  cadenceCapable?: boolean;
  /**
   * LOGGED FROM THE "+" GRID, AND NEVER A QUICK TILE (the owner, 2026-10-08, of the Health note:
   * "it does not need to be shown in the quick log module, but just in the + button on top of the
   * menu bar to log everything"). `quickLog` stays false, so Today's Log tiles, the widget, the
   * Quick row's editor and the server's `quick_enabled` seed never offer it; this flag alone puts
   * it in the + grid (`quickLogOrder`), which is its way in (`moduleReach.test.ts`).
   */
  fromPlus?: boolean;
}

export const MODULES: ModuleDef[] = [
  { id:'bottle',     label:'Bottle',        icon:'bottle',  group:'baby', capture:'amount',      defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:true,  reportable:true,  color:'feed', sortOrder:10 },
  { id:'breastfeed', label:'Breastfeed',    icon:'breast',  group:'baby', capture:'timerSides',  defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:true,  reportable:true,  color:'breastfeed', sortOrder:20 },
  { id:'pump',       label:'Pump',          icon:'pump',    group:'mom',  capture:'timerOutput', defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:true,  reportable:true,  color:'pump',   sortOrder:30, householdScoped:true, privacyCapable:true },
  { id:'diaper',     label:'Diaper',        icon:'diaper',  group:'baby', capture:'oneTap',      defaultEnabled:true,  quickLog:true,  schedulable:false, remindable:false, widgetable:true,  reportable:true,  color:'diaper', sortOrder:40 },
  { id:'sleep',      label:'Sleep',         icon:'sleep',   group:'baby', capture:'timer',       defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:true,  reportable:true,  color:'sleep',  sortOrder:50 },
  { id:'solids',     label:'Solids',        icon:'solids',  group:'baby', capture:'choice',      defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:true,  reportable:true,  color:'solids',  sortOrder:60 },
  { id:'med',        label:'Medicine',      icon:'med',     group:'baby', capture:'text',        defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:false, reportable:true,  color:'med',   sortOrder:70 },
  { id:'growth',     label:'Growth',        icon:'growth',  group:'baby', capture:'measure',     defaultEnabled:true,  quickLog:true,  schedulable:false, remindable:false, widgetable:false, reportable:true,  color:'sleep',  sortOrder:90 },
  { id:'temp',       label:'Temperature',   icon:'temp',    group:'baby', capture:'measure',     defaultEnabled:true,  quickLog:true,  schedulable:false, remindable:false, widgetable:false, reportable:true,  color:'health',   sortOrder:100 },
  { id:'tummy',      label:'Tummy time',    icon:'tummy',   group:'baby', capture:'timer',       defaultEnabled:true,  quickLog:true,  schedulable:false, remindable:false, widgetable:false, reportable:true,  color:'tummy',  sortOrder:110 },
  { id:'bath',       label:'Bath',          icon:'bath',    group:'baby', capture:'oneTap',      defaultEnabled:true,  quickLog:true,  schedulable:true,  remindable:true,  widgetable:false, reportable:true,  color:'bath',   sortOrder:120, cadenceCapable:true },
  { id:'vaccine',    label:'Vaccines',      icon:'shield',  group:'baby', capture:'schedule',    defaultEnabled:true,  quickLog:false, schedulable:false, remindable:true,  widgetable:false, reportable:false, color:'cyan',     sortOrder:125 },
  { id:'wellbeing',  label:'Health note',   icon:'note',    group:'baby', capture:'text',        defaultEnabled:true,  quickLog:false, schedulable:false, remindable:false, widgetable:false, reportable:false, color:'rose',     sortOrder:130, fromPlus:true },
  { id:'stash',      label:'Milk stash',    icon:'box',     group:'mom',  capture:'inventory',   defaultEnabled:true,  quickLog:false, schedulable:false, remindable:true,  widgetable:true,  reportable:true,  color:'feed',   sortOrder:150, householdScoped:true }
];

/**
 * The retired modules' definitions — OUT of `MODULES`, so nothing offers, counts, seeds or
 * lists them, and IN `MODULE_BY_ID` below, so a row logged before they were retired still has
 * a label, a glyph and a color to render with.
 *
 * MOM HYDRATION AND MOM SELF-CARE JOINED THEM ON 2026-09-22 (the owner: "you can remove the mom
 * hydration module, and mom self care from the whole app for now (including mentioned in
 * onboarding)"). They were the one group setup suggested OFF, which made "For mom" a whole
 * heading, two switches and a paragraph of explanation for two modules nobody had asked for —
 * on the step the same message asked to make shorter. "For now" is the owner's own word and is
 * why this is a retirement and not a deletion: the rows stay here, a household that logged one
 * still renders it, and bringing them back is moving two lines up.
 *
 * Without this the household's own history crashes the screen it is drawn on: `MODULE_BY_ID`
 * is typed `Record<ModuleId, ModuleDef>`, the timeline does `MODULE_BY_ID[row.type].icon`, and
 * a key that is only in the TYPE is `undefined` at run time — a TypeError TypeScript cannot
 * see. `defaultEnabled` and `quickLog` are `false` because there is no way to make a new one.
 */
export const RETIRED_MODULES: ModuleDef[] = [
  { id:'water',      label:'Water',         icon:'water',   group:'baby', capture:'amount',      defaultEnabled:false, quickLog:false, schedulable:false, remindable:false, widgetable:false, reportable:false, color:'cyan',   sortOrder:80 },
  { id:'hydration',  label:'Mom hydration', icon:'water',   group:'mom',  capture:'amount',      defaultEnabled:false, quickLog:false, schedulable:false, remindable:false, widgetable:false, reportable:false, color:'cyan',   sortOrder:160, householdScoped:true, privacyCapable:true },
  { id:'selfcare',   label:'Mom self-care', icon:'heart',   group:'mom',  capture:'text',        defaultEnabled:false, quickLog:false, schedulable:false, remindable:false, widgetable:false, reportable:false, color:'rose',   sortOrder:170, householdScoped:true, privacyCapable:true },
  { id:'milestone',  label:'Milestones',    icon:'star',    group:'baby', capture:'text',        defaultEnabled:false, quickLog:false, schedulable:false, remindable:false, widgetable:false, reportable:false, color:'feed',   sortOrder:130 },
  { id:'note',       label:'Note',          icon:'note',    group:'baby', capture:'text',        defaultEnabled:false, quickLog:false, schedulable:false, remindable:false, widgetable:false, reportable:false, color:'diaper', sortOrder:140 }
];

/** Every id the TYPE carries, live or retired — a lookup must never return `undefined`. */
export const MODULE_BY_ID: Record<ModuleId, ModuleDef> =
  [...MODULES, ...RETIRED_MODULES]
    .reduce((acc, m) => { acc[m.id] = m; return acc; }, {} as Record<ModuleId, ModuleDef>);

/**
 * WHETHER A KIND MAY RAISE A REMINDER: `remindable`, the registry's word, and the one question
 * every road a reminder takes to a phone asks of it (2026-09-28) — the phone's own plan (a slot's
 * reminder, a heads-up, the "You're on" alert) and the server's push (`supabase/functions/_shared/
 * push.ts`).
 *
 * WHY IT HAD TO BE ASKED. Diaper, growth, temperature and tummy time are `remindable: false`, and
 * the Reminders page draws no row for them because of it, so nothing a parent can reach turns
 * their reminders down, quiets them or gives them quiet hours. Nothing on the ringing side read
 * the flag, though: setup writes a diaper rhythm with its reminder on, so a new household's phones
 * rang "Diaper due" every few hours through the night, both parents' phones, with sound, on an
 * Android channel the app never created (the phone's catch-all took it, at high importance).
 *
 * A SLOT IS NOT A REMINDER. A kind that is not remindable keeps every slot the Schedule, Today, Up
 * next and the shade draw for it; only nothing rings. A kind the registry does not know rings
 * nothing either — the registry is the list, and a reminder nobody can turn down is the defect.
 */
export function isRemindable(activity: string): boolean {
  return MODULE_BY_ID[activity as ModuleId]?.remindable === true;
}

/** Modules a household sees, in its own order. Disabling hides UI only — history stays. */
export function enabledModules(
  settings: Array<{ module_id: ModuleId; enabled: boolean; sort_order: number | null }>
): ModuleDef[] {
  const byId = new Map(settings.map(s => [s.module_id, s]));
  return MODULES
    .filter(m => byId.get(m.id)?.enabled ?? m.defaultEnabled)
    .sort((a, b) => (byId.get(a.id)?.sort_order ?? a.sortOrder) - (byId.get(b.id)?.sort_order ?? b.sortOrder));
}
