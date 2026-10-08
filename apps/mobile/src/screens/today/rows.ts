/**
 * What Today's cards say, as pure functions over the read models (docs/PRODUCT_SPEC.md §3.3,
 * §3.4, §3.5, §3.7; Addendum B.1). The screen renders; this file decides the words, so every
 * sentence a parent reads on Today is a table test and none of it is arithmetic in JSX.
 *
 * Nothing here interprets. A total is a sum, a "last" is a time, a row is what was logged.
 */
import {
  AMOUNT_LABEL,
  itemsOf,
  mealLine,
  durationLabel,
  MEAL_LABEL,
  type DayBounds,
  type DiaperKind,
  DEFAULT_UNITS,
  dayText,
  lastAtFor,
  localDayKey,
  recordedMs,
  RUNNING,
  sideMinutes,
  sinceLabel,
  tempToDisplay,
  UNIT_LABEL,
  volumeParts,
  volumeShortParts,
  volumeText,
  type ActiveTimer,
  type ActivityType,
  type LastByModule,
  type ModuleId,
  type TodayActivity,
  type DiaperKinds,
  type TodayTotals,
  type UnitPrefs,
  type VolumeUnit,
  MODULE_BY_ID,
  noteLine,
} from '@nibblecue/core';
import type { IconName, StatTone } from '@nibblecue/ui';
// the node-safe entry: this file is read by node tests, and the barrel brings React Native with it
import { DIAPER_KIND_SOLID_GLYPHS } from '@nibblecue/ui/layout';
import {
  BOTTLE_KIND_LABEL,
  diaperDetailLine,
  DIAPER_LABEL,
  growthSummary,
  tempMethodWord,
} from '../../sheets/quick/copy';

/** `4 oz`, `14.25 oz`, `120 mL`, `1.25 L` — core's one writer, which the sheets use too. */
export function volume(ml: number, unit: VolumeUnit): string {
  return volumeText(ml, unit);
}

/**
 * The QUICK tile's sub-line: elapsed since THIS module's last entry, `running`, or nothing.
 *
 * EACH FEEDING TILE READS ITS OWN, AND ONLY ITS OWN (the owner, 2026-09-25, of Bottle and
 * Breastfeed both reading "39m · 23m": "keep the last activity time on it separate while treating
 * them still the same for feeding"). Both tiles had read the last feed of either kind since
 * 2026-09-19, so the Bottle tile said "23m" — a nursing session's length — under a bottle.
 *
 * THAT INCLUDES THE LINE BESIDE AN ALERT (the owner, 2026-09-27: "i updated breastfeed, but it
 * still updated bottle too last activity as well"). From 2026-09-25 the carrier tile's due or late
 * line, and the quiet "Never logged", still stood beside the last feed of EITHER kind — so a
 * breastfeed turned a Bottle tile that had never had a bottle into "Now · never logged". A tile's
 * elapsed is now its own everywhere it is drawn. Feeding is still one rhythm where the SCHEDULE
 * speaks — either kind answers the slot, and one tile carries its due or late (`quickAlertFor`) —
 * so the word is the schedule's and the time beside it is the tile's own.
 */
export function quickSince(
  type: ActivityType,
  last: LastByModule,
  running: readonly ActiveTimer[],
  nowMs: number,
): string | undefined {
  const at = lastAtFor(type, last, running);
  if (at === null) return undefined;
  if ('runningSince' in at) return RUNNING;
  return sinceLabel(at.lastAtMs, nowMs);
}

/** The diaper kinds as a tile reads them: one word, because a tile has room for one. */
export const DIAPER_TILE: Record<DiaperKind, string> = {
  WET: 'Wet',
  DIRTY: 'Dirty',
  BOTH: 'Both',
  DRY: 'Dry',
};

/**
 * The QUICK tile's "what": the last entry's one salient value — `4 oz`, `Both`, `1h 35m`,
 * `5 oz` — so the tile answers "when and what" together (the LAST grid's job, folded into
 * QUICK by the owner on 2026-09-15). Nothing while a timer of that type runs: the tile says
 * `running` and the NOW card has the numbers. Nothing for the types whose entry has no single
 * value (a note, a bath, a milestone) — the since line is the whole story there.
 */
