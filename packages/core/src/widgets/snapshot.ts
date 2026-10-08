/**
 * THE WIDGET SNAPSHOT — the one contract between the app and every glance surface
 * (docs/WIDGETS.md §3). The app builds one of these from its own read models, the widgets render
 * it, and nothing on a widget is computed from anything else: a widget never reads the database,
 * never does unit math and never asks the network. Pure data, JSON-safe (numbers, strings,
 * booleans, null, arrays), so it can cross the App Group boundary as a timeline entry's props.
 *
 * Version 2, rewritten 2026-09-21 against the modules the app has NOW rather than the 2026-09-13
 * spec's guesses (the owner: "don't make the widgets only from the initial doc, because we've
 * changed a lot of module. Widget is a very important thing so analyze what would be great for
 * user to know"). What a parent wants without opening the app, in the order they want it:
 *
 *   1. WHAT IS NEXT AND WHEN — the plan's next few rows, the same rows as Today's Up next and
 *      the Android shade. The one question a glance is for.
 *   2. IS THE BABY ASLEEP, and since when — or how long awake. A running sleep timer, or the
 *      end of the last sleep; the OS counts the minutes from the timestamp (§8).
 *   3. THE LAST FEED AND THE LAST DIAPER — clock time, how long ago, and what (an amount, a
 *      side, a kind), because "when did she last eat" is what the other parent asks first.
 *   4. TODAY SO FAR — feeds, milk, diapers, sleep, solids: the handover numbers.
 *   5. A RUNNING TIMER — sleep, breastfeed, pump or tummy/playtime, with STOP.
 *   6. PUMPING (the parent's own) — last, next, today, sessions; privacy-capable.
 *   7. THE STASH — what is stored and what to use first.
 *   8. QUICK LOG — one tap into Quick Entry for the household's own quick modules.
 *
 * Not on a widget, on purpose: growth and temperature (not glance questions, and a temperature
 * on a lock screen reads as a verdict), vaccines (a visit is a calendar fact the Schedule tab
 * carries), medicine amounts (rule 4: the widget shows the item's name and time from the plan,
 * never a dose it computed).
 *
 * NOTHING HERE IS A VERDICT. Every string is the household's own timestamp or count, or the
 * schedule's own words ("Due now"). `copy.test.ts` holds every sentence to the banned list.
 */
import type { ModuleId } from '../modules/module-registry';

/**
 * Version 3 (2026-10-07): `blank` replaces the free plan's `locked` shape, the stash names its
 * use-first amount alone, and the pump's today always has an amount. A timeline stored by an older
 * build fails `isSnapshot` on Android and is drawn as the blank card until the app publishes again.
 */
export const WIDGET_SNAPSHOT_VERSION = 3 as const;

/** Lock-screen privacy (docs/WIDGETS.md §7): what an always-visible surface may show. */
export type WidgetPrivacy = 'FULL' | 'LIMITED' | 'HIDDEN';
export const WIDGET_PRIVACY: readonly WidgetPrivacy[] = ['FULL', 'LIMITED', 'HIDDEN'];

/** The timers the app runs (docs/MOBILE.md §6). `tummy` is also the playtime variant. */
export type WidgetTimerKind = 'sleep' | 'breastfeed' | 'pump' | 'tummy';

/** A withheld value, the same width as what it replaces: never an empty cell. */
export const WITHHELD = '••';
export const WITHHELD_CLOCK = '––:––';

export interface WidgetNextRow {
  /** "Bottle" · "Vitamin D" · a rule's own name. */
  title: string;
  /** "1:00 PM" in the household's clock. */
  clock: string;
  /** "Tomorrow", a weekday, or null for today. */
  day: string | null;
  atMs: number;
  module: ModuleId;
  childId: string | null;
  /** True once `atMs` has passed — the schedule's "Due now"; the timeline flips it (timeline.ts). */
  due: boolean;
}

