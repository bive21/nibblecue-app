/**
 * THE TWO WAYS IN, AS NUMBERS AND COLORS — version two (the owner, 2026-09-26, the same day as the
 * first: *"the start feeding and already finished module, feels basic, i like the little animation
 * added on start, but this can be redesign to where the icon still stays where it is, and the start
 * feeding becomes 2 rows on the right side of the icon … same with already finish, but perhaps do
 * inverted color for when showing for already finish, so instead of dark pink border, and pink
 * background, do still dark pink [border], but white background"*).
 *
 * Pure TypeScript, so the whole design is measured in node (`pathCard.test.ts`) — this package's
 * tests cannot render React Native — and `PathCard.tsx` only draws what these return.
 *
 * WHAT IT IS NOW. Two tiles side by side. In each, the route's disc sits at the left, where it
 * always was, and the title is set BESIDE it on two rows — "Start" over "feeding", "Already" over
 * "finished" — the break at the first space (`pathTitleRows`):
 *
 *   ╭──────────────────╮  ╭──────────────────╮
 *   │ (▶)  Start       │  │ (◷)  Already     │   Start: the module's own fill, a disc of its ink
 *   │      feeding     │  │      finished    │   Finished: the SURFACE, edged in the ink, and a
 *   ╰──────────────────╯  ╰──────────────────╯     disc of the module's fill carrying an ink clock
 *
 * WHY THE TITLE ON TWO ROWS, AND NOT A TITLE AND A SECOND LINE. The alternative was the title on
 * one row with a short line under it ("Start" / "times each side"). That second line is the
 * consequence text the owner removed from every module the same morning (*"this is pretty self
 * explanatory and not needed"*), and at 3 a.m. it is one more thing to read before the tap. Split
 * at the first space, the one title the tile always had becomes a block as tall as the disc beside
 * it — two 15 pt lines are 39 pt against the 40 pt disc — so the tile is a tidy 64 pt band instead
 * of the 90 pt stack it was, the verb is the first word the eye lands on after the glyph, and a
 * screen reader still hears the one title. Nothing new is written anywhere.
 *
 * IT FITS AT EVERY WIDTH AND TEXT SIZE, OR IT STACKS (`pathTileLayout`). Beside the disc a title
 * has the tile less its padding, the disc and the gap: 82 pt on a 360 dp Android, 62 pt on the
 * 320 pt phone. The row checks every WORD of both titles against that room at the phone's text
 * size (capped, as chrome is, at `PATH_TITLE_CAP`); a title may wrap between words ("Start" /
 * "tummy" / "time") but never inside one. Where a word would not fit — the 320 pt phone past
 * about 1.1×, a 360 dp one past about 1.4×, a 375 pt one past about 1.5×, a larger phone never —
 * BOTH tiles go back to the disc over the title, so the pair never disagrees about its own shape
 * and no word is ever broken or cut.
 *
 * THE INVERSION IS THE OWNER'S, AND IT IS ALSO THE MEANING. Start is the module's fill with a
 * solid disc of its ink — the live, loud route, and the one that breathes. Already finished is the
 * same colors turned inside out: the page's own surface (white in light), outlined in the module's
 * ink even at rest, with a disc of the module's fill and the clock drawn in the ink. Two routes,
 * one family, and never mistaken for each other at a glance.
 *
 * CHOSEN IS SAID THREE WAYS, NEVER BY COLOR ALONE (CLAUDE.md §6): the tile's edge becomes a 3 pt
 * ink ring (SHAPE and WEIGHT — twice the finished tile's resting 1.5 pt and three times the start
 * tile's hairline), drawn inside its edge so nothing it holds moves; a CHECK in a disc of its own
 * lands on the route disc's lower corner, cut out of it by a ring of the tile; and the radio's
 * checked state says the same to a screen reader.
 */
import { composite } from '../theme/contrast';
import { moduleSoft } from '../theme/moduleAccent';
import { TINT_EDGE } from '../theme/skins';
import {
  moduleCardFill,
  moduleColor,
  type as typeScale,
  type moduleDisc,
  type Palette,
  type ThemeName,
} from '../theme/theme';
import type { IconName } from '../icons/paths';

