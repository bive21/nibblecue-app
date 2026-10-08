/**
 * A DAY AS A STRIP — the arithmetic of `DayStrip`, pure, so every phone width and text size is
 * walked in node (this package's tests cannot render React Native), and the component only hands
 * these numbers to its views.
 *
 * WHY A STRIP (Reports, 2026-09-26; the owner: *"it just feels boring to normal users who are not
 * used to seeing graphs"*). A day is a line from midnight to midnight, and the things that happened
 * in it are where they happened on it: a dot for each feed, a block for each sleep, a little drop or
 * pile for each change. Nobody has to read an axis to read that — the left end is the morning, the
 * dots are the feeds — and it is the picture a parent draws on paper when a pediatrician asks "how
 * are the nights". It is not a chart of a number; the number is written beside it in words.
 *
 * THREE RULES DO THE WORK:
 *
 *   · A DAY IS ITS OWN LENGTH. The strip runs from the day's first instant to its last, so on the
 *     23- and 25-hour days a feed sits where it happened, not an hour off (`stripX`).
 *   · NO MARK COVERS ANOTHER. Two changes ten minutes apart are two marks: the second goes up a lane
 *     at its own time, and only when every lane is full at that point is it nudged along just past
 *     its neighbor — a few points of time given up so the count on the strip is the count in the
 *     sentence (`placeMarks`). A mark nobody can see is the same lie as an empty box.
 *   · NOTHING IS TOO SMALL TO SEE. A five-minute nap is still a block (`DAY_STRIP.minBlock`), for
 *     the reason `StackedBar` lifts a 1% segment to a stub: a thing that happened is never drawn as
 *     nothing.
 */
import { space, type as typeScale } from '../theme/theme';
import { SHORT_WORD_EM } from './numberBars';
import { ADVANCE } from './quickScale';

export const DAY_STRIP = {
  /** A feed's dot. */
  dot: 8,
  /** A change's glyph — the drop and the pile, outlined (`DIAPER_KIND_GLYPHS`; Today's are solid). */
  glyph: 12,
  /** A sleep block's height. */
  block: 8,
  /** The narrowest a block is drawn. */
  minBlock: 3,
  /** Air between two marks in one lane. */
  gap: 1,
  /** Lanes marks may stack in before one is nudged along instead. */
  lanes: 2,
  /** Between two lanes. */
  laneGap: 2,
  /** The six-hour ticks on the hairline. */
  tick: 4,
} as const;

/** The day a strip draws: its first instant and the first instant after it. */
export interface StripDay {
  startMs: number;
  endMs: number;
}

/** Where an instant sits along a strip: 0 at the day's start, `width` at its end. Clamped to both. */
export function stripX(atMs: number, day: StripDay, width: number): number {
  const length = day.endMs - day.startMs;
  if (!(length > 0) || !(width > 0)) return 0;
  return Math.max(0, Math.min(width, ((atMs - day.startMs) / length) * width));
}

/**
 * A stretch as a block: its left edge and width, inside the strip, never narrower than
 * `DAY_STRIP.minBlock`. Null for a stretch that does not reach into the day at all.
 */
export function stripBlock(
  fromMs: number,
  toMs: number,
  day: StripDay,
  width: number,
): { x: number; w: number } | null {
  if (!(width > 0) || toMs <= day.startMs || fromMs >= day.endMs || toMs <= fromMs) return null;
  const a = stripX(fromMs, day, width);
  const b = stripX(toMs, day, width);
  const w = Math.min(width, Math.max(DAY_STRIP.minBlock, b - a));
  // a sliver at the very end grows leftward, so it is still inside the strip
  return { x: Math.min(a, width - w), w };
}

/** A mark where it was put: its left edge, and the lane it sits in (0 on the line, 1 above it). */
export interface PlacedMark {
  x: number;
  lane: number;
}

