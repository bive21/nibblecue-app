/**
 * WHERE A RUNNING CARD'S WORDS LAND ON THE OWNER'S PICTURE, AS BOXES (2026-09-27).
 *
 * `tools/brand/render-card-art.mjs` solves each picture's veil across a measured content column —
 * the plain left of the drawing — and it used to read the words' ground there and nowhere else.
 * But `TimerCard` does not hold its words to that column (its comment says why: a cap wrapped the
 * totals, grew the card and deepened the crop); they are bounded by the stop pill beside them. On
 * the pictures of 2026-09-26, drawn for "the words in the plain left third", the words are wider
 * than a third: "12m 05s" at 31 is 130 pt, and its last glyph sits on the sleeping baby's cloud at
 * 1.8:1 on a 390 pt phone. A check of the column could not see it, because the column ends before
 * the words do.
 *
 * So the renderer also reads the owner's pixels under every line AS THE CARD LAYS IT OUT, at every
 * phone width from 320 pt to 430, and this file is that layout in numbers: the card's inset, the
 * stop pill that bounds the words, each line's box, and the card's height — which decides how far
 * the picture is scaled, and so where its drawing lands under the words (`anchoredCover`).
 *
 * IN `theme/`, BESIDE `artInk.ts`, AND IMPORT-FREE WHEN IT RUNS. The renderer is a node script that
 * reads this file as it is: node strips the types, and could not resolve an extensionless import.
 * So every number is RESTATED from its source and held to it — the theme's space and type by
 * `artWords.test.ts`, and the card's and the stop pill's own constants by the type-only imports
 * below, so changing one of them fails `pnpm typecheck` here. A spacing number in this file is the
 * measurement of a token, never a style.
 */
import type { STOP_CAPTION_TRACKING, STOP_PILL_MARK, TimerType } from '../components/StopButton';
import type {
  TIMER_OVERLAY_FILL_ALPHA,
  TIMER_PAUSE_SIZE,
  TIMER_PILL_HEIGHT,
  TIMER_SWITCH_GLYPH,
} from '../components/TimerCard';

/**
 * THE PHONES THE WORDS ARE MEASURED ON: every width from 320 pt — a 375 pt iPhone in Display Zoom,
 * and the floor the design system's other fits hold to — to the 430 pt of the largest iPhone.
 */
export const ART_WORD_PHONES = { from: 320, to: 430 } as const;

/** The running card, as `TimerCard` and `StopButton` draw it, each number named for its source. */
export const ART_WORDS = {
  /** Today's content column: `Screen` insets each side by `space.xxl`. */
  gutter: 18,
  /** The card's own padding (`space.lg`) and its gap between the words and the stop (`space.md`). */
  inset: 11,
  beside: 8,
  /** Between the text block's lines (`space.xs`), and above a feed's switch row (`space.sm`). */
  between: 4,
  aboveRow: 6,
  /** The switch row's layout height; its controls draw taller and overhang it into the padding. */
  row: 34 satisfies typeof TIMER_PILL_HEIGHT,
  /**
   * THE STOP PILL, WHICH IS WHAT BOUNDS THE WORDS: `space.xl` a side, the mark, `space.sm`, then the
   * caption in `bodySm`, tracked a little tighter. Its caption is drawn at weight 700 over the
   * Regular face, which a platform may set in the Bold one; the Regular widths make the narrower
   * pill and so the wider column of words — the safe side for a measurement of where they land.
   */
  stop: {
    side: 14,
    mark: 20 satisfies typeof STOP_PILL_MARK,
    space: 6,
    size: 13,
    face: 'HankenGrotesk-Regular',
    tracking: -0.1 satisfies typeof STOP_CAPTION_TRACKING,
  },
  /**
   * A FEED'S SIDE SWITCH: the same padding, the swap glyph, `space.sm`, and its words in `bodySm` at
   * weight 600 — measured in the Bold face, the wider of the two a platform may draw — on the ink at
   * 22%, which is what lies between those words and the picture.
   */
  switch: {
    side: 14,
    glyph: 16 satisfies typeof TIMER_SWITCH_GLYPH,
    space: 6,
    size: 13,
    face: 'HankenGrotesk-Bold',
    fill: 0.22 satisfies typeof TIMER_OVERLAY_FILL_ALPHA,
  },
  /**
   * The pause disc beside the switch, a row gap (`space.md`) away. The row wraps, so on a column too
   * narrow for both the disc goes under the switch — and the card is a row taller.
   */
  pause: 44 satisfies typeof TIMER_PAUSE_SIZE,
  rowGap: 8,
  /**
   * THE LINES, TOP DOWN, in their roles' faces: the title (`h2`, one line, cut at the column), the
   * elapsed (`display`, its line held to its size), a feed's totals (`meta` in the mono face, as
   * `Numeric` sets it) and the started line (`meta`). A line's negative tracking is left out: it
   * only narrows a line, so leaving it out is the safe side.
   */
  title: { size: 18, face: 'HankenGrotesk-ExtraBold' },
  numeral: { size: 31, face: 'IBMPlexMono-SemiBold', line: 31 },
  totals: { size: 12, face: 'IBMPlexMono-Regular' },
  started: { size: 12, face: 'HankenGrotesk-Regular' },
} as const;

