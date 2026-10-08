/**
 * A MODULE AS A CARD — the numbers and the paint behind `ModuleCard` and `ModuleCardGrid` (the
 * owner, 2026-09-26, of More → What you track: *"add the icons to the first 4 modules too. remove
 * the desciprion for milk stash. redesign it as well … they can be in card tyle for each category,
 * where the border lights up a little in theme color if it's selected. make it look nicer"*). Pure
 * TypeScript, so the geometry and every color are held in node (`moduleCard.test.ts`); the
 * component only hands them to views.
 *
 * A CARD IS A SWITCH. Its picture (the owner's own, the one Today's tiles draw), its name, and
 * its state — and the whole card is the one target. ON is said three ways, so it is never said by
 * color alone: the edge lights up in the household's accent, the card takes a faint wash of it,
 * and a check sits in the corner where an empty ring sat. To a screen reader it is a switch with
 * the module's name and its checked state.
 *
 * TWO TO A ROW. The sections of What you track hold two, four and two modules (Every day,
 * Health record, When you want it) and the feeding section four and the stash — pairs, which is
 * what a grid of two says best. An odd last card spans its row rather than sitting beside a hole
 * (`StatTable`'s rule). One to a row when a name's longest word would not fit a half — the
 * phone's text size is uncapped for a card's name, as it is for any title.
 */
import type { ThemeName } from '../theme/theme';
import { space, type as typeScale, type Palette } from '../theme/theme';
import { composite, withAlpha } from '../theme/contrast';

export const MODULE_CARD = {
  /** The card's padding: the picture sits this far in from the top and the start. */
  pad: space.xl,
  /** Between the picture's row and the name. */
  gap: space.md,
  /**
   * The picture's disc, and the picture in it — Today's pebble tile exactly (`QUICK_HOLDER_PEBBLE`
   * and `QUICK_PEBBLE_GLYPH` in QuickAction.tsx), so a module is the same picture at the same size
   * on Today and here, and one large enough to read (the owner's set turns to mush under 28).
   */
  disc: 44,
  picture: 30,
  /**
   * The state in the corner: a check on the accent when on, an empty ring when off — Row's
   * checkbox a size down (26, a 2pt ring, a 15pt check there), because here the whole card is
   * the target and the mark is only its state.
   */
  mark: 24,
  markGlyph: 14,
  markRing: 2,
  /** The lit edge, drawn over the card's own hairline and a little wider than it. */
  edge: 1.5,
  /** Between two cards, across and down. */
  gridGap: space.md,
  /** The name: the bold UI face at the body's size. */
  titleSize: typeScale.bodyStrong.fontSize,
} as const;

/**
 * The shortest a card is: its padding, the picture's row and one line of its name — so cards whose
 * names are one line are one height, and a row of two stretches to its taller.
 */
export const MODULE_CARD_MIN_HEIGHT =
  2 * MODULE_CARD.pad +
  MODULE_CARD.disc +
  MODULE_CARD.gap +
  Math.ceil(MODULE_CARD.titleSize * 1.34);

/** And a card laid out across its row (`wide`): its padding and the picture's disc, the name beside it. */
export const MODULE_CARD_WIDE_MIN_HEIGHT = 2 * MODULE_CARD.pad + MODULE_CARD.disc;

/**
 * THE COMPACT CARD, for a page a parent sets once and rarely changes (2026-09-30, More → What you
 * track; the owner: *"The text for subcategories (how you feed, etc), in case all texts, look
 * defeated vs the modules … User won't do modifications much, so this just need to look nice and
 * clean"*).
 *
 * Thirteen full cards on one page, each 101 pt with a 44 pt picture and a lit edge, every one of
 * them on, were a wall the page's section titles could not stand up to: the eye read cards and no
 * sections. The compact card is a line rather than a poster: the picture small at the start, the
 * name beside it, 64 pt tall, two to a row. It is its own set of numbers beside `MODULE_CARD`, never
 * a shrinking of it, because the full card is also what `ChoiceCard` draws (setup's role, the
 * medicine form's kinds) and those are pages that ask, where a big target is the point.
 *
 * ON is the check badge on the picture's corner (a shape, so nothing is said by color alone), a
 * faint wash of the accent and a thin edge, and nothing glows; OFF is the plain card with its
 * picture faded (`moduleCardCompactPaint`).
 *
 * THE NAME'S ROOM decides the columns as the full card's does (`moduleCardColumns`): the card's
 * width less the picture, the gap and the padding either side. On a 360 pt phone that is 95 pt,
 * and the widest word a page prints, "Temperature", is 89; a 320 pt phone, or a larger text size,
 * takes one across, where every card is a full-width line.
 */