export interface WidgetLastEntry {
  atMs: number;
  clock: string;
  /** "4 oz" · "Left 12 m" · "Wet" — or null when the entry carries nothing to say. */
  detail: string | null;
  /** True when `detail` is an amount, which LIMITED privacy withholds. */
  amount: boolean;
  /**
   * Which module the row was, so a widget can draw that module's icon. Optional: a snapshot
   * written before this field existed still renders, just without the glyph.
   */
  module?: ModuleId;
}

export interface WidgetSleep {
  asleep: boolean;
  /** Asleep since, or awake since; null when the log has no sleep to count from. */
  sinceMs: number | null;
  /**
   * The same moment as the household's clock ("9:12 PM"), for a surface that cannot count:
   * Android's home-screen widgets draw no running timer, so they say "since 9:12 PM" where iOS
   * counts the minutes. Null whenever `sinceMs` is, and withheld wherever `sinceMs` is.
   */
  sinceClock: string | null;
}

export interface WidgetTimer {
  /** The session's own id: a Stop names it, so a stale link never ends a newer timer. */
  id: string;
  kind: WidgetTimerKind;
  /**
   * WHERE THE CLOCK COUNTS FROM: the moment that makes a counting clock read what the card reads
   * (a sleep's start less its pauses, a feed's open side less both sides' banked time —
   * `countFromOf`). 0 when there is no clock to draw: a feed on pause, or a privacy that hides it.
   * Never the true start, which is `startedClock`.
   */
  startedAtMs: number;
  /** "Sleeping · Ada", "Pumping" — the activity first, the baby beside it (the live timer handoff). */
  label: string;
  /** The activity alone: "Sleeping", "Breastfeeding", "Playtime". Glance's panel, where the name is above. */
  word: string;
  childId: string | null;
  /** A feed on pause: no clock, the frozen sides instead. */
  paused: boolean;
  /** A feed on pause: its frozen sides, "L 6m · R 4m"; null otherwise and where privacy hides it. */
  sides: string | null;
  /**
   * A feed with a side running, for a surface that counts: the open side counts from `…FromMs` (its
   * total so far, drawn by the OS), the other side is its fixed total, then "on left". Nothing in it
   * moves with the clock, so a running feed is not republished every minute. Null otherwise.
   */
  sideClock: WidgetSideClock | null;
  /** The card's own stop: "Woke up", "Finish", "Stop". */
  stopLabel: string;
  /** The link that stops it (the app opens on the sheet that needs input); '' where none is offered. */
  stopUrl: string;
  /** When it really started, as the household's clock ("1:40 PM"), pauses and all. */
  startedClock: string;
}

export interface WidgetSideClock {
  left: string | null;
  leftFromMs: number | null;
  right: string | null;
  rightFromMs: number | null;
  /** "on left" · "on right". */
  on: string;
}

export interface WidgetTotals {
  feeds: number;
  /** "18.5 oz" — bottles and pumped milk given; null when nothing measured. */
  milkDisplay: string | null;
  diapers: number;
  /** "3 h 40 m"; null when no sleep was logged today. */
  sleepDisplay: string | null;
  solids: number;
}

export interface WidgetPump {
  lastClock: string | null;
  lastAmount: string | null;
  nextClock: string | null;
  /** "14.25 oz", or the household's zero ("0 oz") before the first session of the day. */
  todayDisplay: string;
  sessions: number;
  running: boolean;
}

export interface WidgetStash {
  /** "60.75 oz", or the household's zero when nothing is stored. */
  totalDisplay: string;
  /**
   * The first container of the stash's own Use first order (`useSoon`, docs/MILK_STASH.md §6g), as
   * its amount: "8 oz". Null when that list is empty; the widget says "None yet".
   */
  useFirst: string | null;
  containers: number;
}

export interface WidgetQuickAction {
  module: ModuleId;
  label: string;
  /** An SF Symbol name; `WIDGET_SYMBOL` is the one map. */
  symbol: string;
  url: string;
}