/**
 * MARKS PLACED SO NONE COVERS ANOTHER. `centers` are where each mark belongs (from `stripX`) and
 * `widths` how wide each is drawn; the answer is in the same order as they were given.
 *
 * Each mark goes at its own time in the first lane with room there. When every lane is full at that
 * point it is nudged along the lane that frees up first, just past its neighbor; and a lane that has
 * been pushed past the strip's right end is pulled back inside it, each mark moved only as far as
 * the one after it needs. Only a day far busier than any real one — more marks than a lane's length
 * can hold side by side — is spread evenly instead, where marks may touch but none is lost.
 */
export function placeMarks(
  centers: readonly number[],
  widths: readonly number[],
  trackWidth: number,
  lanes: number = DAY_STRIP.lanes,
  gap: number = DAY_STRIP.gap,
): PlacedMark[] {
  const n = centers.length;
  const out: PlacedMark[] = new Array<PlacedMark>(n);
  const order = centers.map((_, i) => i).sort((a, b) => (centers[a] ?? 0) - (centers[b] ?? 0));
  const laneCount = Math.max(1, Math.floor(lanes));
  const right = new Array<number>(laneCount).fill(-Infinity);
  const inLane: number[][] = Array.from({ length: laneCount }, () => []);
  const width = (i: number): number => Math.max(0, widths[i] ?? 0);
  for (const i of order) {
    const w = width(i);
    const ideal = Math.max(0, Math.min(trackWidth - w, (centers[i] ?? 0) - w / 2));
    let lane = right.findIndex(r => r + gap <= ideal);
    let x = ideal;
    if (lane < 0) {
      // every lane is taken here: the one that frees up first, just past its last mark
      lane = right.indexOf(Math.min(...right));
      x = (right[lane] ?? 0) + gap;
    }
    out[i] = { x, lane };
    right[lane] = x + w;
    inLane[lane]?.push(i);
  }
  // pull each lane back inside the strip's right end, from its last mark to its first
  for (const members of inLane) {
    let limit = trackWidth;
    for (let k = members.length - 1; k >= 0; k -= 1) {
      const i = members[k] as number;
      const mark = out[i] as PlacedMark;
      const w = width(i);
      if (mark.x + w > limit) mark.x = limit - w;
      limit = mark.x - gap;
    }
    const first = members[0];
    if (first !== undefined && (out[first]?.x ?? 0) < 0) {
      // more than the lane can hold side by side: spread evenly, first at 0 and last at the end
      const total = members.reduce((sum, i) => sum + width(i), 0);
      const spare = (trackWidth - total) / Math.max(1, members.length - 1);
      let cursor = 0;
      for (const i of members) {
        (out[i] as PlacedMark).x = cursor;
        cursor += width(i) + spare;
      }
    }
  }
  return out;
}

/** How tall a strip of marks is, with `lanes` lanes of marks `size` tall. */
export const marksHeight = (size: number, lanes: number = DAY_STRIP.lanes): number =>
  lanes * size + (lanes - 1) * DAY_STRIP.laneGap;

/* ------------------------------------------------------------------------------ the axis */

/** The hours the axis names under a strip: midnight, six, noon, six. */
export const DAY_AXIS_HOURS = [0, 6, 12, 18] as const;

/** The axis's words, in the app's own clock style (`hourLabel`), with noon said as noon. */
export const DAY_AXIS_LABELS = ['12 a.m.', '6 a.m.', 'noon', '6 p.m.'] as const;

/** The axis's words are `meta`, in the UI face. */
export const AXIS_SIZE = typeScale.meta.fontSize;

/**
 * THE FOUR WORDS' OWN WIDTHS, in em — measured, not averaged. They are constants, so their widths
 * can be too: Hanken Grotesk Regular sets "12 a.m." at 3.23 em, "6 a.m." at 2.67, "noon" at 2.25
 * and "6 p.m." at 2.72, and these are each a few hundredths over (`summaryFit.test.ts` holds them to
 * the TTF the app ships, so a changed word fails there first). A per-character bound would have to
 * cover "noon"'s 0.56 em a letter and would call "12 a.m." half again as wide as it is, and the
 * axis would lose its six o'clocks on phones where they fit.
 */
