/**
 * The tab bar's layout arithmetic (docs/DESIGN_SYSTEM.md §13 "Tab labels", §23.1), pure so the
 * WP3 acceptance test — "no tab label may overflow its cell at 430px width, in any treatment or
 * locale" — runs in node without React Native.
 *
 * The bar is inset 12 from the screen edges and padded 10 inside, and the cells share what is
 * left equally — the log button is above the bar, not in it (`FAB_SIZE`). A label's rendered
 * width is ESTIMATED, not measured: React Native cannot measure text before it lays it out, and
 * a bar that resized after its first frame would jump. The estimate is characters × font size ×
 * an average advance width, so a locale whose words are longer than English is caught here, by a
 * test, rather than on a device.
 *
 * Three label policies, and the policy chooses the label and nothing else (§23.1): `icons` draws
 * no label (font size 0); `focus` sets the current tab at 11.5/800 in the accent and the rest at
 * 9.5/600 in `text2`; `rounded` labels every tab at the same 9.5, the current one heavier. Size
 * may change with the state; color never animates (§13).
 *
 * THE FIT. The contract's sizes do not always fit the contract's cells: "Community" at 11.5 is
 * 58px by the estimate and a cell at 375 is 54px, and at the chrome font-scale cap (1.6,
 * docs/MOBILE.md §9) every label is wider than every cell at every width. So each cell carries
 * two sizes — `nominalFontSize`, what the policy specifies at this scale, and `fontSize`, what
 * the bar draws — and the reduction between them is explicit (`fitted`, and the row's `fit`
 * factor), never silent. The fit is ONE factor for the whole row: the label that needs the most
 * room sets it, and every label shrinks by it, so the hierarchy is a ratio the fit preserves —
 * the current tab is never smaller than an inactive one under `focus`, and every tab stays the
 * same size under `rounded`, at any width and any scale. (Fitting the two states separately
 * inverted the hierarchy at 1.6: the inactive labels fitted at 12 while "Community" fitted at
 * 10.75.) The prototype's own ≤379px rule, which drops the current label from 11.5 to 11 by
 * hand, is the same reduction made by eye; the fit lands a quarter step below it at 375,
 * because 11 is still 1px over by this estimate.
 *
 * Below `TAB_LABEL_MIN` a label stops shrinking and is flagged `overflow` instead — small type
 * in `text2` is the floor the sweep set (§12 rule 5; the 9.5 of §13 is already the documented
 * exception), and hiding the failure behind an unreadable label would defeat the test. The floor
 * is the one thing that breaks the ratio, and it breaks it toward readability: a label clamped
 * at the floor can equal the current label, never exceed it.
 *
 * The OS font scale is applied HERE, capped by the caller at the chrome cap, so the returned
 * `fontSize` is the size to draw and the bar turns `allowFontScaling` off — otherwise the scale
 * would be applied twice and the fit would be a lie.
 */
import type { TabLabelPolicy } from '../theme/appearance';

/**
 * NIBBLECUE'S FIVE (2026-10-08): Today · Plan · Foods · Shopping · More, the bar CuddleCue draws
 * with NibbleCue's destinations in it (docs/PRODUCT.md). The history below is CuddleCue's and is
 * kept because the layout it proved is the one this bar still uses.
 *
 * The destinations, in bar order. SIX exist and at most SIX are drawn.
 *
 * COMMUNITY IS NOT ONE OF THEM. It used to be the seventh, feature-flagged and first to yield
 * its cell; it is now a pushed page reached from More and is not a tab at any width (the owner,
 * 2026-09-17: "just show the module in more"). Leaving a key here for a destination the bar can
 * never draw would keep it in every `Record<TabKey, …>` in the app for nothing.
 *
 * The order is the owner's, 2026-09-16: "home → stash → shopping → schedule → reports → More.
 * Three on the left and three on the right, with the quick add button in the middle. The quick
 * add button can be smaller to fit the extra module." So the log button came down from 56 to
 * 48, which is what buys the sixth cell: at 375 six cells share 279px rather than 271.
 */
export const TAB_LABELS = {
  today: 'Today',
  plan: 'Plan',
  foods: 'Foods',
  // NibbleCue's word for CuddleCue's shopping list (the owner, 2026-10-08: "shopping can be
  // replaced with grocery"); the key stays `shopping`, the shared list underneath is one list
  shopping: 'Grocery',
  more: 'More',
} as const;

