/**
 * What the Sleep outlook card draws, from a `NapOutlook` it does not recompute.
 *
 * The engine (`naps.ts`) still decides asleep, awake, the night, a gap and a thin log.
 * This only chooses the words and which clock, so the card can be redrawn without a
 * second prediction. A field the engine left null is left off the card. No count is invented.
 */
import type { NapOutlook } from './naps';
import {
  napLength,
  napWatching,
  sleepAbout,
  sleepLogged,
  sleepRecentNights,
  sleepRecentWindows,
  sleepInWindow,
  sleepWindowFrom,
  SLEEP_ACTIVE_LEARNING,
  SLEEP_AROUND,
  SLEEP_BETWEEN,
  SLEEP_IN_WINDOW,
  SLEEP_WINDOW,
  SLEEP_BASED_ON,
  SLEEP_BEDTIME,
  SLEEP_ESTIMATE,
  SLEEP_LAST_WOKE,
  SLEEP_LEARNING,
  SLEEP_LEARNING_BODY,
  SLEEP_NAP_LENGTH,
  SLEEP_NEXT_NAP,
  SLEEP_OUTLOOK_LABEL,
  SLEEP_PASSED,
  SLEEP_RECENT_LOGS,
  SLEEP_RECENT_NAPS,
  SLEEP_STALE,
  SLEEP_STALE_MORE,
  SLEEP_STARTED,
  SLEEP_TIME_AWAKE,
  SLEEP_TYPICAL,
  SLEEP_UNAVAILABLE,
  SLEEP_USUAL_BEDTIME,
  SLEEP_USUAL_NAP,
  SLEEP_USUAL_MORNING,
  SLEEP_USUAL_WAKE,
} from './naps.copy';

export type NapFaceIcon = 'moon' | 'sun' | 'clock';

/** A row under the fold. `atMs` is a clock the card formats. `text` is already words. */
export interface NapFaceRow {
  label: string;
  text?: string;
  atMs?: number;
}

export interface NapFaceTime {
  kind: 'time';
  label: string;
  qualifier: string;
  atMs: number;
  /** A window's end (2026-10-08): the figure is `atMs`–`untilMs`. Absent for a single clock. */
  untilMs?: number;
  /** The usual morning is still the reference, and the clock has gone past it. */
  passed: boolean;
  /** A second name under the label. Morning pattern says what the clock is. */
  description: string | null;
  icon: NapFaceIcon;
  /** A dotted mark between Now and this clock. Order only, never a timeline. */
  connector: boolean;
}

export interface NapFaceNote {
  kind: 'note';
  label: string;
  message: string;
  icon: NapFaceIcon;
}

export interface NapFacePair {
  kind: 'pair';
  asleep: boolean;
  /** Moon while asleep, sun in the day, clock for a waking in the night. */
  statusIcon: NapFaceIcon;
  right: NapFaceTime | NapFaceNote;
  rows: NapFaceRow[];
  provenance: string | null;
  /** A running sleep already has its own timer. This card does not open another. */
  log: false;
}

export interface NapFaceCalm {
  kind: 'calm';
  tone: 'stale' | 'learning';
  title: string;
  /** The inset's one line under the title. */
  helper: string;
  /** Last logged wake, so the card can say when. Null when the log has none. */
  wakeAtMs: number | null;
  /** What the fold adds. The progress line while learning, the honest gap while stale. */
  expanded: string;
  rows: NapFaceRow[];
  provenance: string | null;
  log: true;
}

export type NapFace = NapFacePair | NapFaceCalm;

const noPattern = (o: NapOutlook): boolean =>
  o.awakeMs === null &&
  o.usualNapMs === null &&
  o.usualMorningMs === null &&
  o.nextAtMs === null &&
  o.wakeAtMs === null;

const basedOn = (n: number, kind: 'naps' | 'nights' | 'windows'): NapFaceRow => ({
  label: SLEEP_BASED_ON,
  text:
    n > 0
      ? kind === 'nights'
        ? sleepRecentNights(n)
        : kind === 'naps'
          ? sleepLogged(n)
          : sleepRecentWindows(n)
      : SLEEP_RECENT_LOGS,
});

function awakeRows(o: NapOutlook): NapFaceRow[] {
  const rows: NapFaceRow[] = [];
  if (o.awakeSinceMs !== null) rows.push({ label: SLEEP_LAST_WOKE, atMs: o.awakeSinceMs });
  if (o.awakeMs !== null)
    rows.push({ label: SLEEP_TIME_AWAKE, text: sleepAbout(napLength(o.awakeMs)) });
  rows.push(basedOn(o.samples, 'windows'));
  return rows;
}