/** Which route a tile is: time it live, or enter one already done. */
export type PathKind = 'start' | 'finished';

/** A module a path row can be painted in: one with an ink role and a card fill of its own. */
export type PathModule = keyof typeof moduleColor & keyof typeof moduleDisc;

/** How the pair is laid out: the title beside the disc (the design), or under it (the fallback). */
export type PathLayout = 'beside' | 'stacked';

/**
 * THE GLYPH IS THE ROUTE. Play for a timer that starts on the tap; a clock for a time that has
 * already been. Not a check for "finished": the check is what marks the CHOSEN tile, and a tile
 * that wore one at rest would look chosen before it was touched. Both are one-ink line glyphs with
 * no picture in the illustrated set, so the disc can paint them in its own pair at any size.
 */
export const PATH_GLYPH: Readonly<Record<PathKind, IconName>> = {
  start: 'play',
  finished: 'clock',
};

/**
 * THE TILE, in points.
 *
 *   `pad`        all round, the border drawn INSIDE it (`padding = pad − border`)
 *   `disc`       the route's disc, at the left; `glyph` its mark
 *   `gap`        between the disc and the title beside it
 *   `stackGap`   between the disc and the title under it, when the pair has stacked
 *   `edge`       the resting border: a hairline on Start, the ink's 1.5 on Finished (the owner's
 *                "still dark pink border")
 *   `ring`       the chosen border, heavier than either resting one — twice the finished edge
 *   `badge`      the check's disc, hanging `badgeOut` past the route disc's lower right corner,
 *                cut out of it by a `badgeCut` ring of the tile; `check` the glyph in it
 */
export const PATH_TILE = {
  pad: 12,
  disc: 40,
  glyph: 20,
  /** The clock's line, a little heavier than the sprite's 1.7 so it holds at a glance. */
  glyphStroke: 2.1,
  gap: 10,
  stackGap: 8,
  edge: { start: 1, finished: 1.5 },
  ring: 3,
  badge: 20,
  badgeCut: 2,
  badgeOut: 4,
  check: 11,
} as const;

/** The title's size: the bold body face, 15 pt, and the line the platform sets it on (about 1.3). */
export const PATH_TITLE_SIZE = typeScale.bodyStrong.fontSize;
export const PATH_TITLE_LINE = 1.3;

/**
 * HOW FAR THE TITLE GROWS WITH THE PHONE'S TEXT SIZE: the chrome cap (`CHROME_FONT_CAP` in
 * `Text.tsx`, which this file cannot import — it is React Native). A tile's title names a control
 * in a box half a phone wide; past 1.6× there is no layout of two tiles in which a word fits.
 */
export const PATH_TITLE_CAP = 1.6;

/**
 * THE WORDS A TILE PRINTS, AS WIDE AS THE FACE SETS THEM: Hanken Grotesk Bold advances, in em,
 * read out of the TTF the app ships (`@expo-google-fonts/hanken-grotesk/700Bold`), without kerning
 * — so each is a hair WIDER than the face draws it, which is the safe side. Every word of every
 * title the copy can put on a tile is here (`TIMER_PATH`, and "playtime", the household's other
 * word for tummy time); the app's own test re-reads the TTF and holds this table to it.
 *
 * A word not in the table is charged `PATH_WORD_FALLBACK_EM` a character — the widest a lower-case
 * word runs in this face ("tummy", 0.63 em a letter, with its two m's) with a margin — so a title
 * the copy has not been measured for stacks sooner rather than breaks.
 */
export const PATH_WORD_EM: Readonly<Record<string, number>> = {
  Start: 2.281,
  feeding: 3.335,
  pumping: 3.886,
  sleeping: 3.737,
  tummy: 3.152,
  time: 1.996,
  playtime: 3.929,
  Already: 3.574,
  finished: 3.553,
};
export const PATH_WORD_FALLBACK_EM = 0.66;

/** A word's width at `size` points. */
export const pathWordWidth = (word: string, size: number): number =>
  (PATH_WORD_EM[word] ?? Array.from(word).length * PATH_WORD_FALLBACK_EM) * size;