/**
 * How many cells the bar draws at once.
 *
 * SIX, which is where it started: Today · Stash · Shopping · Schedule · Reports · More. That is
 * the owner's own order (2026-09-16), and it is what they came back to — "I want today, stash,
 * shopping, schedule and more, at the very least. I don't want shopping hidden in More: stash
 * and the shopping list and today's schedule are our selling point."
 *
 * IT WENT TO FOUR AND CAME BACK, and every move was about the log button, not the destinations.
 * Six read as too full when every cell carried a LABEL, so Reports moved to More and the More
 * cell became a chevron; then centring the button forced an even count, and five cannot be
 * split. Both of those constraints are gone now that the button is not in the row at all
 * (`FAB_SIZE`): the cells are one flat row that divides equally at any count. (This once
 * rested on the `icons` label policy — six glyphs at 55px apiece on a 375px phone. Since
 * 2026-09-18 appearance.ts forces `rounded`, every cell labeled, and the bar shows five: Reports
 * moved to More. Six stays the ceiling the layout is proved for.)
 */
export const TAB_BAR_MAX_CELLS = 6;
export type TabKey = keyof typeof TAB_LABELS;
export const TAB_KEYS = Object.keys(TAB_LABELS) as TabKey[];

/** The bar sits 12 from each screen edge (§23.1). */
export const TAB_BAR_INSET = 12;
/** The bar's offset from the safe-area foot: it floats, it does not sit on the edge. */
export const TAB_BAR_BOTTOM = 10;
/** Inside the bar, 10 each side, so the outer cells do not touch the pill's curve. */
export const TAB_BAR_PADDING = 10;
/**
 * THE LOG BUTTON SITS ABOVE THE BAR, CENTRED, AND IS NOT A CELL OF IT.
 *
 * It used to be cut into the bar's top edge, which is why the cells were unequal: a button in
 * the middle of the row splits the bar in two, and two halves hold the same number of cells
 * only at an EVEN count. At five destinations the left three were 46.5px wide and the right two
 * 69.75 — a 50% difference in the pitch of the glyphs, which is what a bar reads as when it
 * looks wrong (the owner, 2026-09-16: "fix the menu bar on the bottom (today stash shopping),
 * redesign this as this looks very bad"). Splitting the bar into two half-width GROUPS had
 * centred the button but made that unevenness worse, not better.
 *
 * There is no arrangement that is both: equal cells around a centred button need an even count,
 * and the destinations are five. So the button leaves the row. The bar becomes one flat row of
 * equal cells at any count, and the button floats above it, on the centre line — still "in the
 * middle" (the owner, 2026-09-16), still the largest control in the chrome, and now the only
 * thing in the chrome that is not on the cells' grid.
 *
 * It costs vertical room, which `screenBottomPadding` budgets, and it is the only cost.
 */
/**
 * 44 AND NOT 48 (the owner, 2026-09-19: "make the + quick log button smaller and add supplies
 * higher, so they dont clash"). It is still the largest control in the chrome and still exactly
 * the minimum tap target (`hit.min`), so nothing about reaching it changed — what changed is how
 * much of the screen's bottom-right corner it claims for a screen that floats an action of its
 * own there.
 */
export const FAB_SIZE = 44;
/** Clear space between the button's foot and the bar's top edge. */
export const FAB_GAP = 8;
/** The glyph in a cell (§23.1: 23px). */
export const TAB_GLYPH = 23;

/* The bar's vertical geometry (the prototype's block 12040): the pill pads 9, a cell pads
 * 7 over and 12 under its label — or 8 and 8 with no label — and the current-tab dot sits
 * 1 px off the cell's foot. So a label has 12 − 1 − 5 = 6 px of clear space above the dot,
 * and the icons-only bar is 19 px shorter than a labelled one: it carries no line of type. */
export const TAB_BAR_PAD = 7;
export const TAB_DOT = 5;
export const TAB_DOT_FOOT = 1;
export const TAB_LABEL_GAP = 2;
export const TAB_CELL_PAD: Record<TabLabelPolicy, { top: number; bottom: number }> = {
  icons: { top: 7, bottom: 7 },
  focus: { top: 6, bottom: 10 },
  rounded: { top: 6, bottom: 10 },
};
/** The tallest label line the policy draws, at 1× — the current tab's size in `TAB_TYPE`. */
const TAB_LABEL_LINE: Record<TabLabelPolicy, number> = {
  icons: 0,
  focus: Math.ceil(11.5 * 1.15),
  rounded: Math.ceil(9.5 * 1.15),
};

/** The bar's height for a policy: padding, the glyph, the label line where there is one. */
export function tabBarHeight(policy: TabLabelPolicy): number {
  const pad = TAB_CELL_PAD[policy];
  const label = TAB_LABEL_LINE[policy];
  return (
    2 * TAB_BAR_PAD + pad.top + TAB_GLYPH + (label > 0 ? TAB_LABEL_GAP + label : 0) + pad.bottom
  );
}

/** Clear space between the label's foot (or the glyph's) and the dot. */
export function tabDotClearance(policy: TabLabelPolicy): number {
  return TAB_CELL_PAD[policy].bottom - TAB_DOT_FOOT - TAB_DOT;
}