/**
 * THE LONGEST LINES A RUNNING CARD REALISTICALLY DRAWS, as the inputs the card's own formatters take
 * — `timeFormat.ts` writes every word, and nothing here is a copy of one.
 */
export const ART_WORD_SAMPLE = {
  /**
   * TWELVE CHARACTERS: a baby's name, which Today draws in the title when a home has two (and the
   * running sheet always), and the name of whoever started the timer, after "Started 12:48 PM ·".
   */
  name: 'Christabelle',
  /** 12:48 PM, a four-digit 12-hour clock, in UTC so the check reads the same in every zone. */
  startedAt: Date.UTC(2026, 8, 27, 12, 48),
  timeZone: 'UTC',
  /** "12m 05s": seven mono characters, the widest the live format writes under a hundred hours. */
  elapsedMs: (12 * 60 + 5) * 1000,
  /** Two-digit minutes a side, open on the right: "on right" is the longest word it ends on. */
  sides: { leftMs: (12 * 60 + 4) * 1000, rightMs: (18 * 60 + 30) * 1000, active: 'right' },
} as const;

export type ArtWordName = 'title' | 'numeral' | 'totals' | 'started' | 'switch';

/** One line of the text block, as the face sets it. */
export interface ArtWordLine {
  name: Exclude<ArtWordName, 'switch'>;
  /** Its width on one line, in points. */
  width: number;
  /** Its line box, in points. */
  height: number;
}

/** Where one line's words are drawn on the card, in points from its top-left corner. */
export interface ArtWordBox {
  name: ArtWordName;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The ink laid between these words and the picture: the switch pill's fill, 0 on the picture. */
  fill: number;
}

export interface ArtWordCard {
  /** The card's box on this phone: the width Today gives it, the height its words make it. */
  width: number;
  height: number;
  /** The words' column: the card's width less its inset, the stop pill and the gap before it. */
  column: number;
  boxes: ArtWordBox[];
}

/**
 * THE CARD ON ONE PHONE: every line's box, and the card's height.
 *
 * A LINE LONGER THAN THE COLUMN WRAPS THERE, and its box is the column's width, a row per line it
 * needs — except the title, which `TimerCard` holds to one line and cuts at the column. So a box
 * never ends past the column, and a line that fills it lands on whatever the column reaches.
 */
export function artWordCard(input: {
  /** The screen's width, in points. */
  phone: number;
  /** The stop caption, set on one line: its width in points and its length in characters. */
  caption: { width: number; chars: number };
  lines: readonly ArtWordLine[];
  /** A feed's switch row, when the card draws one: its words, set on one line. */
  switchWords?: { width: number; height: number };
}): ArtWordCard {
  const w = ART_WORDS;
  const width = input.phone - 2 * w.gutter;
  const stop =
    2 * w.stop.side +
    w.stop.mark +
    w.stop.space +
    input.caption.width +
    w.stop.tracking * input.caption.chars;
  const column = Math.max(1, width - 2 * w.inset - stop - w.beside);
  const boxes: ArtWordBox[] = [];
  let y = w.inset;
  input.lines.forEach((line, i) => {
    if (i > 0) y += w.between;
    const rows = line.name === 'title' ? 1 : Math.max(1, Math.ceil(line.width / column - 1e-9));
    boxes.push({
      name: line.name,
      x0: w.inset,
      x1: w.inset + Math.min(line.width, column),
      y0: y,
      y1: y + rows * line.height,
      fill: 0,
    });
    y += rows * line.height;
  });
  if (input.switchWords) {
    y += w.aboveRow;
    const x0 = w.inset + w.switch.side + w.switch.glyph + w.switch.space;
    const mid = y + w.row / 2;
    boxes.push({
      name: 'switch',
      x0,
      x1: x0 + input.switchWords.width,
      y0: mid - input.switchWords.height / 2,
      y1: mid + input.switchWords.height / 2,
      fill: w.switch.fill,
    });
    const pill = x0 - w.inset + input.switchWords.width + w.switch.side;
    y += pill + w.rowGap + w.pause > column ? 2 * w.row + w.rowGap : w.row;
  }
  return { width, height: y + w.inset, column, boxes };
}

/** The four running cards that draw a picture, which are the four timers. */
export const ART_WORD_TIMERS = [
  'breastfeed',
  'sleep',
  'pump',
  'tummy',
] as const satisfies readonly TimerType[];