/**
 * THE TITLE ON ITS TWO ROWS: split at the first space, so the verb stands on the first ("Start",
 * "Already") and what it is about on the second ("feeding", "tummy time", "finished"). A one-word
 * title is one row. The screen reader never sees the split: the tile is named by the whole title.
 */
export function pathTitleRows(title: string): string[] {
  const trimmed = title.trim();
  const at = trimmed.indexOf(' ');
  return at === -1 ? [trimmed] : [trimmed.slice(0, at), trimmed.slice(at + 1).trim()];
}

/** One tile's width in a row `rowWidth` wide with `rowGap` between the two. */
export const pathTileWidth = (rowWidth: number, rowGap: number): number => (rowWidth - rowGap) / 2;

/** The room a title's rows have in a tile of this row, in each layout. */
export function pathTitleRoom(rowWidth: number, rowGap: number, layout: PathLayout): number {
  const inner = pathTileWidth(rowWidth, rowGap) - 2 * PATH_TILE.pad;
  return layout === 'beside' ? inner - PATH_TILE.disc - PATH_TILE.gap : inner;
}

/** Whether every word of `title` fits `room` at the phone's text size — wrapped between words, never inside one. */
export const pathTitleFits = (title: string, room: number, fontScale: number): boolean => {
  const size = PATH_TITLE_SIZE * Math.min(fontScale, PATH_TITLE_CAP);
  return title
    .split(/\s+/)
    .filter(Boolean)
    .every(word => pathWordWidth(word, size) <= room + 1e-9);
};

/**
 * THE PAIR'S LAYOUT, decided once for both tiles (see the header). `rowWidth` 0 is a row not yet
 * measured: it is drawn beside, the layout every phone gets at its own text size.
 */
export function pathTileLayout(
  rowWidth: number,
  rowGap: number,
  fontScale: number,
  titles: readonly string[],
): PathLayout {
  if (!(rowWidth > 0)) return 'beside';
  const room = pathTitleRoom(rowWidth, rowGap, 'beside');
  return titles.every(title => pathTitleFits(title, room, fontScale)) ? 'beside' : 'stacked';
}

/**
 * How many lines a title takes in `room` at the phone's text size: its words set greedily, each
 * row of `pathTitleRows` starting a line of its own. What the tile's height is built from.
 */
export function pathTitleLines(title: string, room: number, fontScale: number): number {
  const size = PATH_TITLE_SIZE * Math.min(fontScale, PATH_TITLE_CAP);
  const space = 0.25 * size;
  return pathTitleRows(title).reduce((lines, row) => {
    let used = 0;
    let count = 1;
    for (const word of row.split(/\s+/).filter(Boolean)) {
      const w = pathWordWidth(word, size);
      if (used > 0 && used + space + w > room) {
        count += 1;
        used = w;
      } else used += (used > 0 ? space : 0) + w;
    }
    return lines + count;
  }, 0);
}

/** The smallest tile, for a title of `lines` lines at `lineHeight`, in either layout. */
export function pathTileMinSize(
  rowWidth: number,
  rowGap: number,
  lineHeight: number,
  layout: PathLayout = 'beside',
  lines = 2,
): { width: number; height: number } {
  const text = lines * lineHeight;
  const body =
    layout === 'beside'
      ? Math.max(PATH_TILE.disc, text)
      : PATH_TILE.disc + PATH_TILE.stackGap + text;
  return { width: pathTileWidth(rowWidth, rowGap), height: 2 * PATH_TILE.pad + body };
}

/**
 * THE MOTION, all on the native driver and all of it off when `pathStill` says so. Unchanged from
 * the first tile — the owner: *"i like the little animation added on start"*.
 *
 *   * A PRESS gives a small spring: the tile dips to `pressScale` while the finger is down and
 *     springs back past 1 and home when it lifts — the chosen tile's "yes".
 *   * THE CHECK pops in from `badgeFrom` on the same spring when a tile becomes the chosen one.
 *   * THE PULSE: a ring of the module's ink leaves the Start disc and fades as it grows, once every
 *     `ms + restMs`, only while neither tile is chosen — a live timer is one tap away, and once a
 *     route is picked the eye belongs to the form under it, so the ring stops.
 */