function asleepFace(o: NapOutlook): NapFacePair {
  const started: NapFaceRow[] =
    o.asleepSinceMs === null ? [] : [{ label: SLEEP_STARTED, atMs: o.asleepSinceMs }];
  const night = o.nextKind === 'night';

  if (night && o.wakeAtMs !== null) {
    return {
      kind: 'pair',
      asleep: true,
      statusIcon: 'moon',
      right: {
        kind: 'time',
        // "Usual wake-up", as every morning on this card is named: "Morning wake-up" did not fit
        // half the inset on a phone and was cut to "MORNING WAKE-…" (the owner, 2026-10-06)
        label: SLEEP_USUAL_WAKE,
        qualifier: SLEEP_AROUND,
        atMs: o.wakeAtMs,
        passed: false,
        description: null,
        icon: 'sun',
        connector: true,
      },
      rows: [
        ...started,
        { label: SLEEP_USUAL_WAKE, atMs: o.usualMorningMs ?? o.wakeAtMs },
        basedOn(o.morningSamples, 'nights'),
      ],
      provenance: SLEEP_ESTIMATE,
      log: false,
    };
  }

  // A lie-in keeps the usual morning and drops the live clock (`wakeAtMs` null, morning kept).
  if (night && o.usualMorningMs !== null) {
    return {
      kind: 'pair',
      asleep: true,
      statusIcon: 'moon',
      right: {
        kind: 'time',
        label: SLEEP_USUAL_WAKE,
        qualifier: SLEEP_TYPICAL,
        atMs: o.usualMorningMs,
        passed: true,
        description: null,
        icon: 'sun',
        connector: false,
      },
      rows: [
        ...started,
        { label: SLEEP_USUAL_MORNING, atMs: o.usualMorningMs },
        basedOn(o.morningSamples, 'nights'),
      ],
      provenance: SLEEP_ESTIMATE,
      log: false,
    };
  }

  if (!night && o.wakeAtMs !== null) {
    const length = o.lastingNapMs ?? o.usualNapMs;
    const count = o.outlastedSome ? o.lastingSamples : o.napSamples;
    const rows = [...started];
    if (length !== null)
      rows.push({ label: SLEEP_NAP_LENGTH, text: sleepAbout(napLength(length)) });
    if (count > 0) rows.push({ label: SLEEP_RECENT_NAPS, text: sleepLogged(count) });
    return {
      kind: 'pair',
      asleep: true,
      statusIcon: 'moon',
      right: {
        kind: 'time',
        label: SLEEP_USUAL_WAKE,
        qualifier: SLEEP_AROUND,
        atMs: o.wakeAtMs,
        passed: false,
        description: null,
        icon: 'clock',
        connector: true,
      },
      rows,
      provenance: SLEEP_ESTIMATE,
      log: false,
    };
  }

  return {
    kind: 'pair',
    asleep: true,
    statusIcon: 'moon',
    right: {
      kind: 'note',
      label: SLEEP_OUTLOOK_LABEL,
      message: noPattern(o) ? SLEEP_ACTIVE_LEARNING : SLEEP_UNAVAILABLE,
      icon: 'clock',
    },
    rows: started,
    provenance: null,
    log: false,
  };
}