export interface WidgetLinks {
  today: string;
  schedule: string;
  pump: string;
  stash: string;
  /** The plan page, for the app's own pages; no widget links to it. */
  plan: string;
}

export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  writtenAtMs: number;
  /** Past this the non-timer slots dim and say "Open the app to refresh" (§8). */
  staleAfterMs: number;
  /** Set by the timeline's last entry, never by the app. */
  stale: boolean;
  /**
   * NOTHING TO SHOW, AND NOTHING TO TAP (the owner's widget handoff, 2026-10-07): every widget is a
   * Plus feature, so without it — free, expired, revoked, signed out, or a plan the app cannot vouch
   * for — a widget draws its empty container and nothing else. A blank snapshot carries no name, no
   * entry, no link and no quick button (`blankSnapshot`), so there is nothing in the App Group for a
   * view to show by mistake. This replaced the free plan's "shape with the numbers removed".
   */
  blank: boolean;
  child: { id: string; name: string; ageLabel: string } | null;
  sleep: WidgetSleep | null;
  lastFeed: WidgetLastEntry | null;
  lastDiaper: WidgetLastEntry | null;
  next: WidgetNextRow[];
  timer: WidgetTimer | null;
  totals: WidgetTotals | null;
  pump: WidgetPump | null;
  stash: WidgetStash | null;
  quick: WidgetQuickAction[];
  links: WidgetLinks;
  /** Outbox rows not yet synced — an amber dot, never a number on the lock screen. */
  queued: number;
}

/** How many Up next rows a widget carries — the same three as the shade. */
export const WIDGET_NEXT_ROWS = 3;
/** Two hours, the spec's §3 number: a snapshot older than this is shown as stale. */
export const WIDGET_STALE_AFTER_MS = 2 * 60 * 60_000;

/** SF Symbols per module, for the widget's own icons (SF Symbols 4, iOS 16). */
export const WIDGET_SYMBOL = {
  bottle: 'drop.fill',
  breastfeed: 'heart.fill',
  pump: 'arrow.down.circle.fill',
  diaper: 'square.fill',
  sleep: 'moon.fill',
  solids: 'fork.knife',
  med: 'pills.fill',
  water: 'drop',
  growth: 'chart.line.uptrend.xyaxis',
  temp: 'thermometer.medium',
  tummy: 'figure.child',
  bath: 'drop.triangle.fill',
  note: 'note.text',
  milestone: 'star.fill',
  stash: 'snowflake',
  hydration: 'cup.and.saucer.fill',
  selfcare: 'sparkles',
  vaccine: 'cross.case.fill',
  // never on a widget (`widgetable: false`), but a `Record<ModuleId, …>` cannot leave one out
  wellbeing: 'note.text',
} as const satisfies Record<ModuleId, string>;

/** No links at all: a blank widget has nothing to open (`blank`). */
export const NO_LINKS: WidgetLinks = { today: '', schedule: '', pump: '', stash: '', plan: '' };

/**
 * THE BLANK SNAPSHOT: what a widget shows without Plus, signed out, or before the app has said
 * anything (`blank`). Not a word, a time, a name or a link in it.
 */
export function emptySnapshot(nowMs: number): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    writtenAtMs: nowMs,
    staleAfterMs: WIDGET_STALE_AFTER_MS,
    stale: false,
    blank: true,
    child: null,
    sleep: null,
    lastFeed: null,
    lastDiaper: null,
    next: [],
    timer: null,
    totals: null,
    pump: null,
    stash: null,
    quick: [],
    links: NO_LINKS,
    queued: 0,
  };
}

/** `s` with everything taken out: the same moment, nothing else (`emptySnapshot`). */
export const blankSnapshot = (s: WidgetSnapshot): WidgetSnapshot => emptySnapshot(s.writtenAtMs);
