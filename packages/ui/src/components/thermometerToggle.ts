/**
 * The temperature sheet's scale as a thermometer, in numbers: a glass thermometer printed with
 * both scales, the silver column that stands at the sheet's reading, the small tag at its tip that
 * rolls between °F and °C, and the pair of radios beside it (the owner, 2026-09-26, of the
 * thermometer before this one: *"it does not make sense what's showing and not like a real
 * thermometer"*). Pure TypeScript, so all of it is tested in node — this package's tests cannot
 * render React Native — and `ThermometerToggle.tsx` only hands these numbers to views and to
 * `Animated.Value#interpolate`.
 *
 * A REAL DUAL-SCALE THERMOMETER, LYING DOWN. The bulb is at the left and the bore runs right. °F
 * is printed along the top edge of the bore and °C along the bottom, each graduation where that
 * temperature is, so 98.6 on top stands over 37 below — the glass of any clinical thermometer
 * sold with both scales. The column rises from the bulb to the reading the sheet shows: the same
 * point on both scales, because it is one temperature. Choosing a scale changes which row is READ
 * — its numbers and symbol in the full ink and the bold face, the other row quiet — and never
 * where the column stands: the temperature did not change.
 *
 * WHY THE COLUMN MAY STAND AT THE READING. The thermometer before this one kept its column the same
 * length for every reading, reading CLAUDE.md §2 rules 1 and 3 as forbidding anything else — and
 * drew a thermometer that measured nothing, which is what the owner could not make sense of. The
 * column is the parent's own number drawn against a printed scale, as a ruler draws a length:
 * arithmetic, the rule 6 kind, not a reading of what the number means. What would turn it into an
 * interpretation is everything round it, and none of it is here — the column is one neutral silver
 * at every reading and never red (`theme/thermometer.ts`); nothing on the glass marks a particular
 * temperature (no arrow at 98.6 °F / 37 °C, which a real clinical thermometer prints and this one
 * deliberately does not); no band, no zone, no color that changes with the number; no word. The
 * printed run is evenly graduated from end to end, and its ends are the ends of the glass, not
 * limits: a reading past either end pins the column there and is still written in full, by the
 * tag at the tip and by the stepper above.
 *
 * WHO CONVERTS. The sheet does (`tempToDisplay`: stored as °C×100, converted at the edge). The tag
 * writes exactly the number it is handed. The glass is laid out in the unit the app STORES — every
 * graduation, number and the column's tip placed at `displayToTemp` of its value, core's own
 * conversion, the one the sheet saves with — so there is no arithmetic of degrees in this file to
 * disagree with it, and the picture and the save cannot differ.
 */