export const PATH_MOTION = {
  pressScale: 0.95,
  pressMs: 90,
  spring: { friction: 4.5, tension: 190 },
  badgeFrom: 0.4,
  pulse: { toScale: 1.55, peakOpacity: 0.45, ms: 1300, restMs: 1100 },
} as const;

/**
 * NOTHING MOVES UNDER REDUCE MOTION OR IN THE AMBER NIGHT, and nothing glows in the Night either
 * (`pathTileColors` has no pulse there). The chosen tile is drawn chosen at once, the check simply
 * there, and a press changes nothing but the tile's opacity for as long as the finger is down.
 */
export const pathStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  reduceMotion || theme === 'night';

/** What the pulse ring draws from a value running 0 → 1: its scale, and its fade to nothing. */
export function pathPulseFrames(): {
  scale: { inputRange: number[]; outputRange: number[] };
  opacity: { inputRange: number[]; outputRange: number[] };
} {
  return {
    scale: { inputRange: [0, 1], outputRange: [1, PATH_MOTION.pulse.toScale] },
    opacity: { inputRange: [0, 1], outputRange: [PATH_MOTION.pulse.peakOpacity, 0] },
  };
}

export interface PathTileColors {
  /** The tile: the module's card fill on Start; the surface on Already finished. */
  ground: string;
  /** The resting edge: a hairline of the fill pulled toward the ink on Start; the ink on Finished. */
  edge: string;
  /** The chosen outline: the module's ink, 3:1 on the tile inside it and the sheet outside it. */
  ring: string;
  /** The route's disc and its glyph: ink with the fill on Start, the fill with the ink on Finished. */
  disc: string;
  glyph: string;
  /** The check's disc and its glyph, and the ring of tile that cuts it out of the route disc. */
  badge: string;
  check: string;
  cut: string;
  /** The title: the page's own ink, 4.5:1 on the tile. */
  title: string;
  /** The Start disc's breathing ring; null on Finished, and in the Night, where nothing glows. */
  pulse: string | null;
}

/**
 * THE TILE'S COLORS, FROM THE PALETTE AND NOTHING ELSE. `module` null is a row painted in the
 * scheme's accent — a PathRow outside a module sheet, which none is today.
 */
export function pathTileColors(
  palette: Palette,
  module: PathModule | null,
  theme: ThemeName,
  kind: PathKind = 'start',
): PathTileColors {
  /*
    SOFT ON A LOG SHEET (the owner, 2026-10-06: "way too intense", of breastfeed's Start feeding):
    the start tile is the module's light wash with a pastel edge, its disc and ring the muted ink; the finished tile is the sheet's white, outlined in that muted ink. Night
    keeps the pair below. `moduleSoft` measures every one.
  */
  if (module !== null && theme !== 'night') {
    const soft = moduleSoft(palette, module, theme);
    if (kind === 'finished') {
      const ground = palette.surfaceSolid;
      return {
        ground,
        edge: soft.deep,
        ring: soft.deep,
        disc: soft.wash,
        glyph: soft.deep,
        badge: soft.deep,
        check: ground,
        cut: ground,
        title: palette.text,
        pulse: null,
      };
    }
    return {
      ground: soft.wash,
      edge: soft.edge,
      ring: soft.deep,
      disc: soft.deep,
      glyph: soft.wash,
      badge: soft.deep,
      check: soft.wash,
      cut: soft.wash,
      title: palette.text,
      pulse: soft.deep,
    };
  }
  const ink = module === null ? palette.accent : (palette[moduleColor[module]] as string);
  const fill = module === null ? palette.accentSoft : moduleCardFill(palette, module, theme);
  if (kind === 'finished') {
    // the same pair turned inside out: the page's own surface, edged and drawn in the ink
    const ground = palette.surfaceSolid;
    return {
      ground,
      edge: ink,
      ring: ink,
      disc: fill,
      glyph: ink,
      badge: ink,
      check: ground,
      cut: ground,
      title: palette.text,
      pulse: null,
    };
  }
  return {
    ground: fill,
    edge: composite(fill, ink, TINT_EDGE),
    ring: ink,
    disc: ink,
    glyph: fill,
    badge: ink,
    check: fill,
    cut: fill,
    title: palette.text,
    pulse: theme === 'night' ? null : ink,
  };
}