/**
 * Average advance width of a lowercase-heavy English word, in em, for a humanist sans at
 * weight 600–800. Measured on Hanken Grotesk Bold: "Community" at 100px sets 561px wide
 * (0.62em/char) and "Today" 262px (0.52em/char); "Schedule" 0.56, "Reports" 0.55, "More"
 * 0.59. The mean over the labels is 0.56em. It errs slightly wide for short words and
 * slightly narrow for "Community", the one label that decides the fit, which is why the
 * test also holds a margin at 430.
 */
export const GLYPH_WIDTH_EM = 0.56;

/** Below this a tab label is not read, only seen; the cell is flagged instead of shrinking. */
export const TAB_LABEL_MIN = 9;

export type TabWeight = 600 | 700 | 800;

interface TabType {
  size: number;
  weight: TabWeight;
}

/** The nominal type per policy and state (§13 "Tab labels", §23.1, the prototype's block). */
export const TAB_TYPE: Record<TabLabelPolicy, { current: TabType; rest: TabType }> = {
  icons: { current: { size: 0, weight: 800 }, rest: { size: 0, weight: 600 } },
  focus: { current: { size: 11.5, weight: 800 }, rest: { size: 9.5, weight: 600 } },
  rounded: { current: { size: 9.5, weight: 800 }, rest: { size: 9.5, weight: 700 } },
};

export interface TabCell {
  label: string;
  /** The cell's share of the bar, in px. */
  width: number;
  /** The size the policy specifies for this cell at this font scale; 0 = no label. */
  nominalFontSize: number;
  /** The size to draw: the nominal, brought down by the row's fit, never below the floor. */
  fontSize: number;
  weight: TabWeight;
  /** True when the label had to come down from its nominal size to fit its cell. */
  fitted: boolean;
  /** True when the label does not fit its cell even at the floor: its estimated width > `width`. */
  overflow: boolean;
}

export interface TabLayout {
  cells: TabCell[];
  fabWidth: number;
  /** Every cell's width: the bar divides equally, because the button is not one of them. */
  cellWidth: number;
  /** The bar's content width, after the inset and the padding. */
  innerWidth: number;
  /** The factor every label was scaled by to fit its cell: 1 = nothing was reduced. */
  fit: number;
}

/** Characters as a person counts them (code points), not UTF-16 units. */
export const estimateLabelWidth = (label: string, fontSize: number): number =>
  Array.from(label).length * fontSize * GLYPH_WIDTH_EM;

/** Quarter-pixel steps, so a fitted size does not jitter as the width changes by a pixel. */
const quarter = (n: number): number => Math.floor(n * 4) / 4;

/** Float slack on the comparison: a label fitted to exactly its cell is not an overflow. */
const EPSILON = 1e-9;

export function tabLayout(
  labels: string[],
  barWidth: number,
  policy: TabLabelPolicy,
  fontScale: number,
  currentIndex: number,
): TabLayout {
  const innerWidth = Math.max(0, barWidth - 2 * TAB_BAR_INSET - 2 * TAB_BAR_PADDING);
  const fabWidth = FAB_SIZE;
  /**
   * EVERY CELL THE SAME WIDTH, at every count. The button is not in the row (`FAB_SIZE` says
   * why), so there is nothing to divide around: the cells share the bar, and the pitch of the
   * glyphs is even whether the bar holds four of them or six.
   */
  const cellWidth = labels.length === 0 ? 0 : innerWidth / labels.length;
  const widthAt = (): number => cellWidth;
  const type = TAB_TYPE[policy];
  const nominal = labels.map((_, i) =>
    Math.max(0, (i === currentIndex ? type.current.size : type.rest.size) * fontScale),
  );
  // the label that needs the most room, in its own cell, sets the factor for the whole row
  const fit = labels.reduce((f, label, i) => {
    const needed = estimateLabelWidth(label, nominal[i] ?? 0);
    return needed > 0 ? Math.min(f, widthAt() / needed) : f;
  }, 1);
  const cells = labels.map((label, i) => {
    const isCurrent = i === currentIndex;
    const nominalFontSize = nominal[i] ?? 0;
    // the floor: 9, or the nominal itself when the OS asked for smaller type than that
    const floor = Math.min(nominalFontSize, TAB_LABEL_MIN);
    const fontSize =
      nominalFontSize <= 0
        ? 0
        : fit >= 1
          ? nominalFontSize
          : quarter(Math.max(floor, nominalFontSize * fit));
    return {
      label,
      width: widthAt(),
      nominalFontSize,
      fontSize,
      weight: isCurrent ? type.current.weight : type.rest.weight,
      fitted: fontSize < nominalFontSize,
      overflow: fontSize > 0 && estimateLabelWidth(label, fontSize) > widthAt() + EPSILON,
    };
  });
  return { cells, fabWidth, cellWidth, innerWidth, fit };
}