import { displayToTemp, type TempUnit } from '@nibblecue/core';
import type { ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { easeAt, moveMs, SKY_EASE, THEME_SKY_MS } from './themeSkyToggle';

/* ----------------------------------------------------------------------------- the stops */

/**
 * Left to right: the pair's order, which is the order the sheet's segmented control drew the two
 * scales in (`TempSheet.tsx`), and top to bottom: the order the glass prints them in.
 */
export const SCALE_STOPS = ['f', 'c'] as const satisfies readonly TempUnit[];
export type ScaleStop = (typeof SCALE_STOPS)[number];

/** A scale's place: 0 or 1. The emphasis and the pair's chip are in these units. */
export const scaleIndex = (stop: ScaleStop): 0 | 1 => (stop === 'f' ? 0 : 1);

/* ---------------------------------------------------------------------------- the size */

/**
 * THE ROW: the glass on the left, then `gap` (`space.md`), then the pair — two radios, each a
 * `cell` wide and the row tall.
 *
 * THE RADIOS ARE A PAIR BESIDE THE GLASS, NOT THE GLASS'S TWO HALVES. Tapping the °F row for °F
 * and the °C row for °C was the first idea, and the height rules it out: the two rows are stacked,
 * so each half of a pill as short as this one is at most 30 pt tall, under the 44 pt floor
 * (CLAUDE.md §6) — and 88 pt of glass to make them 44 would be the tallest control on the sheet
 * (the owner: *"always make things shorter when you can"*). Slop past the glass would reach into
 * the stepper's buttons above and the method's pills below. So the radios are a compact pair at
 * the right-hand end, 44 pt wide and the row tall, drawn as the segmented control the method row
 * under it is; the glass is the picture, and says which scale is read by its ink.
 *
 * 52 tall: the bore, a row of ticks and a row of numbers either side of it, with room for the text
 * to grow (`thermometerLayout`), four points more than the 48 of the thermometer before it.
 *
 * ITS WIDTH IS THE ROOM IT IS GIVEN, up to `maxWidth` — the quick sheet's body, 324 pt on a 360 dp
 * phone — and `minWidth` is the narrowest the placement is PROVEN at: 280, the body of a 316 pt
 * window, narrower than the 320 pt of the smallest phone the app runs on;
 * `thermometerToggle.test.ts` walks every half point from it.
 */
export const THERMOMETER_SIZE = {
  height: 52,
  rim: 1,
  cell: 44,
  gap: 8,
  minWidth: 280,
  maxWidth: 400,
} as const;

/** The pair's track: `hit.min` tall, as the segmented control's is, its chips `pad` inside it. */
export const PAIR = { track: 44, pad: 4 } as const;

/**
 * THE GLASS, in points.
 *
 *   `bulbX`, `bulbR`  the bulb: its center from the glass's left end, and its radius — well inside
 *                     the round end, and each row's scale symbol printed above and below it
 *   `neck`            the least bore between the bulb and the first graduation
 *   `bore`            the capillary's height: the column is drawn in it
 *   `tickGap`         from the bore's edge to where the graduations start
 *   `tick`            the graduations' lengths: a numbered one, a whole degree, and the rest
 *   `inkGap`          from the longest graduation's end to the numbers' ink
 *   `margin`          the least room between any ink and the rim
 *   `labelGap`        the least room between two numbers in a row, and between a symbol and them
 *   `tickRoom`        the least room between two graduations
 *   `tipGap`, `tagPad`  the tag: its distance from the column's tip, and its padding either side
 */
export const GLASS = {
  bulbX: 24,
  bulbR: 8,
  neck: 4,
  bore: 6,
  tickGap: 1,
  tick: { long: 4.5, mid: 3, short: 2 },
  inkGap: 3,
  margin: 1.5,
  labelGap: 6,
  tickRoom: 2.5,
  tipGap: 3,
  tagPad: 5,
} as const;

/** How far the numbers' ink sits from the bore's centerline, above and below. */
export const INK_OFFSET = GLASS.bore / 2 + GLASS.tickGap + GLASS.tick.long + GLASS.inkGap;

/**
 * WHAT IS PRINTED, in each scale's own degrees: a graduation every `tick`, and a number every
 * `every[0]` degrees — or every `every[1]` where the first would crowd (a narrow phone at a large
 * text size), never smaller type. 95–106 °F above 35–41 °C: the run of a clinical thermometer
 * sold with both scales, and the whole of it at any width a phone gives.
 */
export interface PrintedScale {
  from: number;
  to: number;
  tick: number;
  every: readonly number[];
}
export const PRINTED: Readonly<Record<ScaleStop, PrintedScale>> = {
  f: { from: 95, to: 106, tick: 0.5, every: [2, 4] },
  c: { from: 35, to: 41, tick: 0.2, every: [1, 2] },
};

/**
 * Where a number on a scale sits on the glass, in the unit the app stores (°C×100): core's own
 * conversion, the one the sheet saves with — so a mark on the glass and a saved reading can never
 * disagree about where a temperature is.
 */
export const storedAt = (value: number, scale: ScaleStop): number => displayToTemp(value, scale);

/** The glass's printed run, °C×100: from the lower of the two first marks to the higher last one. */
export const GLASS_RUN = {
  from: Math.min(...SCALE_STOPS.map(s => storedAt(PRINTED[s].from, s))),
  to: Math.max(...SCALE_STOPS.map(s => storedAt(PRINTED[s].to, s))),
} as const;
const RUN_SPAN = GLASS_RUN.to - GLASS_RUN.from;

/**
 * HOW FAR ALONG THE PRINTED RUN A READING IS: 0 at its first mark, 1 at its last, and pinned at
 * the end a reading is past — the column never leaves the glass, and the number is still written
 * in full by the tag and the stepper. A pure function of the reading and its scale, so 98.6 °F and
 * 37.0 °C are the same place.
 */
export function levelOf(reading: number, scale: ScaleStop): number {
  if (!Number.isFinite(reading)) return 0;
  return Math.min(Math.max((storedAt(reading, scale) - GLASS_RUN.from) / RUN_SPAN, 0), 1);
}

/**
 * THE TYPE. The mono face (IBM Plex Mono, `statValue`'s), because a scale is digits that line up
 * and a tag is digits that roll — the rule `Text.tsx` gives every number a parent reads — and
 * because in it every character is exactly 0.6 em, so every width here is a measurement rather
 * than a bound. The rest of `MONO` is read out of the app's own TTF, Regular and SemiBold alike:
 * the ascent (the baseline's depth in a line), a line (ascent and descent), how far a digit's ink
 * rises above the baseline and falls below it, and a digit's narrowest side bearing.
 *
 * The numbers are 10 and the tag 11. Both grow with the phone's text size as far as the glass has
 * room (`thermometerGeometry` finds the cap), never past the chrome cap; the test holds the room
 * to at least 1.25 at every width it walks, and to `floor` from a 336 pt window up. What stops
 * them is the tag, which may not reach the rows of numbers above and below it — past that, the
 * rows print fewer numbers (`PRINTED.every`) before they would print smaller ones.
 */
export const MONO = {
  advance: 0.6,
  ascent: 1.025,
  line: 1.3,
  rise: 0.71,
  fall: 0.012,
  side: 0.028,
};
export const SCALE_TYPE = { size: 10, tag: 11, floor: 1.3, ceiling: 1.6 } as const;

/**
 * THE ROOM EACH PRINTED CHARACTER'S TEXT BOX IS GIVEN, either side of its own cell, in characters.
 *
 * THE DOTTED LINE IN THE TAG WAS THIS (the owner, 2026-09-26, with a screenshot: *"i think it's
 * still has visual bug for the end temperature … or was it just unfinished?"*). Each of the tag's
 * digits was set in a box exactly one mono advance wide (0.6 em) with `numberOfLines={1}`. Android
 * lays a box out on whole device pixels and measures a glyph with the face's hinting — 6.6 pt at
 * 2.625× is 17.3 px, which a layout can round down — so a digit came out a hair wider than the box
 * it was given, and a one-line text that does not fit is ELLIPSIZED: the digits and the point were
 * drawn as "…", and the tag read as a hollow capsule with a dotted line in it. The rows of numbers were already set in boxes a character wider either
 * side for exactly this reason; the tag's cells were not. Now every character on the glass is set
 * in a box `GLYPH_ROOM` characters wider either side of its cell (`glyphBox`), centered on it, and
 * clipped rather than ellipsized — a wheel's window still clips at its own cell, where there is
 * only a digit's side bearing to cut.
 */
export const GLYPH_ROOM = 1;

/** A character's text box, relative to its cell of `slot` points: centered on it, wider either side. */
export const glyphBox = (slot: number): { left: number; width: number } => ({
  left: -GLYPH_ROOM * slot,
  width: (1 + 2 * GLYPH_ROOM) * slot,
});

/** The tag's digits: three whole-number wheels ("110.0" is the widest the sheet allows), the point, the tenths. */
export const ODOMETER = { ints: 3, fracs: 1 } as const;
const WHEELS = ODOMETER.ints + ODOMETER.fracs;
const TAG_SLOTS = WHEELS + 1;

/** A stretch of a row: a number, or a scale's symbol, in the glass's own coordinates. */
export interface Printed {
  /** The degrees it stands for; NaN for a symbol. */
  value: number;
  text: string;
  /** Its center, and its box: as wide as its characters, one line tall. */
  x: number;
  left: number;
  width: number;
}

/** A graduation: where it stands, and how long it is — it grows away from the bore. */
export interface Tick {
  value: number;
  x: number;
  length: number;
}

export interface ThermometerGeometry {
  /** The whole row, and each part of it. */
  width: number;
  height: number;
  rim: number;
  glass: number;
  bulb: { cx: number; cy: number; r: number };
  /** The capillary: its top, its height, and where it starts (the bulb's middle) and stops. */
  bore: { top: number; height: number; left: number; right: number };
  /** Where the column's tip stands at the start of the printed run and at its end. */
  run: { from: number; to: number };
  /** Each scale's graduations: °F's grow up from the bore, °C's down from it, `GLASS.tickGap` off it. */
  ticks: Readonly<Record<ScaleStop, readonly Tick[]>>;
  /** Each scale's numbers, how often one is printed, its symbol, and its row's line. */
  labels: Readonly<Record<ScaleStop, readonly Printed[]>>;
  every: Readonly<Record<ScaleStop, number>>;
  symbol: Readonly<Record<ScaleStop, Printed>>;
  row: Readonly<Record<ScaleStop, { top: number; baseline: number }>>;
  /** The rows' type: its size, one line, one character. */
  type: { size: number; line: number; slot: number };
  /**
   * The tag: its type, its wheels' window (whole points tall), its box, and where its row of
   * digits starts inside the hairline round it.
   */
  tag: {
    size: number;
    slot: number;
    cell: number;
    width: number;
    height: number;
    top: number;
    digits: number;
  };
  /** The pair: where it starts, its track, and its chip and how far the chip travels. */
  pair: {
    left: number;
    track: { top: number; width: number; height: number };
    chip: { left: number; top: number; width: number; height: number; travel: number };
  };
  /** How far the type may grow with the phone's text size; the size it is laid out at; whether all of it fits. */
  cap: number;
  scale: number;
  fits: boolean;
}

/** The tick lengths, in order: a numbered graduation, a whole degree, and the rest. */
const tickLength = (value: number, every: number): number => {
  const tenths = Math.round(value * 10);
  if (tenths % Math.round(every * 10) === 0) return GLASS.tick.long;
  return tenths % 10 === 0 ? GLASS.tick.mid : GLASS.tick.short;
};

/** The values from `from` to `to` in steps of `step`, counted in tenths so no step drifts. */
const steps = (from: number, to: number, step: number): number[] => {
  const [a, b, s] = [from, to, step].map(v => Math.round(v * 10)) as [number, number, number];
  const first = Math.ceil(a / s) * s;
  return Array.from({ length: Math.max(0, Math.floor((b - first) / s) + 1) }, (_, i) =>
    Number(((first + i * s) / 10).toFixed(1)),
  );
};

/**
 * Whether a point is inside the glass's pill, `margin` in from its outer edge (a stadium: two
 * round ends and a band between them).
 */
export function insideGlass(
  glass: number,
  height: number,
  x: number,
  y: number,
  margin: number,
): boolean {
  const r = height / 2;
  const cx = Math.min(Math.max(x, r), glass - r);
  return Math.hypot(x - cx, y - r) <= r - margin + 1e-9;
}

/** A printed stretch's ink box, for the fit: its box less a digit's side bearing, and a digit's rise and fall. */
export function inkBox(p: Printed, baseline: number, size: number) {
  return {
    left: p.left + MONO.side * size,
    right: p.left + p.width - MONO.side * size,
    top: baseline - MONO.rise * size,
    bottom: baseline + MONO.fall * size,
  };
}

/**
 * The picture at `scale` × the type's size, and whether it all fits there. Every condition in
 * `fits` only tightens as the type grows — the numbers and the tag get wider and taller, so the
 * printed run gets shorter and its numbers closer — so if it fits at one size it fits at every
 * smaller one, which is what lets `thermometerGeometry` find the cap by halving (the test walks it
 * against every size).
 */
export function thermometerLayout(
  width: number,
  labels: Readonly<Record<ScaleStop, string>>,
  scale: number,
): Omit<ThermometerGeometry, 'cap' | 'scale'> {
  const { height, rim, cell, gap, maxWidth } = THERMOMETER_SIZE;
  const { bulbX, bulbR, neck, bore: boreH, margin, labelGap, tipGap, tagPad } = GLASS;
  // never narrower than the pair and a glass as long as it is tall, whatever a first frame measures
  const w = Math.min(Math.max(width, 2 * cell + gap + 2 * height), maxWidth);
  const glass = w - 2 * cell - gap;
  // the centerline, which is also the radius of the glass's round ends
  const mid = height / 2;

  // the rows' type, and the tag's, at this size
  const size = SCALE_TYPE.size * scale;
  const slot = MONO.advance * size;
  const line = MONO.line * size;
  const tagSize = SCALE_TYPE.tag * scale;
  const tagSlot = MONO.advance * tagSize;
  // a wheel's window is whole points tall, so a digit at rest sits on whole pixels
  const tagCell = Math.ceil(MONO.line * tagSize);
  const tagH = tagCell + 2;
  const tagW = TAG_SLOTS * tagSlot + 2 * tagPad;

  const bulb = { cx: bulbX, cy: mid, r: bulbR };
  const symbolOf = (s: ScaleStop): Printed => {
    const text = labels[s];
    const wide = [...text].length * slot;
    return { value: Number.NaN, text, x: bulb.cx, left: bulb.cx - wide / 2, width: wide };
  };
  const symbol = { f: symbolOf('f'), c: symbolOf('c') };

  // THE RUN. It starts clear of the bulb and of both symbols — the first number of the lower row
  // (35, at the very start) needs its half and a gap past the wider symbol — and ends where the
  // tag, at the top of the run, still sits inside the glass's round right-hand end
  const symbolRight = Math.max(...SCALE_STOPS.map(s => symbol[s].left + symbol[s].width));
  const from = Math.max(bulb.cx + bulb.r + neck, symbolRight + labelGap + slot);
  const reach = glass - mid + Math.sqrt(Math.max(0, (mid - rim - margin) ** 2 - (tagH / 2) ** 2));
  const to = reach - tagW - tipGap;
  const xAt = (value: number, s: ScaleStop) =>
    from + ((storedAt(value, s) - GLASS_RUN.from) / RUN_SPAN) * (to - from);

  // the rows, by their ink: the upper row's digits end `INK_OFFSET` above the centerline and the
  // lower row's begin as far below it
  const baseline = {
    f: mid - INK_OFFSET - MONO.fall * size,
    c: mid + INK_OFFSET + MONO.rise * size,
  };
  const row = {
    f: { top: baseline.f - MONO.ascent * size, baseline: baseline.f },
    c: { top: baseline.c - MONO.ascent * size, baseline: baseline.c },
  };

  // THE NUMBERS: the densest printing whose neighbors keep `labelGap` between them
  const printAt = (s: ScaleStop, every: number): Printed[] =>
    steps(PRINTED[s].from, PRINTED[s].to, every).map(v => {
      const text = String(v);
      const wide = text.length * slot;
      const x = xAt(v, s);
      return { value: v, text, x, left: x - wide / 2, width: wide };
    });
  // a gap measured against `labelGap` it was built from may come out a hair under it in floating
  // point; a billionth of a point is not a crowding
  const apart = (a: number, b: number, least: number) => b - a >= least - 1e-9;
  const spaced = (ps: readonly Printed[]) =>
    ps.every(
      (p, i) =>
        i === 0 || apart((ps[i - 1]?.left ?? 0) + (ps[i - 1]?.width ?? 0), p.left, labelGap),
    );
  const choose = (s: ScaleStop) => {
    const options = PRINTED[s].every;
    const found = options.find(e => spaced(printAt(s, e)));
    return { every: found ?? options[options.length - 1] ?? 1, spaced: found !== undefined };
  };
  const pick = { f: choose('f'), c: choose('c') };
  const every = { f: pick.f.every, c: pick.c.every };
  const printed = { f: printAt('f', every.f), c: printAt('c', every.c) };
  const graduate = (s: ScaleStop): Tick[] =>
    steps(PRINTED[s].from, PRINTED[s].to, PRINTED[s].tick).map(v => ({
      value: v,
      x: xAt(v, s),
      length: tickLength(v, every[s]),
    }));
  const ticks = { f: graduate('f'), c: graduate('c') };

  const bore = {
    top: mid - boreH / 2,
    height: boreH,
    left: bulb.cx,
    // the capillary runs on past the last mark, as far as the tag reaches at the top of the run
    right: to + tipGap + tagW,
  };

  const inks = SCALE_STOPS.flatMap(s =>
    [symbol[s], ...printed[s]].map(p => inkBox(p, baseline[s], size)),
  );
  const tickXs = SCALE_STOPS.map(s => ticks[s].map(t => t.x));
  const fits =
    // the tag never reaches either row's ink, above or below the bore
    tagH / 2 <= INK_OFFSET - 1 &&
    // every number and symbol inside the glass, clear of the rim
    inks.every(
      b =>
        insideGlass(glass, height, b.left, b.top, rim + margin) &&
        insideGlass(glass, height, b.right, b.top, rim + margin) &&
        insideGlass(glass, height, b.left, b.bottom, rim + margin) &&
        insideGlass(glass, height, b.right, b.bottom, rim + margin),
    ) &&
    // the numbers keep apart, at the densest printing or the sparser one, and clear of the symbol
    pick.f.spaced &&
    pick.c.spaced &&
    SCALE_STOPS.every(s =>
      apart(symbol[s].left + symbol[s].width, printed[s][0]?.left ?? Infinity, labelGap),
    ) &&
    // and the graduations
    tickXs.every(xs => xs.every((x, i) => i === 0 || apart(xs[i - 1] ?? 0, x, GLASS.tickRoom))) &&
    // the bore's two ends inside the glass
    insideGlass(glass, height, bulb.cx - bulb.r, mid, rim + margin) &&
    insideGlass(glass, height, bore.right, bore.top, rim + margin);

  const trackTop = (height - PAIR.track) / 2;
  const chipW = (2 * cell - 3 * PAIR.pad) / 2;
  return {
    width: w,
    height,
    rim,
    glass,
    bulb,
    bore,
    run: { from, to },
    ticks,
    labels: printed,
    every,
    symbol,
    row,
    type: { size, line, slot },
    tag: {
      size: tagSize,
      slot: tagSlot,
      cell: tagCell,
      width: tagW,
      height: tagH,
      // centered on the bore even when it is an odd number of points tall: the layout snaps the
      // box to the device's pixels, and a wheel at rest stays sharp because its window is whole
      // points tall and it only ever moves by whole windows
      top: mid - tagH / 2,
      digits: tagPad - 1,
    },
    pair: {
      left: glass + gap,
      track: { top: trackTop, width: 2 * cell, height: PAIR.track },
      chip: {
        left: PAIR.pad,
        top: PAIR.pad,
        width: chipW,
        height: PAIR.track - 2 * PAIR.pad,
        travel: chipW + PAIR.pad,
      },
    },
    fits,
  };
}

/**
 * THE PICTURE AT THE PHONE'S TEXT SIZE. `fontScale` is the phone's own (`useWindowDimensions`);
 * the picture is laid out at it, as far as the cap — the largest size, in hundredths up to the
 * chrome cap, at which everything fits — and drawn at 1 where nothing larger does.
 */
export function thermometerGeometry(
  width: number,
  labels: Readonly<Record<ScaleStop, string>>,
  fontScale = 1,
): ThermometerGeometry {
  let fits = 100;
  let fails = Math.round(SCALE_TYPE.ceiling * 100) + 1;
  while (fails - fits > 1) {
    const half = Math.floor((fits + fails) / 2);
    if (thermometerLayout(width, labels, half / 100).fits) fits = half;
    else fails = half;
  }
  const cap = fits / 100;
  const scale = Math.min(Math.max(fontScale, 0.5), cap);
  return { ...thermometerLayout(width, labels, scale), cap, scale };
}

/* ------------------------------------------------------------------------- the tag */

/** Each digit wheel holds 0–9 three times over, so a roll either way from the middle never runs off it. */
export const WHEEL_CELLS = 30;

/** Where a wheel rests showing `digit`: in the middle copy, with a whole copy either side. */
export const restCell = (digit: number): number => 10 + digit;

/** The digit a wheel shows at `cell`. */
export const digitAt = (cell: number): number => ((Math.round(cell) % 10) + 10) % 10;

export interface ReadingDigits {
  /** One digit per wheel, whole-number wheels first. */
  digits: readonly number[];
  /** Whether each wheel is drawn: a whole-number wheel in front of the first digit is not. */
  lit: readonly boolean[];
  /** How many wheels in front are not drawn. */
  blanks: number;
}

/** A reading as the tag shows it: one decimal, as the sheet's toast writes it. */
export function readingDigits(value: number): ReadingDigits {
  const limit = 10 ** WHEELS - 1;
  const tenths = Math.min(Math.round(Math.abs(Number.isFinite(value) ? value : 0) * 10), limit);
  const digits = Array.from(
    { length: WHEELS },
    (_, i) => Math.floor(tenths / 10 ** (WHEELS - 1 - i)) % 10,
  );
  // the ones wheel is always drawn, so 0.5 reads "0.5"; wheels before it only from the first digit
  const first = digits.slice(0, ODOMETER.ints - 1).findIndex(d => d !== 0);
  const blanks = first === -1 ? ODOMETER.ints - 1 : first;
  return { digits, lit: digits.map((_, i) => i >= blanks), blanks };
}

/** The reading as text, for a test to read: exactly what the lit wheels spell. */
export function readingText(r: ReadingDigits): string {
  const shown = r.digits.map((d, i) => (r.lit[i] ? String(d) : ''));
  return `${shown.slice(0, ODOMETER.ints).join('')}.${shown.slice(ODOMETER.ints).join('')}`;
}

/**
 * How far the digits move for the wheels in front that are not drawn, in characters: half a
 * character each, so "98.6" sits in the middle of a tag cut for "100.4".
 */
export const tagShift = (r: ReadingDigits): number => -r.blanks / 2;

export type Roll = 'up' | 'down';

/**
 * WHERE A WHEEL GOES: from the cell it was last sent to, to the nearest cell showing `digit` in the
 * direction of the roll — up when the number rises, down when it falls, every wheel the same way,
 * as a counter's do. Never more than nine cells, and none when the digit is already there.
 */
export function rollTo(at: number, digit: number, roll: Roll): number {
  const d = digitAt(at);
  const turns = roll === 'up' ? (digit - d + 10) % 10 : (d - digit + 10) % 10;
  return roll === 'up' ? at + turns : at - turns;
}

/** The digits a wheel shows on its way from one cell to another, both ends included. */
export function rollSequence(from: number, to: number): number[] {
  const step = to >= from ? 1 : -1;
  const out: number[] = [];
  for (let c = from; step > 0 ? c <= to : c >= to; c += step) out.push(digitAt(c));
  return out;
}

/* --------------------------------------------------------------------------- the moves */

/**
 * WHEN NOTHING MOVES: under REDUCE MOTION (docs/DESIGN_SYSTEM.md §7) and in the amber NIGHT theme,
 * which keeps a dark room dark (the batch's rule, 2026-09-25). The end state is set directly —
 * the column at the reading, the scale's ink, the tag's digits — nothing hidden, only nothing
 * travels.
 */
export const thermometerStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  reduceMotion || theme === 'night';

/** How long after a tap a scale arriving still counts as the one the tap asked for. */
export const TAP_WINDOW_MS = 1500;

/** The tag's wheels settle one after another, left to right, this far apart. */
export const WHEEL_STAGGER_MS = 50;

/**
 * THE CLICK A WHEEL LANDS WITH: it runs a seventh of a digit past its place and comes back, the
 * detent of a mechanical counter, the same small carry for every wheel whatever its travel — so the
 * digits land together rather than ragged.
 */
export const WHEEL_CLICK = { cells: 0.14, ms: 110 } as const;

/**
 * THE COLUMN'S GLIDE, when the stepper changes the reading: a quick run that starts at speed and
 * settles (an ease-out, `ease`), longer the further it goes. A held stepper sends a new reading
 * every 60–120 ms, and each glide sets off from wherever the column is: a curve that started from
 * rest every time would make the column pulse along behind the thumb instead of following it.
 */
export const GLIDE = { min: 160, max: 480, perPoint: 3, ease: [0.33, 1, 0.68, 1] } as const;
export const glideMs = (points: number): number =>
  Math.round(Math.min(GLIDE.max, GLIDE.min + GLIDE.perPoint * Math.abs(points)));

/**
 * THE SAME TEMPERATURE, READ ON THE OTHER SCALE. The sheet shows a reading to a tenth in each
 * scale, so its °F and its °C land a few hundredths of a degree apart once they are placed on the
 * glass (99.1 °F is 37.28 °C, shown as 37.3). A flip whose reading lands within this many
 * hundredths of where the column was sent leaves the column exactly where it is.
 */
export const FLIP_SLACK = 10;

/** A flip in flight — the emphasis and the chip: where it set off from, where to, when. */
export interface FlipMotion {
  from: number;
  to: ScaleStop;
  startedAt: number;
  duration: number;
}

/** Where a flip is, in scale places, `now` — the planner's estimate; the native driver has the truth. */
export function sideAt(m: FlipMotion, now: number): number {
  const x = m.duration <= 0 ? 1 : (now - m.startedAt) / m.duration;
  return m.from + (scaleIndex(m.to) - m.from) * easeAt(SKY_EASE.land, x);
}

export interface ThermometerChange {
  /** The scale and the reading before, and now. */
  was: { stop: ScaleStop; reading: number };
  now: { stop: ScaleStop; reading: number };
  /** Whether the parent's own tap asked for this scale (`TAP_WINDOW_MS`). */
  tapped: boolean;
  still: boolean;
  /** Where the column was last sent, as a level (`levelOf`). */
  level: number;
  /** The cells the tag's wheels were last sent to. */
  cells: readonly number[];
  /** The flip in flight, if any. */
  flip: FlipMotion | null;
  /** How far the column's tip travels over the whole printed run, in points: a glide's time is its distance. */
  travel: number;
  at: number;
}

/** A value's move: where to, and whether it travels there or is set. */
export interface Move {
  to: number;
  animate: boolean;
  duration: number;
}

export interface ThermometerPlan {
  /** The column; null leaves it where it is. */
  level: Move | null;
  /** The scale read (the emphasis and the chip), and where it was estimated to be as it set off; null leaves it. */
  side: (Move & { from: number }) | null;
  /** Whether the tag's wheels roll; otherwise they are set. */
  roll: boolean;
  /** Where each wheel goes, and how far past its place it clicks, signed with its roll. */
  wheels: readonly number[];
  clicks: readonly number[];
  /** Whether each wheel is drawn, and how far the digits move for the ones that are not. */
  lit: readonly (0 | 1)[];
  shift: number;
  /** The roll's time, and each wheel's own. */
  duration: number;
  wheelMs: readonly number[];
}

/**
 * WHAT A CHANGE DOES.
 *
 *   A FLIP THE PARENT TAPPED is the same temperature read on the other scale. The column does not
 *   move. The two rows cross-fade their emphasis and the pair's chip slides across, and the tag's
 *   digits roll like an odometer to the converted reading — down when the number falls (98.6 →
 *   37.0), up when it rises — clicking into place left to right. A tap mid-flip turns everything
 *   round from where it is, the estimate (`sideAt`) only sizing the time.
 *
 *   A NEW READING — a step of the stepper — glides the column along the bore to it, and the tag
 *   rides the tip; the tag's digits are SET, because the stepper's own number has already changed
 *   and a wheel spinning behind a held thumb would only lag it. A flip under way is left to finish.
 *
 *   A SCALE THAT CHANGED WITH NO TAP — the parent's saved scale, arriving a moment after the sheet
 *   opened (`useUnits` reads it after the first render) — is set where it lands: a sheet never
 *   plays a flip nobody asked for.
 *
 *   STILL (reduce motion, amber Night): every change is set, even over a move in flight — which
 *   is what turning reduce motion on mid-glide needs, or the column would freeze where the stopped
 *   run left it. A flip still leaves the column where it was sent.
 */
export function planThermometer(c: ThermometerChange): ThermometerPlan {
  const next = readingDigits(c.now.reading);
  const lit = next.lit.map(l => (l ? 1 : 0) as 0 | 1);
  const shift = tagShift(next);
  const flipped = c.was.stop !== c.now.stop;
  const rolls = flipped && c.tapped && !c.still;

  // the column stands where the temperature is; a flip is the same temperature
  const target = levelOf(c.now.reading, c.now.stop);
  const same = flipped && Math.abs(target - c.level) * RUN_SPAN <= FLIP_SLACK;
  const level: Move | null = c.still
    ? { to: same ? c.level : target, animate: false, duration: 0 }
    : same || target === c.level
      ? null
      : { to: target, animate: true, duration: glideMs((target - c.level) * c.travel) };

  const to = scaleIndex(c.now.stop);
  const moving = c.flip !== null && c.at < c.flip.startedAt + c.flip.duration;
  const from = moving && c.flip ? sideAt(c.flip, c.at) : scaleIndex(c.was.stop);
  const side = rolls
    ? { to, from, animate: true, duration: moveMs(Math.abs(to - from)) }
    : flipped || c.still
      ? { to, from: to, animate: false, duration: 0 }
      : null;

  if (!rolls || side === null) {
    const rest = next.digits.map(restCell);
    return {
      level,
      side,
      roll: false,
      wheels: rest,
      clicks: rest.map(() => 0),
      lit,
      shift,
      duration: 0,
      wheelMs: rest.map(() => 0),
    };
  }
  const roll: Roll = c.now.reading < c.was.reading ? 'down' : 'up';
  const wheels = next.digits.map((d, i) => rollTo(c.cells[i] ?? restCell(0), d, roll));
  const duration = side.duration;
  return {
    level,
    side,
    roll: true,
    wheels,
    clicks: wheels.map((cell, i) => Math.sign(cell - (c.cells[i] ?? cell)) * WHEEL_CLICK.cells),
    lit,
    shift,
    duration,
    wheelMs: wheels.map((_, i) =>
      Math.max(THEME_SKY_MS / 2, duration - (WHEELS - 1 - i) * WHEEL_STAGGER_MS),
    ),
  };
}

/* ------------------------------------------------------------------------- the frames */

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

export interface ThermometerFrames {
  /** Of the level: the column's slide (it is drawn reaching the end of the run and moved back). */
  columnX: Frame;
  /** Of the level: the tag's left edge, riding the tip. */
  tagX: Frame;
  /** Of the scale read: each row's full-ink layer, and its quiet one. */
  bold: Readonly<Record<ScaleStop, Frame>>;
  quiet: Readonly<Record<ScaleStop, Frame>>;
  /** Of the scale read: the pair's chip. */
  chipX: Frame;
}

export function thermometerFrames(g: ThermometerGeometry): ThermometerFrames {
  const { from, to } = g.run;
  return {
    columnX: frame([0, 1], [from - to, 0]),
    tagX: frame([0, 1], [from + GLASS.tipGap, to + GLASS.tipGap]),
    bold: { f: frame([0, 1], [1, 0]), c: frame([0, 1], [0, 1]) },
    quiet: { f: frame([0, 1], [0, 1]), c: frame([0, 1], [1, 0]) },
    chipX: frame([0, 1], [0, g.pair.chip.travel]),
  };
}