export const DAY_AXIS_EM = [3.3, 2.75, 2.3, 2.8] as const;
/** Any other word under an axis: the short-word bound (`SHORT_WORD_EM`). */
export const axisLabelWidth = (label: string): number => {
  const i = (DAY_AXIS_LABELS as readonly string[]).indexOf(label);
  return (i >= 0 ? (DAY_AXIS_EM[i] ?? 0) : [...label].length * SHORT_WORD_EM) * AXIS_SIZE;
};

/**
 * WHICH OF THE AXIS'S WORDS FIT: all four; else midnight and noon; else none — never two words on
 * top of each other. The first is drawn from the strip's left end and the others centered on
 * their hour, so each is checked against the next with a little air between them, and the last
 * against the strip's right end. `scale` is the chrome font scale the words are drawn at.
 */
export function axisLabelsShown(
  width: number,
  scale: number,
  labels: readonly string[] = DAY_AXIS_LABELS,
  gap: number = space.sm,
): boolean[] {
  const w = labels.map(l => axisLabelWidth(l) * scale);
  const left = (i: number): number =>
    i === 0 ? 0 : ((DAY_AXIS_HOURS[i] ?? 0) / 24) * width - (w[i] ?? 0) / 2;
  const fits = (set: readonly number[]): boolean =>
    set.every((i, k) => {
      const next = set[k + 1];
      const end = left(i) + (w[i] ?? 0);
      return next === undefined ? end <= width : end + gap <= left(next);
    });
  for (const set of [
    [0, 1, 2, 3],
    [0, 2],
  ]) {
    if (fits(set)) return labels.map((_, i) => set.includes(i));
  }
  return labels.map(() => false);
}

/* ------------------------------------------------------------------------ the sleep diary */

/**
 * A WEEK OF SLEEP, A STRIP A DAY: the day's name on the left, its sleep across the middle, its total
 * on the right (Reports' range card, a week or less). The two words keep their full width while the
 * strip has room; a strip is never squeezed below `minStrip`, and past that the words are drawn a
 * little smaller instead — never the picture made unreadable to keep a word its size.
 */
export const DIARY = {
  /** One day's strip and the words beside it. */
  row: 14,
  /** Between the day's name, its strip and its total. */
  gap: space.md,
  /** The narrowest a day's strip is drawn: under this a nap is a speck. */
  minStrip: 120,
  /** Both words are `meta`: the day's name in the UI face, the total in the mono one. */
  size: typeScale.meta.fontSize,
} as const;

export interface DiaryFit {
  /** The day names' column, in points. */
  label: number;
  /** The totals' column, in points. */
  total: number;
  strip: number;
  /** How far the words are drawn smaller to leave the strip its room: 1 when they need not be. */
  text: number;
}

/**
 * A day's name is a short word — `Wed` — and takes the short-word bound (`SHORT_WORD_EM`, 0.7 em a
 * character in the UI face); a total is mono, 0.6 em a character (`ADVANCE.mono`).
 */
export const diaryLabelWidth = (label: string): number =>
  [...label].length * SHORT_WORD_EM * DIARY.size;
export const diaryTotalWidth = (total: string): number =>
  [...total].length * ADVANCE.mono * DIARY.size;

export function diaryFit(
  width: number,
  labels: readonly string[],
  totals: readonly string[],
  scale: number,
): DiaryFit {
  const label = Math.max(0, ...labels.map(diaryLabelWidth)) * scale;
  const total = Math.max(0, ...totals.map(diaryTotalWidth)) * scale;
  const words = label + total;
  const strip = width - words - 2 * DIARY.gap;
  if (strip >= DIARY.minStrip || words <= 0) return { label, total, strip, text: 1 };
  const text = Math.max(0, (width - 2 * DIARY.gap - DIARY.minStrip) / words);
  return { label: label * text, total: total * text, strip: DIARY.minStrip, text };
}