export const MODULE_CARD_COMPACT = {
  /** Above and below the picture: 14 + 36 + 14 is the 64 pt card. */
  padV: space.xl,
  /** Before the picture, and after the name: the name's side gives the room to the name. */
  padStart: space.lg,
  padEnd: space.md,
  /**
   * The picture's disc and the picture: still the owner's picture (`Icon` draws it from 16 pt up,
   * `illustrated.ts`), a size down from Today's so the card can be a line.
   */
  disc: 36,
  picture: 26,
  /** Between the picture and the name. */
  gap: space.md,
  /**
   * THE CHECK BADGE on the picture's lower corner: the accent with the `onAccent` check (Row's
   * checkbox, smaller), ringed in the card's own ground so it reads as laid on the picture, and out
   * past the disc by `badgeOut` so it is never mistaken for part of the drawing.
   */
  badge: 20,
  badgeRing: 2,
  badgeGlyph: 11,
  badgeOut: 3,
  /** The edge an ON card draws: a line, not an outline (the full card's is 1.5 with a glow). */
  edge: 1,
  /** An OFF card's picture, faded: the name stays whole, the picture steps back. */
  offPicture: 0.45,
} as const;

/** The compact card with a name on one line: its padding and the picture's disc (14 + 36 + 14). */
export const MODULE_CARD_COMPACT_MIN_HEIGHT =
  2 * MODULE_CARD_COMPACT.padV + MODULE_CARD_COMPACT.disc;

/**
 * THE WORDS A CARD PRINTS, AS WIDE AS THE FACE SETS THEM: Hanken Grotesk Bold advances, in em, read
 * out of the TTF the app ships (`@expo-google-fonts/hanken-grotesk/700Bold`), without kerning — so
 * each is a hair WIDER than the face draws it, which is the safe side. Every word of every name
 * What you track can print is here (the feeding answers, the milk stash, every extra, and
 * "Playtime", the household's other word for tummy time), every word of the four kinds a care
 * item can be, which `ChoiceCard` prints on the medicine form (2026-09-26), and the two answers to
 * setup's "Your role at home", whose tiles stay two across by the same rule (2026-09-27); the app's
 * own tests re-read the TTF and hold this table to it (`screens/more/whatYouTrack.test.ts`,
 * `sheets/care/careForm.test.ts`, `screens/onboarding/step1.test.ts`) — `pathCard.ts`'s rule, for
 * the same reason: an average per letter is wrong both ways, "Tummy" runs 0.67 em a letter with its
 * two m's and "Solids" 0.45.
 *
 * A word not in the table is charged `CARD_WORD_FALLBACK_EM` a letter — over the widest a word
 * here runs, with a margin — so a name nobody measured goes to one across sooner, never breaks.
 */
export const CARD_WORD_EM: Readonly<Record<string, number>> = {
  At: 1.041,
  the: 1.472,
  breast: 2.926,
  Pumping: 3.874,
  Bottles: 3.208,
  Solids: 2.716,
  Milk: 1.939,
  stash: 2.421,
  Diaper: 3.006,
  Sleep: 2.509,
  Vaccines: 4.084,
  Growth: 3.419,
  Medicine: 4.088,
  Temperature: 5.953,
  Bath: 2.088,
  Tummy: 3.369,
  time: 1.996,
  Playtime: 3.917,
  // the Health note (2026-10-08), and the word its fallback name would print
  Health: 2.99,
  note: 2.045,
  Wellbeing: 4.523,
  // the kinds a care item can be (the medicine form's picture cards); Medicine is above
  Vitamin: 3.482,
  Cream: 3.065,
  or: 0.998,
  ointment: 4.063,
  Other: 2.645,
  // setup's role question (the app's RolePicker)
  Parent: 3.006,
  Caregiver: 4.491,
};
export const CARD_WORD_FALLBACK_EM = 0.72;

/** How wide one word of a name is at a text scale of 1. */
export const cardWordWidth = (word: string): number =>
  (CARD_WORD_EM[word] ?? [...word].length * CARD_WORD_FALLBACK_EM) * MODULE_CARD.titleSize;

/** A card's width in a grid `gridWidth` wide at `columns` across. */
export const moduleCardWidth = (gridWidth: number, columns: number): number => {
  const n = Math.max(1, Math.floor(columns));
  return Math.max(0, (gridWidth - (n - 1) * MODULE_CARD.gridGap) / n);
};

/**
 * The room a card leaves its name at `columns` across: the full card's padding either side, or the
 * compact card's padding, picture and gap (`MODULE_CARD_COMPACT`).
 */
export const moduleCardNameRoom = (gridWidth: number, columns: number, compact = false): number =>
  moduleCardWidth(gridWidth, columns) -
  (compact
    ? MODULE_CARD_COMPACT.padStart +
      MODULE_CARD_COMPACT.disc +
      MODULE_CARD_COMPACT.gap +
      MODULE_CARD_COMPACT.padEnd
    : 2 * MODULE_CARD.pad);