export function quickDetail(
  type: ActivityType,
  last: LastByModule,
  running: readonly ActiveTimer[],
  unit: VolumeUnit,
): string | undefined {
  // this module's own last entry, feeding tiles included (`quickSince` says why, 2026-09-25): the
  // bottle tile describes the last bottle, and says nothing only while a bottle is being timed
  if (running.some(t => t.type === type)) return undefined;
  const row = last[type];
  if (!row) return undefined;
  switch (row.type) {
    case 'bottle':
      return volume(row.consumedMl ?? 0, unit);
    case 'diaper':
      return row.diaperKind ? DIAPER_TILE[row.diaperKind] : undefined;
    case 'sleep': {
      // the length alone: the tile's one line is `37m · 1h 35m`, and a kind word on the end
      // is what made it wrap; the kind is on the timeline row
      const end = row.endMs ?? row.startMs;
      return durationLabel(end - row.startMs);
    }
    case 'pump':
      return volume(row.totalMl ?? 0, unit);
    case 'breastfeed':
    case 'tummy': {
      // a breastfeed's minutes at the breast, as its toast said them — not the span a pause
      // stretched (`recordedMs`; the feeding audit, H1)
      const ms = recordedMs(row);
      return ms > 0 ? durationLabel(ms) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * How many of each type were logged today — the tile's `3 times today`. A tally of entries,
 * with the one rule the totals already have: a DRY check is kept in the timeline but is not a
 * diaper change (§6.4), so it does not count here either; a tile that said 6 beside a total
 * that said 5 would be the app disagreeing with itself.
 */
export function countsToday(
  rows: readonly TodayActivity[],
  bounds: DayBounds,
): Partial<Record<ActivityType, number>> {
  const out: Partial<Record<ActivityType, number>> = {};
  for (const r of rows) {
    if (r.startMs < bounds.startMs || r.startMs >= bounds.endMs) continue;
    if (r.type === 'diaper' && r.diaperKind === 'DRY') continue;
    out[r.type] = (out[r.type] ?? 0) + 1;
  }
  return out;
}

/**
 * WHAT "TODAY'S LOG" HOLDS (the owner, 2026-09-23, with a screenshot: "I haven't logged anything
 * for today, these were yesterday's log, why is it showing on today's log list?").
 *
 * The screen's rows reach back to the start of the day before yesterday — today's totals need
 * last night's sleep and the comparison needs yesterday — and the preview took the newest four of
 * THOSE, so on a day with nothing logged yet the card under "Today's log" was yesterday evening.
 * An entry belongs here when it began today, or began before midnight and ran into today: the
 * night's sleep that ended this morning, which today's totals already count by overlap. One that
 * ended at midnight exactly spent none of today here.
 */
export function loggedToday(rows: readonly TodayActivity[], bounds: DayBounds): TodayActivity[] {
  return rows.filter(r =>
    r.startMs >= bounds.startMs
      ? r.startMs < bounds.endMs
      : r.endMs !== null && r.endMs > bounds.startMs,
  );
}

/** Today's naps: sleep rows that start today and are filed as a NAP (the window's word). */
export function napsToday(rows: readonly TodayActivity[], bounds: DayBounds): number {
  return rows.filter(
    r =>
      r.type === 'sleep' &&
      r.sleepKind === 'NAP' &&
      r.startMs >= bounds.startMs &&
      r.startMs < bounds.endMs,
  ).length;
}

export interface ClockCtx {
  unit: VolumeUnit;
  /**
   * The reader's own units for the rest — weight, length and temperature (`useUnits`). A Log row
   * says a temperature or a measurement in them (the timers audit, 13); `DEFAULT_UNITS` when a
   * caller has not passed them, which is what every profile was until the columns were mirrored.
   */
  units?: UnitPrefs;
  /** `8:04 PM` in the reader's clock and the household's zone (the screen binds formatClock). */
  clock: (ms: number) => string;
  /** The household zone, so a sleep that crosses local midnight can name both days. */
  timeZone?: string;
  nowMs: number;
  /**
   * The household's word for a module (`useModuleLabels`): "Playtime" once a baby has
   * graduated from tummy time. The registry's word when absent.
   */
  moduleLabel?: (moduleId: ModuleId) => string;
}

// `lastCards` — the LAST grid's four cards, off Today since 2026-09-15, when the QUICK tiles took
// their facts — went on 2026-09-26 with the `MiniCard` that drew them. No widget ever read it.

export interface TotalCell {
  label: string;
  value: string;
  unit?: string;
  /** The module the figure comes from, so a total is the color of its own Quick tile
   *  (the owner, 2026-09-15: six white cells are boring). */
  tone: StatTone;
  accessibilityLabel: string;
  /**
   * THE DAY'S FEEDS BESIDE THE WORD — "FEEDING [15×]" — for a household that gives bottles and
   * breastfeeds (the owner, 2026-09-27: *"change them from "FEEDING" to "FEEDING (15x)" the 15x
   * indicates how many feed sessions done today"*). Every feed of either kind (`countsAsFeed`: a
   * breastfeed or a bottle of milk, never water), drawn as a Quick tile's count chip
   * (`StatTable`'s `badge`); it replaces the "15 feeds" line that stood under the figure.
   */
  badge?: number;
  /**
   * A SECOND FIGURE, ON A LINE OF ITS OWN under the first: the minutes at the breast under the
   * ounces, for a household that gives bottles and breastfeeds (`milkShows`; `StatTable`'s `also`).
   * They shared one line after a middle dot until 2026-09-27. Its `figureIcon` is the picture before
   * it, as the cell's is before the first figure.
   */
  also?: { value: string; unit?: string; tone: StatTone; figureIcon?: IconName };
  /**
   * THE MODULE'S PICTURE BEFORE THE FIGURE — on a day of bottles and breastfeeding, the bottle before
   * the ounces and breastfeeding's picture before the minutes (`FEEDING_FIGURE_ICONS`; `StatTable`'s
   * `figureIcon`). Only there: a figure alone in its cell has its word over it, and draws none.
   */
  figureIcon?: IconName;
  /**
   * THE AMOUNT IN FEWER DIGITS — `30` `oz` for `29.75` `oz`, `1.3` `L` for `1.25` `L` (core's
   * `volumeShortParts`) — which the table draws only where the exact figure would fall under its
   * floor (`StatTable`'s `short`, `statFigureLine`). On a volume figure only, never a length or a
   * count, and only where it differs; `accessibilityLabel` keeps the exact amount. The mixed day's
   * ounces carry none since they have a line of their own (2026-09-27): alone, they never need it.
   */
  short?: { value: string; unit?: string };
  /** The small line under the figure: the comparison, the count, or the diaper kinds in words. */
  note?: string;
  /**
   * THE DIAPER KINDS AS COUNTS AND GLYPHS, ON ONE LINE — `1 [drop] 2 [pile] 3 [pile][drop]` (the
   * owner, 2026-09-26), the glyphs solid and a mixed diaper's two touching (2026-09-27). Drawn
   * instead of `note`, which keeps the words for everything that reads text (`StatTable`'s
   * `noteParts`).
   */
  noteParts?: { count: string; icons: IconName[] }[];
  /** The module's glyph, in its disc (the owner's mockup of Today, 2026-09-19). */
  icon?: IconName;
  /** Which way the comparison points; absent for "same" and for the diaper kinds. */
  trend?: 'up' | 'down';
}

/**
 * WHICH FEEDING FIGURES TODAY'S REPORT CARRIES, from what the household tracks (the owner,
 * 2026-09-26: *"milk should be repalaced by breastfeeding total minute if, only breastfeeding
 * module is enable (not bottle), and both if both options are enable. still keep them in one
 * row"*):
 *
 *   bottle     — Bottles on, breastfeeding off: the ounces, as it always was.
 *   breast     — breastfeeding on, Bottles off: the minutes at the breast, and nothing in ounces.
 *   both       — both on: the ounces, and the minutes on the line under them, in the one cell,
 *                with the day's feeds in a chip beside its word — "FEEDING [15×]" over `12.5 oz`
 *                over `1h 37m` (the owner, 2026-09-27: *"feeding in today home page reeport is way
 *                too long when having both bottle and breastfeed, making the text to small"*). The
 *                two shared one line, `12 oz · 45m`, from 2026-09-26, and a heavy day's line was
 *                drawn at about 13 pt to fit a third of a phone.
 *
 * THE CELL IS CALLED "FEEDING" IN ALL THREE (the owner, 2026-09-26: *"rename milk to feeding in
 * the today page report"*). It said "Milk" over the ounces and "Breastfed" over the minutes; one
 * word over whichever figures the household's feeding gives is also the word the Quick tiles and
 * setup's "How do you feed?" already use. The figures and the counts under them are unchanged, and
 * a screen reader still hears which figure is which ("12 oz by bottle and 45 minutes
 * breastfeeding").
 *
 * A household with neither (a pumping-only or solids-only day) keeps the bottle figure it had —
 * the cheapest reversible answer to a case the owner did not name, and the figure the table has
 * always drawn. The rule reads the switches, not the day's entries, so the cell keeps its shape
 * from the first hour of the day to the last.
 *
 * THE MINUTES ARE NEVER TURNED INTO OUNCES. The owner also asked for the breastfeeds to be counted
 * as an amount "normal for the age range"; that is an estimate of a baby's intake from a norm,
 * which CLAUDE.md §2 rule 1 does not allow (docs/MILK_STASH.md §10b has the same request of
 * 2026-09-20 and the same answer). Time at the breast is shown as time.
 */
export type MilkShows = 'bottle' | 'breast' | 'both';

export function milkShows(enabled: readonly ModuleId[]): MilkShows {
  const breast = enabled.includes('breastfeed');
  if (!breast) return 'bottle';
  return enabled.includes('bottle') ? 'both' : 'breast';
}

/** The first cell's word, whichever of the three it draws (the owner, 2026-09-26; see above). */
export const FEEDING_CELL_LABEL = 'Feeding';

/**
 * THE PICTURES THE TWO FIGURES OF A MIXED DAY LEAD WITH (the owner, 2026-09-27: *"add a small icon
 * on the left size before showing the oz, and breastfeeding icon before on the left (before) how
 * many minutes (both icons same like the main icon we use)"*): each module's own, the name its Quick
 * tile draws — `MODULE_ICON[MODULE_BY_ID[id].icon]`, as `tileFor` in `TodayScreen.tsx` looks it up.
 * Named here because that map lives beside the component that draws it, which a node test cannot
 * load; `rows.test.ts` reads the map and the tiles' lookup and holds these two names to them.
 */
export const FEEDING_FIGURE_ICONS = {
  bottle: 'bottle',
  breastfeed: 'breast',
} as const satisfies Readonly<Record<'bottle' | 'breastfeed', IconName>>;

/**
 * A length as a screen reader should say it — "45 minutes", "1 hour 20 minutes", "2 hours" — and
 * never "1h 20m", which more than one reader spells out letter by letter (`spokenReadout` in the
 * design system says the same of the steppers).
 */
export function spokenMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h === 0 ? null : `${h} hour${h === 1 ? '' : 's'}`;
  const mins = rest === 0 && h > 0 ? null : `${rest} minute${rest === 1 ? '' : 's'}`;
  return [hours, mins].filter(Boolean).join(' ');
}

/** The words a screen reader says for a volume's symbol, one and many. */
const SPOKEN_VOLUME = {
  oz: ['ounce', 'ounces'],
  mL: ['milliliter', 'milliliters'],
  L: ['liter', 'liters'],
} as const;

/**
 * AN AMOUNT AS A SCREEN READER SHOULD SAY IT — "12.5 ounces", "1 ounce", "120 milliliters",
 * "1.25 liters" — the number the screen shows (core's `volumeParts`, the one writer) and its unit in
 * words, for `spokenMinutes`' reason: "oz" and "mL" are read letter by letter, or as a word they
 * are not.
 */
export function spokenVolume(ml: number, unit: VolumeUnit): string {
  const { number, unit: symbol } = volumeParts(ml, unit);
  const [one, many] = SPOKEN_VOLUME[symbol];
  return `${number} ${number === '1' ? one : many}`;
}

/** `up` past the threshold, `down` past it the other way, nothing in between. */
const trendOf = (diff: number, threshold: number): 'up' | 'down' | undefined =>
  diff >= threshold ? 'up' : diff <= -threshold ? 'down' : undefined;

/**
 * TODAY (§3.5, B.1): figures that reset at midnight — feeding, sleep, diapers; and with pump on,
 * pumped, sessions, feeds. The stash is inventory, not a daily figure, and has its own strip.
 */
/**
 * WHAT A FIGURE IS COMPARED WITH — yesterday up to this time of day (`sameTimeYesterday` in core
 * says why not the whole of yesterday), and for diapers the kinds under the count. Either half
 * may be absent: a household's first day has no yesterday, and a day with no changes has no
 * kinds to list.
 */
export interface TotalsContext {
  /** Yesterday to this time of day; null draws no comparison (Today, since 2026-09-20). */
  yesterday: TodayTotals | null;
  diapers: DiaperKinds;
  /**
   * THE COUNT LINES (the Today polish brief, 2026-09-20): "3 bottles" under the feeding, "1 nap"
   * under the sleep — what the figure is made of, in place of how it compares. Present only on
   * Today; Reports keeps the comparison and passes none.
   */
  counts?: { bottles: number; naps: number };
  /**
   * WHICH FEEDING FIGURES the first cell carries (`milkShows`): Today passes what the household
   * tracks; a caller that passes nothing gets the bottle figure alone, as the table always drew it.
   */
  milk?: MilkShows;
}

/** "3 bottles" · "1 bottle" · "no bottles" — the bottle figure's own count. */
export const bottlesNote = (n: number): string =>
  n === 0 ? 'no bottles' : `${n} bottle${n === 1 ? '' : 's'}`;
/**
 * "3 feeds" · "1 feed" · "no feeds" — under the minutes at the breast, the breastfeeds they are
 * made of. A household that does both sees every feed (`countsAsFeed`: a breastfeed or a bottle of
 * milk, never water) as the chip beside the word since 2026-09-27, and hears it in these words.
 */
export const feedsNote = (n: number): string =>
  n === 0 ? 'no feeds' : `${n} feed${n === 1 ? '' : 's'}`;
/** "1 nap" · "2 naps" · "no naps" — the sleep figure's own count, naps only (a night is not a nap). */
export const napsNote = (n: number): string =>
  n === 0 ? 'no naps' : `${n} nap${n === 1 ? '' : 's'}`;

/** The owner's own word for a BOTH diaper on this line (2026-09-18: "2 wet, 4 mixed"). */
export const DIAPER_NOTE_WORD: Readonly<Record<keyof DiaperKinds, string>> = {
  wet: 'wet',
  dirty: 'dirty',
  both: 'mixed',
};

/**
 * "3 oz more than yesterday", "2 oz less than yesterday", "same as yesterday" — arithmetic on
 * the household's own log, in the parent's own unit, never a judgement on the number. A
 * difference that rounds away in the display unit is "same": "0 oz more" is a sentence about
 * nothing.
 */
export function volumeDelta(todayMl: number, yesterdayMl: number, unit: VolumeUnit): string {
  const diff = todayMl - yesterdayMl;
  if (Math.abs(diff) < SAME_VOLUME_ML) return 'same as yesterday';
  return `${volume(Math.abs(diff), unit)} ${diff > 0 ? 'more' : 'less'} than yesterday`;
}

/**
 * Half an ounce. Under it the two days are "the same": "0.4 oz less than yesterday" is a
 * sentence about a rounding, and a bottle is not measured that finely by anyone at 3 a.m.
 */
export const SAME_VOLUME_ML = 15;

export function countDelta(today: number, yesterday: number): string {
  const diff = today - yesterday;
  if (diff === 0) return 'same as yesterday';
  return `${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than yesterday`;
}

export function durationDelta(todayMinutes: number, yesterdayMinutes: number): string {
  const diff = todayMinutes - yesterdayMinutes;
  if (Math.abs(diff) < 1) return 'same as yesterday';
  return `${durationLabel(Math.abs(diff) * 60_000)} ${diff > 0 ? 'more' : 'less'} than yesterday`;
}

/** `["1 wet", "1 dirty", "1 mixed"]` — only the kinds that happened, in the order they are logged. */
export function diaperKindsParts(k: DiaperKinds): string[] {
  return (['wet', 'dirty', 'both'] as const)
    .filter(kind => k[kind] > 0)
    .map(kind => `${k[kind]} ${DIAPER_NOTE_WORD[kind]}`);
}

/**
 * THE KINDS AS COUNTS AND PICTURES — `1 [drop] 2 [pile] 3 [pile][drop]` (the owner, 2026-09-26:
 * *"for diapers, just make it into an icon for wet, dirty, and mixed … so 1 for wet, 2 dirty, 3
 * mixed. this way description can be in oneline"*). Only the kinds that happened, in the order
 * they always came; each count followed by the glyphs of its kind. They are the SOLID glyphs
 * (`DIAPER_KIND_SOLID_GLYPHS`; the owner, 2026-09-27: *"make the icon solid with color instead, it
 * looks too similar"*), and a mixed diaper is the pile and the drop, which the table draws touching.
 * A screen reader hears the words, never the pictures.
 */
export function diaperKindGlyphs(k: DiaperKinds): { count: string; icons: IconName[] }[] {
  return (['wet', 'dirty', 'both'] as const)
    .filter(kind => k[kind] > 0)
    .map(kind => ({ count: String(k[kind]), icons: [...DIAPER_KIND_SOLID_GLYPHS[kind]] }));
}

/**
 * THE DIAPERS FIGURE AND EVERY KIND UNDER IT, ON ONE LINE. It was a list of one short line per
 * kind (the owner, 2026-09-24: "i have 1 diaper in wet, 1 in mixed, 1 in dirty… it doesnt show
 * the whole thing… we cannot just simply forget or remove"), which kept every kind whole and made
 * the cell three lines taller than its neighbors. The pictures keep every kind whole on one line
 * (the owner, 2026-09-26), and the table draws the line smaller rather than cut it.
 *
 * `note` stays the kinds in words; the spoken label joins them with commas, which every reader
 * pauses on, rather than the middle dot some read aloud as "dot".
 */
function diapersCell(count: number, kinds: DiaperKinds | null): TotalCell {
  const cell: TotalCell = {
    label: 'Diapers',
    value: String(count),
    tone: 'diaper',
    icon: 'diaper',
    accessibilityLabel: `${count} ${count === 1 ? 'diaper' : 'diapers'} today`,
  };
  const words = kinds === null ? [] : diaperKindsParts(kinds);
  if (kinds === null || words.length === 0) {
    if (count === 0) {
      const note = 'No diapers logged';
      return { ...cell, note, accessibilityLabel: `${cell.accessibilityLabel}, ${note}` };
    }
    return cell;
  }
  return {
    ...cell,
    note: words.join(' · '),
    noteParts: diaperKindGlyphs(kinds),
    accessibilityLabel: `${cell.accessibilityLabel}, ${words.join(', ')}`,
  };
}

export function totalsRows(
  totals: TodayTotals,
  unit: VolumeUnit,
  pumpOn: boolean,
  context?: TotalsContext,
): TotalCell[][] {
  const vol = (ml: number) => volume(ml, unit).split(' ');
  // a volume figure's short form, for the table to draw only where the exact one falls under its
  // floor; nothing where it would say the same (`volumeShortParts`)
  const shortOf = (ml: number): Pick<TotalCell, 'short'> => {
    const s = volumeShortParts(ml, unit);
    return s ? { short: { value: s.number, unit: s.unit } } : {};
  };
  const y = context?.yesterday ?? null;
  const counts = context?.counts ?? null;
  // the spoken form says what the screen's short line leaves implicit: by this time of day
  const spoken = (note: string | undefined) =>
    note === undefined
      ? ''
      : note.endsWith('than yesterday')
        ? `, ${note} by this time`
        : `, ${note}`;
  const withNote = (
    cell: TotalCell,
    note: string | undefined,
    trend?: 'up' | 'down' | undefined,
  ): TotalCell =>
    note === undefined
      ? cell
      : {
          ...cell,
          note,
          ...(trend ? { trend } : {}),
          accessibilityLabel: `${cell.accessibilityLabel}${spoken(note)}`,
        };
  const [milk, milkUnit] = vol(totals.milkMl);
  const shows = context?.milk ?? 'bottle';
  // the minutes at the breast, whole, as the log's rows say them (`breastfeedMinutes` in core)
  const breastMinutes = totals.breastfeedMinutes ?? 0;
  const breastLength = durationLabel(breastMinutes * 60_000);
  const bottleCell: TotalCell = {
    label: FEEDING_CELL_LABEL,
    value: milk ?? '0',
    tone: 'feed',
    icon: 'bottle',
    ...(milkUnit ? { unit: milkUnit } : {}),
    ...shortOf(totals.milkMl),
    accessibilityLabel: `${FEEDING_CELL_LABEL} today, ${volume(totals.milkMl, unit)}`,
  };
  /*
    BOTH: TWO FIGURES ON TWO LINES, AND THE DAY'S FEEDS BESIDE THE WORD (the owner, 2026-09-27:
    *"change them from "FEEDING" to "FEEDING (15x)" … then row 1, x oz (still int he same golden
    color), then row 2 the breastfeeding 1h 37m"*). The ounces in the bottle's gold, the minutes at
    the breast under them in breastfeeding's own hue, and every feed of either kind as a Quick tile's
    chip where the "15 feeds" line was — a count of what was logged, drawn only on Today's form (no
    yesterday handed in, the count lines asked for) and only when there is one, as a tile draws no
    chip for nothing.

    The ounces carry no short form: alone on their line, their picture before them, they are drawn
    at 18.6 pt or larger on every phone the app supports (`reportFit.test.ts`), so there is nothing
    to shorten. A kind with nothing yet today reads as its zero, `0 oz` or `0m`, on its own line in
    its own hue — as it did on the shared line: a true figure, never left out, so the cell keeps one
    shape from the first hour of the day to the last. A screen reader hears it all in words, the count first: "Feeding
    today, 15 feeds: 12.5 ounces by bottle and 1 hour 37 minutes breastfeeding".

    EACH FIGURE LEADS WITH ITS MODULE'S PICTURE (the owner, the same day: *"add a small icon on the
    left size before showing the oz, and breastfeeding icon before on the left (before) how many
    minutes"*): the bottle before the ounces, breastfeeding's picture before the minutes, the ones
    their Quick tiles draw (`FEEDING_FIGURE_ICONS`). Their room comes out of the cell's padding, so
    the figures are as large as they were without them (`STAT_FIGURE_BLEED`). Pictures, never words
    a reader hears: the spoken label above already says which figure is which, and is unchanged. A
    single kind's cell draws none — its one figure is what the word over it means.
  */
  const bothCell = (): TotalCell => {
    const todayForm = y === null && counts !== null;
    return withNote(
      {
        label: FEEDING_CELL_LABEL,
        value: milk ?? '0',
        tone: 'feed',
        icon: 'bottle',
        figureIcon: FEEDING_FIGURE_ICONS.bottle,
        ...(milkUnit ? { unit: milkUnit } : {}),
        also: {
          value: breastLength,
          tone: 'breastfeed',
          figureIcon: FEEDING_FIGURE_ICONS.breastfeed,
        },
        ...(todayForm && totals.feeds > 0 ? { badge: totals.feeds } : {}),
        accessibilityLabel: `${FEEDING_CELL_LABEL} today${
          todayForm ? `, ${feedsNote(totals.feeds)}:` : ','
        } ${spokenVolume(totals.milkMl, unit)} by bottle and ${spokenMinutes(
          breastMinutes,
        )} breastfeeding`,
      },
      y ? volumeDelta(totals.milkMl, y.milkMl, unit) : undefined,
      y ? trendOf(totals.milkMl - y.milkMl, SAME_VOLUME_ML) : undefined,
    );
  };
  const milkCell: TotalCell =
    shows === 'breast'
      ? // ONLY BREASTFEEDING: the minutes stand where the ounces stood, under the same word — and
        // a screen reader hears what the minutes are, which the breastfeed hue says to the eye
        withNote(
          {
            label: FEEDING_CELL_LABEL,
            value: breastLength,
            tone: 'breastfeed',
            icon: 'breast',
            accessibilityLabel: `${FEEDING_CELL_LABEL} today, ${spokenMinutes(breastMinutes)} breastfeeding`,
          },
          y
            ? durationDelta(breastMinutes, y.breastfeedMinutes ?? 0)
            : counts
              ? feedsNote(totals.breastfeeds ?? 0)
              : undefined,
          y ? trendOf(breastMinutes - (y.breastfeedMinutes ?? 0), 1) : undefined,
        )
      : shows === 'both'
        ? bothCell()
        : withNote(
            bottleCell,
            y
              ? volumeDelta(totals.milkMl, y.milkMl, unit)
              : counts
                ? // the bottles the figure is MADE of: a bottle of water is not in the milk, so it
                  // is not in "2 bottles" under it either (`milkBottles`; the feeding audit, M7)
                  bottlesNote(totals.milkBottles ?? counts.bottles)
                : undefined,
            y ? trendOf(totals.milkMl - y.milkMl, SAME_VOLUME_ML) : undefined,
          );
  const row1: TotalCell[] = [
    milkCell,
    withNote(
      {
        label: 'Sleep',
        value: durationLabel(totals.sleepMinutes * 60_000),
        tone: 'sleep',
        icon: 'sleep',
        accessibilityLabel: `Sleep today, ${spokenMinutes(totals.sleepMinutes)}`,
      },
      y
        ? durationDelta(totals.sleepMinutes, y.sleepMinutes)
        : counts
          ? napsNote(counts.naps)
          : undefined,
      y ? trendOf(totals.sleepMinutes - y.sleepMinutes, 1) : undefined,
    ),
    diapersCell(totals.diapers, context ? context.diapers : null),
  ];
  if (!pumpOn) return [row1];
  const [pumped, pumpedUnit] = vol(totals.pumpedMl);
  const row2: TotalCell[] = [
    withNote(
      {
        label: 'Pumped',
        value: pumped ?? '0',
        tone: 'pump',
        icon: 'pump',
        ...(pumpedUnit ? { unit: pumpedUnit } : {}),
        ...shortOf(totals.pumpedMl),
        accessibilityLabel: `Pumped today, ${volume(totals.pumpedMl, unit)}`,
      },
      y ? volumeDelta(totals.pumpedMl, y.pumpedMl, unit) : undefined,
      y ? trendOf(totals.pumpedMl - y.pumpedMl, SAME_VOLUME_ML) : undefined,
    ),
    withNote(
      {
        label: 'Sessions',
        value: String(totals.pumpSessions),
        tone: 'pump',
        icon: 'pump',
        accessibilityLabel: `${totals.pumpSessions} pump sessions today`,
      },
      y ? countDelta(totals.pumpSessions, y.pumpSessions) : undefined,
      y ? trendOf(totals.pumpSessions - y.pumpSessions, 1) : undefined,
    ),
    withNote(
      {
        label: 'Feeds',
        value: String(totals.feeds),
        tone: 'rose',
        icon: 'breast',
        accessibilityLabel: `${totals.feeds} feeds today`,
      },
      y ? countDelta(totals.feeds, y.feeds) : undefined,
      y ? trendOf(totals.feeds - y.feeds, 1) : undefined,
    ),
  ];
  return [row1, row2];
}

/**
 * `Strawberry 5 pcs · Banana 1 pc · Loved it` — each food with the amount as counted, then how it
 * went (docs/SOLIDS.md). A meal logged before the list reads its text the same way, and keeps
 * the older "how much of it" word it was saved with: `Sweet potato · most`.
 */
export function solidsDetail(row: TodayActivity): string {
  const line = mealLine(itemsOf({ items: row.solidsItems ?? null, food: row.food ?? null }));
  const taken = row.taken ? AMOUNT_LABEL[row.taken].toLowerCase() : null;
  return [line, taken].filter(Boolean).join(' · ');
}

/**
 * `Dirty · green · rash noted` — what was in it, the color chip as its plain word, and the rash
 * tick. The color was written by the sheet and shown nowhere (the care audit, H6); it rides on the
 * kind the way the tick does, through `diaperDetailLine`, lower case and uncolored: a record of a
 * tap, never a reading of it.
 */
export function diaperLine(row: TodayActivity): string | undefined {
  const color = row.diaperColor?.trim().toLowerCase() || undefined;
  const kind = row.diaperKind ? DIAPER_LABEL[row.diaperKind] : undefined;
  const what = [kind, color].filter((p): p is string => p !== undefined).join(' · ');
  return diaperDetailLine(what === '' ? undefined : what, row.diaperRash === true);
}

/**
 * `18m · L 10m / R 8m · left first` — how long at the breast, each side, and the side it started
 * on. The length is the RECORDED minutes (`recordedMs`), so an edited Left or Right reaches the
 * log and a paused feed reads what the toast said, not the span on the clock (the feeding audit,
 * H1; the timers audit, 12 and 13). The sides are shown only when they were recorded.
 */
export function breastfeedLine(row: TodayActivity): string | undefined {
  const ms = recordedMs(row);
  const left = row.leftSeconds ?? 0;
  const right = row.rightSeconds ?? 0;
  // whole minutes that add up to the feed's own (`sideMinutes`): `15m · L 8m / R 7m`, not `L 8m / R 8m`
  const m = sideMinutes(left, right);
  const sides =
    left + right > 0
      ? `L ${durationLabel(m.left * 60_000)} / R ${durationLabel(m.right * 60_000)}`
      : null;
  const first =
    row.firstSide === 'LEFT' ? 'left first' : row.firstSide === 'RIGHT' ? 'right first' : null;
  const line = [ms > 0 ? durationLabel(ms) : null, sides, first].filter(Boolean).join(' · ');
  return line === '' ? undefined : line;
}

/**
 * `101.1 °F · armpit` — the reading in the reader's scale, and how it was taken, in the word the
 * sheet's method row uses (`tempMethodWord`: a saved `Axillary` reads "armpit"). Never judged.
 */
export function temperatureLine(row: TodayActivity, units: UnitPrefs): string | undefined {
  if (typeof row.tempCHundredths !== 'number') return undefined;
  const reading =
    `${tempToDisplay(row.tempCHundredths, units.temp).toFixed(1)} ${UNIT_LABEL[units.temp] ?? ''}`.trim();
  const stored = row.tempMethod?.trim() || null;
  const method = stored === null ? null : tempMethodWord(stored).toLowerCase();
  return method === null ? reading : `${reading} · ${method}`;
}

export interface TimelineRow {
  id: string;
  moduleId: ModuleId;
  startLabel: string;
  endLabel?: string;
  title: string;
  detail?: string;
}

/**
 * `Oct 3` in the household zone. en-US short month and day, from the stored instant — through
 * core's kept formatter (`dayText`, the same options), not one built per row (2026-10-08, speed).
 */
const monthDay = (timeZone: string, ms: number): string => dayText(ms, timeZone);

/** One compact timeline row (§3.7): the module, what was logged, and when. */
export function timelineRow(row: TodayActivity, c: ClockCtx): TimelineRow {
  const start = c.clock(row.startMs);
  const base = { id: row.id, moduleId: row.type as ModuleId, startLabel: start };
  const ranged = row.endMs !== null && row.endMs > row.startMs;
  const end = ranged ? { endLabel: c.clock(row.endMs as number) } : {};
  const units: UnitPrefs = c.units ?? { ...DEFAULT_UNITS, volume: c.unit };
  switch (row.type) {
    case 'bottle': {
      // the amount and WHAT was in it — `4 oz · formula` (the timers audit, 13): the kind was on
      // the sheet and the edit and on no line a parent scans
      const kind = row.bottleKind ? BOTTLE_KIND_LABEL[row.bottleKind].toLowerCase() : null;
      const amount = volume(row.consumedMl ?? 0, c.unit);
      return { ...base, title: 'Bottle', detail: kind ? `${amount} · ${kind}` : amount };
    }
    case 'diaper': {
      /*
        THE RASH TICK RIDES ON THE DETAIL LINE: `Wet · rash noted` (the owner, 2026-09-19: "the
        systems also asks if there is a rash noted. but this information is not being shown or
        used anywhere. where should it be shown on for user to look back?"). It was written,
        stored and read back into the edit sheet, and no list, report or summary had ever shown
        it. Here is the row where a day is scanned; the pediatrician summary and the Reports
        diapers card carry the same fact over a longer window.

        `diaperDetailLine` is the one place the wording lives, so the log row and the entry
        sheet cannot drift apart, and it degrades: the tick alone if the detail row has not
        synced yet, nothing at all if neither is there. The color chip rides with the kind
        (`diaperLine`; the care audit, H6).
      */
      const detail = diaperLine(row);
      return { ...base, title: 'Diaper', ...(detail === undefined ? {} : { detail }) };
    }
    case 'sleep': {
      const title = row.sleepKind === 'NIGHT' ? 'Night' : 'Nap';
      const endMs = row.endMs;
      const zone = c.timeZone;
      const crossed =
        ranged &&
        endMs !== null &&
        zone !== undefined &&
        localDayKey(zone, row.startMs) !== localDayKey(zone, endMs);
      if (crossed && endMs !== null && zone !== undefined) {
        const span = `${monthDay(zone, row.startMs)} → ${monthDay(zone, endMs)}`;
        return {
          ...base,
          startLabel: c.clock(endMs),
          title,
          detail: `${durationLabel(endMs - row.startMs)} · ${span}`,
        };
      }
      return {
        ...base,
        ...end,
        title,
        ...(ranged ? { detail: durationLabel((row.endMs as number) - row.startMs) } : {}),
      };
    }
    case 'pump':
      return { ...base, ...end, title: 'Pump', detail: volume(row.totalMl ?? 0, c.unit) };
    case 'breastfeed': {
      // the minutes at the breast, each side, then WHICH SIDE it started on — facts the sheet
      // asks for and the log had nowhere to put (the same omission as solids:
      // `breastfeed_details` was not joined), now the recorded minutes rather than the span
      const detail = breastfeedLine(row);
      return {
        ...base,
        ...end,
        title: 'Breastfeed',
        ...(detail ? { detail } : {}),
      };
    }
    case 'tummy':
      return {
        ...base,
        ...end,
        // the household's word: this is the one row a household can rename (variants.ts)
        title: c.moduleLabel?.('tummy') ?? MODULE_BY_ID.tummy.label,
        ...(ranged ? { detail: durationLabel((row.endMs as number) - row.startMs) } : {}),
      };
    case 'med': {
      // the item's own name, as it was logged: one Medicine row for a vitamin and one for a
      // cream are two different facts, and the row said the same word for both. Then the amount
      // AS THE PARENT TYPED IT — "Different amount just this time" was recorded and shown nowhere
      // (the solids audit, H7). Text, repeated: never parsed, compared or added (rule 4).
      const detail = [row.medName?.trim(), row.medAmount?.trim()].filter(Boolean).join(' · ');
      return { ...base, title: 'Medicine', ...(detail ? { detail } : {}) };
    }
    case 'solids':
      /*
        WHAT THE PARENT ACTUALLY TYPED, which this row said nothing of at all: `Solids`, four
        times a day, however carefully they filled the sheet in (the owner, 2026-09-19: "user
        typed if it was breakfast/lunch/snack/dinner, the food offered, observations, but none
        of this is showing anywhere").

        The title is the MEAL, because that is the thing a parent scans a day's log for, and the
        detail is what was offered and how much of it went — `Sweet potato · most of it`. The
        observation is deliberately NOT folded in here: it is the parent's own sentence, it can
        be any length, and a timeline row is one line. It is on the entry, where the whole of it
        is readable and editable (the solids sheet, opened on the entry — `sheets/quick/edit`),
        and it is never summarised or counted.
      */
      return {
        ...base,
        title: row.meal ? MEAL_LABEL[row.meal] : 'Solids',
        ...(solidsDetail(row) ? { detail: solidsDetail(row) } : {}),
      };
    case 'water':
      return { ...base, title: 'Water' };
    case 'bath':
      return { ...base, title: 'Bath' };
    case 'milestone':
      return { ...base, title: 'Milestone' };
    case 'note':
      return { ...base, title: 'Note' };
    case 'wellbeing': {
      /*
        THE HEALTH NOTE (2026-10-08): its name, then the chips as tapped and the parent's words,
        verbatim — `Rash, swelling · on her cheeks`. Its end, when it has one, is the row's end
        like any stretch. Nothing is added to it: no color, no word about what it might mean.
      */
      const detail = noteLine(row.wellbeingSeen ?? [], row.notes);
      return {
        ...base,
        ...end,
        title: c.moduleLabel?.('wellbeing') ?? MODULE_BY_ID.wellbeing.label,
        ...(detail ? { detail } : {}),
      };
    }
    case 'temp': {
      // THE READING, in the reader's scale, with how it was taken (the solids audit, H8): the row
      // said "Temperature" and nothing else. A number and a method — no color, no word for it.
      const detail = temperatureLine(row, units);
      return { ...base, title: 'Temperature', ...(detail ? { detail } : {}) };
    }
    case 'growth': {
      // whichever of the three were measured, in the reader's units — the sheet's own summary
      const detail = growthSummary(
        {
          weightG: row.weightG ?? null,
          lengthMm: row.lengthMm ?? null,
          headMm: row.headMm ?? null,
        },
        units.weight,
        units.length,
      );
      return { ...base, title: 'Growth', ...(detail ? { detail } : {}) };
    }
  }
}

/** §3.7's footer, verbatim. */
export const TIMELINE_FOOTER =
  'The app shows what you logged and the arithmetic on it. It does not interpret feeding, sleep, growth or supply.';

/**
 * Today's newest FOUR (the Today polish brief, 2026-09-20; §3.7 said six). The log is the last
 * section on a long screen and "All ›" opens every entry; four is the glance, and two fewer rows
 * is a card that ends where a thumb can still see the footer.
 */
export const PREVIEW_ROWS = 4;

/**
 * How many rows UP NEXT builds, and how many of them are visible at a time.
 *
 * The list used to stop at three, which on a day that has more in it is the app deciding what a
 * parent is allowed to plan for (the owner, 2026-09-17: "make the next activities a vertical
 * slider to show next activities that they can scroll should they want it"). Eight is past the
 * point where any of it is still "next". The box is EXACTLY three rows — a sliver of a fourth
 * was tried as the "there is more" cue and read as a mistake (the owner: "right now it's
 * showing 3 and 1/2").
 *
 * IT IS NOT A SLIDER ANY MORE (the owner, 2026-09-20: "instead of sliders for the up next
 * window, try an arrow up and arrow button instead on the left side. The problem is you slide
 * in it accidentally when you just want to slide the page"). Two arrows step the window one row
 * at a time; `screens/today/NextList.tsx` holds the reasoning and the four scrolling boxes that
 * came before it. These two numbers are unchanged by that — what they mean is.
 */
export const NEXT_ROWS = 8;
export const NEXT_VISIBLE = 3;