function awakeFace(o: NapOutlook): NapFace {
  if (o.gap) {
    const rows: NapFaceRow[] = [];
    if (o.nextAtMs !== null) {
      rows.push({
        label: o.nextKind === 'nap' ? SLEEP_USUAL_NAP : SLEEP_USUAL_BEDTIME,
        atMs: o.nextAtMs,
      });
      rows.push(basedOn(o.samples, 'windows'));
    }
    return {
      kind: 'calm',
      tone: 'stale',
      title: SLEEP_STALE,
      helper: '',
      wakeAtMs: o.awakeSinceMs,
      expanded: SLEEP_STALE_MORE,
      rows,
      provenance: o.nextAtMs !== null ? SLEEP_ESTIMATE : null,
      log: true,
    };
  }

  if (noPattern(o)) {
    return {
      kind: 'calm',
      tone: 'learning',
      title: SLEEP_LEARNING,
      helper: SLEEP_LEARNING_BODY,
      wakeAtMs: null,
      expanded: napWatching(o.totalSamples, o.days),
      rows: [],
      provenance: null,
      log: true,
    };
  }

  // Awake in the night: the morning is context, not a time to go back to sleep.
  if (o.nextKind === 'night' && o.nextAtMs === null && o.usualMorningMs !== null) {
    return {
      kind: 'pair',
      asleep: false,
      // THREE LINES A SIDE (2026-10-06): awake is the sun, as every other awake face; the right
      // side is the one honest name for a pattern of mornings — Usual wake-up — with Around and
      // its day on one line under it. It was "Morning pattern" over a second "Usual wake-up"
      statusIcon: 'sun',
      right: {
        kind: 'time',
        label: SLEEP_USUAL_WAKE,
        qualifier: SLEEP_AROUND,
        atMs: o.usualMorningMs,
        passed: false,
        description: null,
        icon: 'sun',
        connector: false,
      },
      rows: [
        ...(o.awakeSinceMs === null ? [] : [{ label: SLEEP_LAST_WOKE, atMs: o.awakeSinceMs }]),
        { label: SLEEP_USUAL_MORNING, atMs: o.usualMorningMs },
        basedOn(o.morningSamples, 'nights'),
      ],
      provenance: SLEEP_ESTIMATE,
      log: false,
    };
  }

  if (o.nextAtMs !== null) {
    const night = o.nextKind === 'night';
    const windowed = o.windowStartMs != null && o.windowEndMs != null;
    const windowRows: NapFaceRow[] = windowed
      ? [
          { label: SLEEP_WINDOW, text: sleepWindowFrom(o.windowSamples) },
          ...(o.windowJudged > 0
            ? [{ label: SLEEP_IN_WINDOW, text: sleepInWindow(o.windowCaught, o.windowJudged) }]
            : []),
        ]
      : [];
    return {
      kind: 'pair',
      asleep: false,
      statusIcon: 'sun',
      right: {
        kind: 'time',
        label: night ? SLEEP_BEDTIME : SLEEP_NEXT_NAP,
        qualifier: windowed ? SLEEP_BETWEEN : SLEEP_AROUND,
        atMs: windowed ? (o.windowStartMs as number) : o.nextAtMs,
        ...(windowed ? { untilMs: o.windowEndMs as number } : {}),
        passed: false,
        description: null,
        icon: 'moon',
        connector: true,
      },
      rows: [...awakeRows(o), ...windowRows],
      provenance: SLEEP_ESTIMATE,
      log: false,
    };
  }

  return {
    kind: 'pair',
    asleep: false,
    statusIcon: 'sun',
    right: {
      kind: 'note',
      label: SLEEP_OUTLOOK_LABEL,
      message: SLEEP_UNAVAILABLE,
      icon: 'clock',
    },
    rows: awakeRows(o),
    provenance: null,
    log: false,
  };
}

export function napFace(o: NapOutlook): NapFace {
  return o.state === 'asleep' ? asleepFace(o) : awakeFace(o);
}

/** Shown under a clock the usual time has already passed. */
export const napPassedLine = (passed: boolean): string | null => (passed ? SLEEP_PASSED : null);

/**
 * How the two blocks sit. A phone at 320 is too narrow for the dotted mark once the page
 * and the card have taken their padding, and large text stacks them. Width 0 is the frame
 * before layout: the design's row, so the card does not open already stacked and then jump.
 */
/*
  TWO EQUAL COLUMNS NEED ROOM (2026-10-06): each column is its 36 disc, a gap and a clock like
  "12:45 PM" at the figure's 25 points — about 142 — so the pair needs ~305 of inset before it
  stacks, and the dotted arrow between them, which takes ~50 with its gaps, comes only where both
  columns keep that much (a tablet, a wide phone). It never takes a column's room.
*/
export const NAP_STACK_BELOW = 300;
/**
 * THE ARROW IS BACK ON A PHONE (the owner, 2026-10-06: "where is the arrow in the middle?"), as a
 * single 12 pt chevron with 6 pt either side: each column still keeps the ~142 its clock needs at
 * 390, where the dots and chevron with the inset's full gaps did not.
 */
export const NAP_CONNECTOR_BELOW = 300;
export const NAP_STACK_FONT = 1.8;

/**
 * A WINDOW NEEDS A WHOLE ROW ON A PHONE (2026-10-08): "12:45–1:05 PM" is about 190 points at the
 * figure's size, against the ~95 a half column leaves its clock, and the card never cuts a time
 * short. So with a window on the right the two blocks sit one above the other below this width —
 * every phone — and side by side only where a column holds the range (a tablet).
 */
export const NAP_RANGE_STACK_BELOW = 480;

export function napArrangement(
  width: number,
  fontScale: number,
  wantsConnector: boolean,
  range = false,
): { stack: boolean; connector: boolean } {
  // before layout: the row, with no arrow — it is drawn only once the width is known to hold it;
  // a window starts stacked, as it will stay on a phone, so it never opens in a row and jumps
  if (width <= 0) return { stack: range, connector: false };
  const stack =
    width < (range ? NAP_RANGE_STACK_BELOW : NAP_STACK_BELOW) || fontScale >= NAP_STACK_FONT;
  return {
    stack,
    connector: wantsConnector && !stack && width >= NAP_CONNECTOR_BELOW,
  };
}