/**
 * TWO ACROSS WHILE EVERY NAME'S LONGEST WORD FITS ITS HALF, ONE OTHERWISE. A name may take two
 * lines, but a word is never broken, so the question is the widest word at the reader's own text
 * size (`scale`, the body scale — a card's name is a title and grows uncapped). `compact` measures
 * the compact card's room, which the picture beside the name makes smaller.
 */
export function moduleCardColumns(
  gridWidth: number,
  scale: number,
  titles: readonly string[],
  compact = false,
): 1 | 2 {
  const room = moduleCardNameRoom(gridWidth, 2, compact);
  const widest = Math.max(
    0,
    ...titles.flatMap(t => t.split(/\s+/).filter(Boolean)).map(cardWordWidth),
  );
  return widest * Math.max(scale, 0) <= room ? 2 : 1;
}

/** The cards in rows of `columns`; an odd last row is one card, which spans it. */
export function moduleCardRows<T>(cards: readonly T[], columns: number): T[][] {
  const per = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < cards.length; i += per) rows.push(cards.slice(i, i + per));
  return rows;
}

/* ------------------------------------------------------------------------------ the paint */

/**
 * The faint wash an ON card takes, of the accent — enough to lift it off its neighbors, never
 * enough to move its words. It is laid OVER the card, words and all (`ModuleCard.tsx` says why),
 * so `moduleCard.test.ts` measures the words, the picture's disc and the check through it: text
 * and secondary text at 4.5:1 on the washed card, in every theme, scheme and design.
 */
export const CARD_WASH = 0.08;
/**
 * The glow round an ON card, of the accent at this strength — the "lights up a little". Painted
 * outside the card (a box shadow), so it takes no room and nothing shows through a glass card.
 * None in the amber Night — nothing on that screen glows — and none on a design that draws no
 * shadows (Paper): a flat card lit by a halo would be a second material. The edge, the wash and
 * the check say it there, which is three ways already.
 */
export const CARD_GLOW = 0.28;
export const CARD_GLOW_BLUR = 12;

export interface ModuleCardPaint {
  /** The lit edge, or null for the card's own hairline alone. */
  edge: string | null;
  /** The wash inside the edge, or null. */
  wash: string | null;
  /** The glow outside it, or null. */
  glow: string | null;
  /** The corner mark: its fill (null for an empty ring), its ring, and the check. */
  markFill: string | null;
  markRing: string;
  check: string;
}

/**
 * What a card is painted, on and off — every value a role the theme already has. The corner mark
 * is the design system's own checkbox (Row's: a `line2` ring when empty, the accent with an
 * `onAccent` check when filled), so a module that is on looks ticked the way a ticked line does.
 * `glows` is whether the design draws shadows at all (`skinTokens.surface.shadow !== 'none'`).
 */
export function moduleCardPaint(
  p: Palette,
  on: boolean,
  theme: ThemeName,
  glows = true,
): ModuleCardPaint {
  if (!on)
    return {
      edge: null,
      wash: null,
      glow: null,
      markFill: null,
      markRing: p.line2,
      check: p.onAccent,
    };
  return {
    edge: p.accent,
    wash: withAlpha(p.accent, CARD_WASH),
    glow: theme === 'night' || !glows ? null : withAlpha(p.accent, CARD_GLOW),
    markFill: p.accent,
    markRing: p.accent,
    check: p.onAccent,
  };
}

/**
 * THE COMPACT CARD'S EDGE, of the accent at this strength: a line that says the card is lit, drawn
 * softer than the full card's so thirteen cards that are all on read as a list and not as thirteen
 * outlines. It is not what carries the state: the check badge is, at 3:1 on the washed card and its
 * check at 3:1 on the badge (`moduleCard.test.ts`), with the wash as the third sign.
 */
export const CARD_COMPACT_EDGE = 0.5;

export interface ModuleCardCompactPaint {
  /** The thin edge and the wash inside it, ON; null OFF, where the card keeps its own hairline. */
  edge: string | null;
  wash: string | null;
  /** The check badge: its fill, the ring that lays it on the picture, and the check. */
  badgeFill: string;
  badgeRing: string;
  check: string;
  /** The picture's opacity: whole ON, faded OFF. */
  picture: number;
}

/**
 * What a compact card is painted, on and off — every value a role the theme already has. The badge
 * is drawn only while the card is on; its ring is the card's own ground washed as the card is, so
 * the badge sits on the picture's corner as if cut out of the card.
 */
export function moduleCardCompactPaint(p: Palette, on: boolean): ModuleCardCompactPaint {
  return {
    edge: on ? withAlpha(p.accent, CARD_COMPACT_EDGE) : null,
    wash: on ? withAlpha(p.accent, CARD_WASH) : null,
    badgeFill: p.accent,
    badgeRing: composite(p.surfaceSolid, p.accent, CARD_WASH),
    check: p.onAccent,
    picture: on ? 1 : MODULE_CARD_COMPACT.offPicture,
  };
}
