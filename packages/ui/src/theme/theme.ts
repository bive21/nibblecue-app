/**
 * Theme for React Native, generated from ./design-tokens.json (the app's tokens).
 * Keep this file generated, not hand-edited: `pnpm tokens:build` should read the JSON
 * and emit this file plus the admin portal's CSS variables, so one palette change
 * updates app, widgets and admin at once.
 *
 * Three themes, not two: light, dark and NIGHT (an amber-dim mode for 2 AM feeds).
 * Night is a user choice, not a system state — it cannot be derived from the OS.
 */
import { composite } from './contrast';
export type ThemeName = 'light' | 'dark' | 'night';

const light = {
  page: '#D9EBEC', pageWarm: '#FCE9E1', pageCool: '#DCE8F2',
  app: '#EFF7F7', app2: '#FFF1EA',
  /**
   * THE PAPER GROUND — a warm, neutral off-white, the same in every color scheme.
   *
   * `app` is the lit ground and a scheme OVERRIDES it (Ocean's is a pale blue, Sunny's is a pale
   * cream): that is correct for Today, where the household's color is the point of the screen.
   * It is wrong for a page that is a stack of white cards with almost nothing colored on it —
   * the tint has nothing to sit against and reads as a cast over the paper rather than a choice
   * (the shopping brief, 2026-09-19: "page background changes to the warm off-white … remove the
   * current gradient/lavender backgrounds on these screens").
   *
   * So it is a THEME role and not a scheme one, which is the whole reason it can exist: it is
   * listed nowhere in `resolvePalette`'s overlay, so all six schemes get the same paper and the
   * accent is the only thing on the page carrying the household's color. Dark and night keep
   * their own dim grounds — the brief's hex is a LIGHT-theme value, and a warm off-white in dark
   * mode is the one thing a dark theme must not have (CLAUDE.md §4: light and dark are a
   * platform expectation, not a preference). `Screen page="paper"` opts a screen in; Supplies
   * and Shopping are the first two, and it rolls out from there.
   */
  paper: '#F6F3EC',
  surface: 'rgba(255,255,255,0.86)', surfaceSolid: '#FFFFFF',
  surface2: '#E7F1F1', surface3: '#D8E8E9',
  line: 'rgba(18,52,59,0.15)', line2: 'rgba(18,52,59,0.30)',
  text: '#12343B', text2: '#3D5F66', text3: '#5C7C82',
  accent: '#20777B', accent2: '#12585C', accentSoft: '#E2F3F4', onAccent: '#FFFFFF',
  milk: '#B06E0C', milkSoft: '#FCEDD3',
  /**
   * SLEEP IS INDIGO, AND IT IS INDIGO BECAUSE THE ACCENT TOOK ITS TEAL (2026-09-21).
   *
   * The accent moved to the logo's teal, which sits 7.2 ΔE from the deep teal sleep used to
   * carry — closer than any two category hues have ever been (the nearest pair, rose and crit,
   * is 30). A module hue exists to name its module on sight (§4 of the usage rules below), and
   * a sleep chip the same color as every button on the screen names nothing. So sleep takes the
   * indigo the accent vacated, which is the better mapping anyway: indigo is night.
   */
  sleep: '#611CE3', sleepSoft: '#EBE5F5',
  rose: '#C63C79', roseSoft: '#FCE1EC',
  diaper: '#E51F00', diaperSoft: '#F7E6E3',
  olive: '#5F7F1F', oliveSoft: '#EAF2D6',
  cyan: '#1B77A8', cyanSoft: '#DAECF8',
  good: '#16775A', warn: '#845304', crit: '#BE3A42',
  /** A fill behind white text (§12 rule 3): crit is a text role and too light to sit behind white in dark and night. */
  dangerFill: '#A93540',
  /**
   * WHERE MILK IS KEPT, warmest to coolest — `overview.ts` `LOCATION_KIND_ORDER` reads the same
   * order and `DESIGN_SYSTEM.md §23.5` the same table. Four hues that mean a TEMPERATURE, which
   * is why they are palette roles of their own rather than a `moduleColor` mapping: a category
   * hue is overlaid by the household's color scheme, and a stash whose counter went cooler than
   * its freezer in Ocean would have lost the one thing the order is for. A scheme never touches
   * these.
   *
   * Every pair clears 4.5:1 on its own tint, on a card and on the ground, in all three themes
   * (`tools/contrast-check.mjs`), so a location's own hue can carry its name and not only a dot.
   * NIGHT COLLAPSES THEM toward amber like every other hue in that theme — the place's NAME is
   * always beside the dot, so nothing is conveyed by color alone (CLAUDE.md §6).
   */
  placeRoom: '#A24E0C', placeRoomSoft: '#FBE7DA',
  placeFridge: '#12706C', placeFridgeSoft: '#DCF1F0',
  placeFreezer: '#2B5CA6', placeFreezerSoft: '#DFE7F5',
  placeDeep: '#5B4BB5', placeDeepSoft: '#E7E3F5',
  /* the owner's color reference, 2026-09-22 — see moduleDiscSwatch */
  feed: '#9B6C00', feedSoft: '#F7F1E3', breastfeed: '#B83A54', breastfeedSoft: '#F9E3E7', pump: '#188648', pumpSoft: '#E6F4EC', tummy: '#0078CB', tummySoft: '#E3EFF7', solids: '#3F8417', solidsSoft: '#EBF4E6', health: '#E90049', healthSoft: '#F7E3EA', bath: '#5F7F1F', bathSoft: '#EFF3E7', med: '#8B39C6', medSoft: '#EEE8F3',
};

const dark: typeof light = {
  page: '#04100F', pageWarm: '#180F0B', pageCool: '#06121A',
  app: '#0C1B1C', app2: '#152222',
  paper: '#14110C',
  surface: 'rgba(255,255,255,0.055)', surfaceSolid: '#152526',
  surface2: '#1B2E2F', surface3: '#24393A',
  line: 'rgba(255,255,255,0.11)', line2: 'rgba(255,255,255,0.21)',
  text: '#E8F3F4', text2: '#BFD5D8', text3: '#8BA4A8',
  accent: '#5AC6C9', accent2: '#8EDCDE', accentSoft: '#0E3336', onAccent: '#04282A',
  milk: '#F2B663', milkSoft: '#3A2A12',
  /** Indigo, for the reason the light palette gives: the accent took the teal. */
  sleep: '#9C76E3', sleepSoft: '#23173A',
  rose: '#F58CBB', roseSoft: '#3B1A2C',
  diaper: '#EF573F', diaperSoft: '#3F1812',
  olive: '#AEC96F', oliveSoft: '#252C13',
  cyan: '#63BCE6', cyanSoft: '#112A38',
  good: '#4FC194', warn: '#E0AC55', crit: '#F0827F',
  /** A fill behind white text (§12 rule 3): crit is a text role and too light to sit behind white in dark and night. */
  dangerFill: '#8E2D35',
  placeRoom: '#E8934E', placeRoomSoft: '#33210F',
  placeFridge: '#3FBDB6', placeFridgeSoft: '#0F2E2D',
  placeFreezer: '#7FA8E8', placeFreezerSoft: '#161F35',
  placeDeep: '#A395F0', placeDeepSoft: '#1F1A3D',
  /* the owner's color reference, 2026-09-22 — see moduleDiscSwatch */
  feed: '#EEB32B', feedSoft: '#3F3212', breastfeed: '#EE6E85', breastfeedSoft: '#3F1A22', pump: '#48D083', pumpSoft: '#193827', tummy: '#2B9EEE', tummySoft: '#122D3F', solids: '#7AD048', solidsSoft: '#253819', health: '#F14D80', healthSoft: '#3F1221', bath: '#A0C851', bathSoft: '#2D361B', med: '#A976CD', medSoft: '#2B1C35',
};

const night: typeof light = {
  page: '#080604', pageWarm: '#120C06', pageCool: '#0A0806',
  app: '#0C0906', app2: '#140E07',
  paper: '#0C0906',
  surface: 'rgba(255,196,110,0.05)', surfaceSolid: '#17110A',
  surface2: '#1B140B', surface3: '#241B0F',
  line: 'rgba(214,167,96,0.16)', line2: 'rgba(214,167,96,0.30)',
  text: '#E0BC86', text2: '#AA8F68', text3: '#94836A',
  accent: '#CE9A55', accent2: '#E3B273', accentSoft: '#241A0A', onAccent: '#120C03',
  milk: '#CE9A55', milkSoft: '#1E1609',
  sleep: '#BEA576', sleepSoft: '#1C180F',
  rose: '#BE8A66', roseSoft: '#1E1509',
  diaper: '#BB9B6B', diaperSoft: '#1C170F',
  olive: '#A3A05C', oliveSoft: '#191809',
  cyan: '#93906A', cyanSoft: '#171709',
  good: '#A3A05C', warn: '#CE9A55', crit: '#C67256',
  /** A fill behind white text (§12 rule 3): crit is a text role and too light to sit behind white in dark and night. */
  dangerFill: '#5B2416',
  placeRoom: '#CE9A55', placeRoomSoft: '#1E1609',
  placeFridge: '#A98C5F', placeFridgeSoft: '#1A1409',
  placeFreezer: '#93906A', placeFreezerSoft: '#171709',
  placeDeep: '#A3A05C', placeDeepSoft: '#191809',
  /* the owner's color reference, 2026-09-22 — see moduleDiscSwatch */
  feed: '#B68554', feedSoft: '#1C160F', breastfeed: '#B78B59', breastfeedSoft: '#1C160F', pump: '#B8905F', pumpSoft: '#1C160F', tummy: '#C1AE81', tummySoft: '#1C180F', solids: '#C4B68C', solidsSoft: '#1C190F', health: '#C8BE97', healthSoft: '#1C1A0F', bath: '#CCC6A1', bathSoft: '#1C1A0F', med: '#D0CCAB', medSoft: '#1C1B0F',
};

export const gradients = {
  light: {
    brand: ['#1F7478', '#12585C'], milk: ['#EDA53E', '#C0700F'],
    sleep: ['#6A57E8', '#4733BC'], rose: ['#E4629B', '#B92E6E'], clay: ['#B07A55', '#7E5236']
  },
  dark: {
    brand: ['#22787D', '#155E64'], milk: ['#F0AE4E', '#C57A1C'],
    sleep: ['#7C68FF', '#4E36D6'], rose: ['#EA6FA6', '#C23A79'], clay: ['#BC8760', '#8A5C3D']
  },
  night: {
    brand: ['#3A2B10', '#241906'], milk: ['#3A2B10', '#241906'],
    sleep: ['#2B2712', '#1A1608'], rose: ['#33240F', '#1F1406'], clay: ['#302510', '#1D1406']
  }
} as const;

export const type = {
  families: { ui: 'HankenGrotesk', mono: 'IBMPlexMono' },
  display:    { fontFamily: 'IBMPlexMono-SemiBold', fontSize: 31, letterSpacing: -0.6 },
  /**
   * A TAB PAGE'S TITLE, THE LARGE ONE (the owner, 2026-09-30, up for their review:
   * docs/DESIGN_SYSTEM.md §4.1 rule 1). A page the tab bar reaches (no back arrow: Schedule,
   * Stash, Shopping, More, and Reports, which is drawn in the tab chrome) is named at 28; a page
   * opened from another page (it has a back arrow) is named at 23, `h1`, whether the pushed bar
   * draws it or the page does. Two sizes, and nothing in between: the Schedule and the Routine
   * pages drew 28 by passing a `fontSize` to `h1`, while Stash and Shopping drew 23 and More and
   * Reports an 18 section title, so the same kind of page had three sizes. The tracking is the
   * h1's own −0.025 em at this size. No skin changes it: a skin may not change the typeface
   * (skins.ts), so Paper and Glass draw it alike.
   */
  tabTitle:   { fontFamily: 'HankenGrotesk-ExtraBold', fontSize: 28, letterSpacing: -0.7 },
  h1:         { fontFamily: 'HankenGrotesk-ExtraBold', fontSize: 23, letterSpacing: -0.55 },
  h2:         { fontFamily: 'HankenGrotesk-ExtraBold', fontSize: 18, letterSpacing: -0.27 },
  statValue:  { fontFamily: 'IBMPlexMono-SemiBold', fontSize: 22, letterSpacing: -0.4 },
  /**
   * A HEADLINE FIGURE IN THE UI FACE, for a number that stands alone rather than in a column
   * (the owner, 2026-09-18, on the stash card: "numbers and font need to look better. this looks
   * verymuch code generated. choose just 1 font for it").
   *
   * They are right about the cause. `statValue` is the mono face and it is paired with `label`,
   * which is the mono face again, uppercase and letter-spaced — two monospaced styles in one
   * eight-character line, which is what a terminal looks like. The mono face earns its place
   * where digits LINE UP (a table, a timer, a ledger) because tabular figures are the whole
   * point there; one number beside its own words gains nothing from it and pays the look.
   */
  figure:     { fontFamily: 'HankenGrotesk-ExtraBold', fontSize: 26, letterSpacing: -0.6 },
  bodyStrong: { fontFamily: 'HankenGrotesk-Bold', fontSize: 15 },
  body:       { fontFamily: 'HankenGrotesk-Regular', fontSize: 15, lineHeight: 22 },
  bodySm:     { fontFamily: 'HankenGrotesk-Regular', fontSize: 13, lineHeight: 19 },
  meta:       { fontFamily: 'HankenGrotesk-Regular', fontSize: 12 },
  /**
   * ONE FACE FOR WORDS (the owner, 2026-09-26, of setup's supplies step: *"there are 3 different
   * fonts all in the same section 'SUPPLIES' 'what do you buy?' 'add [baby's name] go to products
   * now…' this is very bad and cannot happen"*). An eyebrow was the mono face, uppercase and
   * letter-spaced, over an H1 and a line of prose in the UI face — two faces in three lines, and
   * the mono one read as a third because it is set so differently. Every WORD is now the UI face;
   * the mono face is kept for figures that line up (`display`, `statValue`, `numeric`).
   *
   * The tracking came down with the face: Hanken Grotesk Bold's capitals average 0.648 em against
   * the mono's 0.600, so 0.08 em (the `caption`'s) keeps an eyebrow as wide as it was, or less —
   * "SUPPLIES" is 0.9 em narrower, "AUTOMATIC NIGHT MODE" the same (measured from the TTFs).
   */
  label:      { fontFamily: 'HankenGrotesk-Bold', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  /**
   * A SECTION'S CAPTION IN THE UI FACE — `label`'s job, without the typewriter.
   *
   * `label` is the mono face, and on a screen that is mostly headings over cards (Supplies'
   * fifteen shelves, the shopping list's shops) a monospaced all-caps line every 60 points is
   * what makes a page look machine-made rather than designed. The brief allowed exactly this one
   * substitution and no other — "switches to the app's regular font with letter-spacing instead"
   * — and the letter-spacing is what keeps it reading as a caption rather than as small bold
   * prose. Since 2026-09-26 `label` is the UI face too (above); `caption` is the larger of the two.
   */
  caption:    { fontFamily: 'HankenGrotesk-Bold', fontSize: 11.5, letterSpacing: 0.92, textTransform: 'uppercase' as const },
  /** A badge's word, in the UI face for `label`'s reason (above); tracking 0.03 em keeps its width. */
  badge:      { fontFamily: 'HankenGrotesk-Bold', fontSize: 9.5, letterSpacing: 0.3, textTransform: 'uppercase' as const },
  /**
   * THE TWO BIG NUMBERS, in the UI face for `figure`'s own reason (above): one number beside its
   * own words gains nothing from tabular figures and pays the terminal look for them. 46 is the
   * one number a screen is ABOUT — the stash total — and 30 is a stat tile's headline. Both are
   * chrome, so `Text.tsx` caps their growth at 1.6: a figure that grows uncapped is how a card's
   * own words get pushed out of it.
   */
  figureXl:   { fontFamily: 'HankenGrotesk-Bold', fontSize: 46, letterSpacing: -0.92 },
  figureLg:   { fontFamily: 'HankenGrotesk-Bold', fontSize: 30, letterSpacing: -0.45 },
  /**
   * A FIGURE THAT SHARES ITS CARD (the owner's UI fixes, 2026-10-05): the Sleep outlook's two
   * clocks, the Today tiles' amounts — 25 in the Bold face, the real semibold this family has, where
   * `figure`'s ExtraBold read as heavy beside the words around it.
   */
  figureMd:   { fontFamily: 'HankenGrotesk-Bold', fontSize: 25, letterSpacing: -0.4 },
  /** Every digit that lines up in a column must use the mono face. */
  numeric:    { fontFamily: 'IBMPlexMono-Regular', fontVariant: ['tabular-nums'] as const }
};

export const radius = { s: 9, m: 15, l: 22, xl: 30, pill: 999 };
export const space  = { xs: 4, sm: 6, md: 8, lg: 11, xl: 14, xxl: 18, xxxl: 26 };
export const hit    = { min: 44, primary: 54 };

/**
 * Module id → color role. Mirrors design-tokens.categoryColorByModule.
 *
 * THE FOUR CARE MODULES MUST NOT SHARE A HUE. Bath, tummy time, medicine and temperature sit
 * side by side in one strip on Today, and `tummy` and `bath` were both cyan while `med` and
 * `temp` were both crit — two pairs of identical cells, and in a blue color scheme the whole
 * strip read as one block (the owner, 2026-09-16: "dont color bath and tummy time with same
 * color blue, it looks bad in blue theme"). Tummy time takes olive, which is movement and play
 * rather than water, and temperature takes milk, so a thermometer reading is warm rather than
 * the same alarm red as a medicine. A role is still shared across the app — olive is also
 * solids, milk is also the pump — but never by two modules that appear in the same row.
 *
 * VACCINES ARE THE CALM BLUE, NOT THE REFERENCE'S PINK (the owner, 2026-09-26: "vaccines should
 * be shown in red only when there is a vaccine coming up 1 week before … and the rest … it should
 * remain a calm color like blue"). The color reference of 2026-09-22 put vaccine on `health`, a
 * raspberry, so the Schedule's vaccines card and the whole Vaccines page read red every day of
 * the year — most likely the red the owner was describing. Red now means one thing on those
 * surfaces, the week before a date (packages/core `vaccines/soon.ts`), and the module wears
 * `cyan` the rest of the time — the hue its card was built on (`VaccinesCard.tsx`). Temperature
 * keeps `health`.
 */
export const moduleColor = {
  bottle: 'feed',
  breastfeed: 'breastfeed',
  pump: 'pump',
  diaper: 'diaper',
  sleep: 'sleep',
  solids: 'solids',
  med: 'med',
  water: 'cyan',
  growth: 'sleep',
  temp: 'health',
  tummy: 'tummy',
  bath: 'bath',
  milestone: 'feed',
  note: 'diaper',
  stash: 'feed',
  hydration: 'cyan',
  selfcare: 'rose',
  vaccine: 'cyan',
  // the Health note (2026-10-08): the soft rose the retired Mom self-care wore, measured with it
  wellbeing: 'rose',
} as const;

/**
 * THE OWNER'S COLOR REFERENCE (2026-09-22) — the disc behind a module's icon.
 *
 * Seven swatches, and which module wears each. These paint a FILL and never ink: measured, every
 * one is 1.4-1.9:1 as text on white and would fail every contrast check, while the brand ink ON
 * them is 7.1-9.3:1, which is exactly what a disc behind a dark glyph wants. `moduleColor` above
 * keeps naming the ink token that paints a line, a label or a chart series — the two answer
 * different questions and neither replaces the other.
 *
 * NOT THEME-VARIANT, on purpose: the reference is one sheet the owner keeps, so the same seven
 * hexes are the same in light and in dark, where a pastel disc with dark ink on it still reads.
 * `discFor` returns null in NIGHT mode, because the amber screen exists to keep a dark room dark
 * and seven saturated circles are the one thing it is for.
 */
export const moduleDiscSwatch = {
  feed: '#FFD166', pump: '#A7E3C1', diaper: '#FFB3A7', sleep: '#C7B4EB',
  tummy: '#A7DBFF', solids: '#BDE3A7', health: '#FFB3CB',
  /**
   * THE EIGHTH SWATCH, added 2026-09-22 on the owner's sheet: breastfeeding is its own color and
   * no longer shares the bottle's amber. It is the one swatch that is not a pastel — 0.335
   * relative luminance against the other seven's 0.58-0.83 — and that is what keeps it apart
   * from `health` nine degrees away on the wheel: the two differ by 1.6:1 in lightness, which is
   * a step the eye reads even where the hue barely moves. Dark ink on it still clears 4.9:1.
   */
  breastfeed: '#E87C8E',
  /**
   * TWO DERIVED SWATCHES, not on the owner's sheet: bath and medicine have no reference color,
   * and leaving them on someone else's put two identical cells side by side in Today's care
   * strip — the exact collision the owner reported on 2026-09-16. They are built from the
   * reference's own recipe (the mean saturation and lightness of the seven, 0.80/0.795) at the
   * hue each module's INK already uses, so they sit in the sheet without pretending to be it.
   */
  bath: '#D9F5A1', med: '#D2A1F5',
} as const;

export const moduleDisc = {
  bottle: 'feed', stash: 'feed', milestone: 'feed',
  breastfeed: 'breastfeed',
  pump: 'pump',
  diaper: 'diaper', note: 'diaper',
  sleep: 'sleep', growth: 'sleep',
  tummy: 'tummy', water: 'tummy', hydration: 'tummy',
  solids: 'solids',
  bath: 'bath',
  med: 'med',
  temp: 'health', selfcare: 'health', wellbeing: 'health',
  // the sheet's one blue, to match the module's calm cyan ink (2026-09-26; `moduleColor` above)
  vaccine: 'tummy',
} as const;

export type ModuleDiscName = keyof typeof moduleDiscSwatch;

/** The disc a module wears, or null where the theme must not show one. */
export function discFor(module: keyof typeof moduleDisc, theme: ThemeName): string | null {
  return theme === 'night' ? null : moduleDiscSwatch[moduleDisc[module]];
}

/**
 * HOW STRONGLY A CARD TAKES ITS MODULE'S COLOR — the disc's recipe at a card's scale.
 *
 * A 72pt disc can be the reference swatch outright; a card the width of the screen cannot, and
 * the two directions fail differently. In LIGHT the swatch is a pastel over white, so half of it
 * is a butter gold that still carries near-black text at 11:1. In DARK and NIGHT the swatch is
 * the wrong material entirely — a pale disc fills a whole card with a light block on a near-black
 * page — so the card takes the module's own INK at a fifth, which deepens the card in the right
 * hue instead of lifting it out of the theme.
 *
 * THE NUMBERS ARE MEASURED, not chosen: across 3 themes × 6 schemes the worst `text` on the
 * result is 8.1:1 and the worst `text2` is 4.8:1, both clear of AA, and the card sits 1.1-1.9:1
 * off the page it floats on rather than the 1.03:1 a 5% accent wash produced.
 */
export const MODULE_FILL_LIGHT = 0.5;
export const MODULE_FILL_DIM = 0.18;

export function moduleCardFill(
  color: Pick<Palette, 'surfaceSolid'> & Record<string, string>,
  module: keyof typeof moduleDisc,
  theme: ThemeName,
): string {
  const disc = discFor(module, theme);
  return theme === 'light' && disc !== null
    ? composite(color.surfaceSolid, disc, MODULE_FILL_LIGHT)
    : composite(color.surfaceSolid, color[moduleColor[module]] ?? color.surfaceSolid, MODULE_FILL_DIM);
}

export const themes = { light, dark, night } as const;
export const themeNames: ThemeName[] = ['light', 'dark', 'night'];
export type Palette = typeof light;
export type ColorRole = keyof Palette;

export function paletteFor(name: ThemeName): Palette { return themes[name]; }
export function gradientFor(name: ThemeName, key: keyof typeof gradients.light) { return gradients[name][key]; }

/**
 * Usage rules — these are product decisions, not suggestions:
 *  1. No component ever hardcodes a hex value. Colors come from the palette by role.
 *  2. Gradients are for: primary CTA, the FAB, a RUNNING timer card, the NEXT card,
 *     avatars and switches. Never a page background, never body text.
 *  3. A running timer is always the loudest thing on screen.
 *  4. Category color identifies the module everywhere it appears (tile, timeline row,
 *     chart series, widget accent) so a tired parent recognizes it by shape and hue.
 *  5. Status color (good/warn/crit) is independent of category color and never the
 *     only signal — always pair it with text.
 *  6. Grounds stay tinted: `app` + the soft radial washes. Never pure #FFF or flat gray.
 *  7. Night mode is not dark mode dimmed: it drops blue entirely and keeps contrast ≥ 4.5:1.
 */

/* ------------------------------------------------------------------------- *
 * Color schemes — the accent world the user picks (DESIGN_SYSTEM.md §11).
 *
 * A scheme overlays EXACTLY ten roles on top of the active theme palette.
 * It must never touch semantic status colors or the fixed category hues:
 * a missed schedule looks the same in Rose as in Slate, and a chart read in
 * Ocean is describable to someone on Sunny.
 *
 * Night theme takes only `accent` and `accent2` from the scheme — its grounds
 * are non-negotiable, because night mode exists to be safe in a dark room.
 * ------------------------------------------------------------------------- */
export type SchemeName = 'ocean' | 'lilac' | 'rose' | 'sunny' | 'reef' | 'slate';
/**
 * THE DEFAULT IS OCEAN, A CLEAR BLUE (the owner, 2026-09-27: *"default color should not be the
 * green, the green just feels boring. it shouldbe brighter color. I like the rose color but this
 * does not feel gender neutral … perhaps make default color ocean or rose?"*). Of the two offered,
 * Rose is the one the same sentence ruled out for every household's first screen, so Ocean it is.
 * It is also the free plan's one scheme: `resolveAppearance` takes any other back, keyed off this
 * constant and never off a name.
 *
 * REEF STAYS, AS A CHOICE. It was the default from 2026-09-21 (the owner: "Change default theme
 * color, especially on onboarding, to CuddleCue theme color"): the logo's teal #3FB1B4 with its
 * coral #F8907C (`packages/brand/brand.json`), the teal deepened until white clears 4.5:1 on it.
 * The brand did not change; which color a new household starts on did. Before reef the default
 * was `twilight`, a periwinkle violet from the prototype that appears nowhere in the brand kit.
 *
 * SAGE AND CLAY WERE RETIRED THE SAME DAY (*"sage is too close to reef, replcae the color, and
 * color clay is just too ugly"*). `lilac` and `sunny` took their places: two hue families no other
 * scheme was using, a purple and a bright orange, each measured against every gate the others
 * pass. Their names are five letters at most for the swatch row's sake (`swatchRow.ts`).
 *
 * A RETIRED KEY IS NEVER REUSED FOR DIFFERENT HUES, and that is deliberate. The key is stored on
 * the device and on `profiles.color_scheme`; a stored key this build no longer knows falls back to
 * the default (`parseAppearance`, and `resolvePalette` again behind it), which is the behavior
 * those two already promise and test — "a scheme removed in a later release cannot brick an
 * existing install". So an install carrying `twilight`, `sage` or `clay` lands on ocean and is
 * simply on the default. Keeping a key and swapping the hues under it would have been the lie: a
 * household that chose a green would silently own a purple under a name that still said green.
 */
/*
 * NIBBLECUE'S DEFAULT IS SUNNY, THE BRIGHT ORANGE (2026-10-08). The owner, on starting NibbleCue
 * from CuddleCue's design system: *"we can change the main color to diferentiate the two app, but
 * the module and look need to be the same"*. So the one thing that moves is which scheme a new
 * install starts on: CuddleCue's is Ocean blue, NibbleCue's is Sunny orange, a scheme that already
 * passes every contrast gate above. The module hues, the paper ground and every component stay
 * CuddleCue's. Reversible by changing this one constant.
 */
export const DEFAULT_SCHEME: SchemeName = 'sunny';

export type SchemeOverlay = {
  accent: string; accent2: string; accentSoft: string; onAccent: string;
  /** label color on the brand gradient — always white; onAccent is for the flat accent */
  onGradient: string;
  g1: string; g2: string;
  page: string; pageWarm: string; pageCool: string; app: string; app2: string;
};

export const schemes: Record<SchemeName, { name: string; note: string; light: SchemeOverlay; dark: SchemeOverlay }> = {
  ocean: {
    name: 'Ocean', note: 'Clear blue',
    light:
      { accent: '#1668A8', accent2: '#0E4C7D', accentSoft: '#DBEBF8', onAccent: '#FFFFFF', onGradient: '#FFFFFF',
        g1: '#267AB8', g2: '#0F5590',
        page: '#DCE8F5', pageWarm: '#EDF2F8', pageCool: '#D6E8F8', app: '#F1F6FC', app2: '#ECF6FB' },
    dark:
      { accent: '#6FBBEE', accent2: '#9DD3F7', accentSoft: '#0F2C42', onAccent: '#041827', onGradient: '#FFFFFF',
        g1: '#317AAD', g2: '#14568C',
        page: '#050E17', pageWarm: '#0C1722', pageCool: '#07131F', app: '#0E1A28', app2: '#122335' }
  },
  lilac: {
    name: 'Lilac', note: 'Soft purple',
    light:
      { accent: '#704BD5', accent2: '#5436A5', accentSoft: '#F1EEFE', onAccent: '#FFFFFF', onGradient: '#FFFFFF',
        g1: '#8256D8', g2: '#5A3DBD',
        page: '#EAE4FA', pageWarm: '#FDE9DF', pageCool: '#E0E7FC', app: '#F7F5FE', app2: '#FEF3EC' },
    dark:
      { accent: '#C1A0FB', accent2: '#D7C3FF', accentSoft: '#2A1F40', onAccent: '#1A0F2C', onGradient: '#FFFFFF',
        g1: '#855EC8', g2: '#6044B5',
        page: '#0E0918', pageWarm: '#1D0D1B', pageCool: '#0D0E1E', app: '#191325', app2: '#21192F' }
  },
  rose: {
    name: 'Rose', note: 'Warm pink',
    light:
      { accent: '#C0356B', accent2: '#96204F', accentSoft: '#FCEBF1', onAccent: '#FFFFFF', onGradient: '#FFFFFF',
        g1: '#C64576', g2: '#A32357',
        page: '#F5E1EA', pageWarm: '#FCE9DE', pageCool: '#EFE3F3', app: '#FDF3F7', app2: '#FFF3EC' },
    dark:
      { accent: '#F58CB4', accent2: '#FFB3CD', accentSoft: '#3A1524', onAccent: '#2A0714', onGradient: '#FFFFFF',
        g1: '#BA507F', g2: '#A82C61',
        page: '#140610', pageWarm: '#200D18', pageCool: '#150A18', app: '#20101B', app2: '#2A1522' }
  },
  sunny: {
    name: 'Sunny', note: 'Bright orange, the default',
    light:
      { accent: '#BA4400', accent2: '#8B2D01', accentSoft: '#FFEDE0', onAccent: '#FFFFFF', onGradient: '#FFFFFF',
        g1: '#B85603', g2: '#9D2F02',
        page: '#FAE3D0', pageWarm: '#FEE9DE', pageCool: '#F2EBCF', app: '#FDF6EB', app2: '#FBF6E4' },
    dark:
      { accent: '#FFA159', accent2: '#FEC598', accentSoft: '#3D1E05', onAccent: '#270E00', onGradient: '#FFFFFF',
        g1: '#B75901', g2: '#993C02',
        page: '#160902', pageWarm: '#201103', pageCool: '#1B0C06', app: '#241308', app2: '#2D1B0A' }
  },
  reef: {
    name: 'Reef', note: 'Teal and coral',
    light:
      { accent: '#20777B', accent2: '#12585C', accentSoft: '#E2F3F4', onAccent: '#FFFFFF', onGradient: '#FFFFFF',
        g1: '#1F7478', g2: '#12585C',
        page: '#D9EBEC', pageWarm: '#FCE9E1', pageCool: '#DCE8F2', app: '#EFF7F7', app2: '#FFF1EA' },
    dark:
      { accent: '#5AC6C9', accent2: '#8EDCDE', accentSoft: '#0E3336', onAccent: '#04282A', onGradient: '#FFFFFF',
        g1: '#22787D', g2: '#155E64',
        page: '#04100F', pageWarm: '#180F0B', pageCool: '#06121A', app: '#0C1B1C', app2: '#152222' }
  },
  slate: {
    name: 'Slate', note: 'Quiet and low-key',
    light:
      { accent: '#414C68', accent2: '#2B3448', accentSoft: '#E2E6F0', onAccent: '#FFFFFF', onGradient: '#FFFFFF',
        g1: '#55638A', g2: '#333C55',
        page: '#E3E6EE', pageWarm: '#EFEDF0', pageCool: '#DFE5F0', app: '#F4F5F9', app2: '#F8F7F9' },
    dark:
      { accent: '#A7B4D6', accent2: '#C6CFE8', accentSoft: '#232838', onAccent: '#11141F', onGradient: '#FFFFFF',
        g1: '#687494', g2: '#404A66',
        page: '#090B11', pageWarm: '#14151A', pageCool: '#0D1017', app: '#151824', app2: '#1B1F2D' }
  },
};

/**
 * Whether `v` names a scheme THIS build ships — the one test every stored key goes through.
 *
 * An own-property test and not `in`, because `in` walks the prototype chain: a stored
 * "constructor" or "toString" would pass it and then be painted from a function instead of
 * falling back. A retired key (`twilight`, `sage`, `clay`) is simply not here, which is the whole
 * of how an old install lands on the default.
 */
export const isSchemeName = (v: unknown): v is SchemeName =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(schemes, v);

/** A scheme's table entry, or the default's for a key this build does not ship. */
const schemeFor = (name: string) => (isSchemeName(name) ? schemes[name] : schemes[DEFAULT_SCHEME]);

/**
 * Resolve the palette a screen should actually use.
 * Order matters and is a product decision, not a style preference:
 *   1. the theme supplies the structural palette,
 *   2. the scheme overlays its ten roles,
 *   3. NIGHT reclaims its grounds — a bright scheme may not raise night luminance.
 * An unknown scheme name falls back to the default rather than rendering unstyled,
 * so a scheme removed in a later release cannot brick an existing install.
 */
export function resolvePalette(theme: ThemeName, scheme: SchemeName = DEFAULT_SCHEME): Palette {
  const base = paletteFor(theme);
  const s = schemeFor(scheme);
  const o = theme === 'light' ? s.light : s.dark;
  if (theme === 'night') {
    // accents only; grounds, surfaces, lines and text stay exactly as night defines them
    return { ...base, accent: o.accent, accent2: o.accent2 };
  }
  return {
    ...base,
    accent: o.accent, accent2: o.accent2, accentSoft: o.accentSoft, onAccent: o.onAccent,
    page: o.page, pageWarm: o.pageWarm, pageCool: o.pageCool, app: o.app, app2: o.app2
  };
}

export function brandGradientFor(theme: ThemeName, scheme: SchemeName = DEFAULT_SCHEME): [string, string] {
  const s = schemeFor(scheme);
  const o = theme === 'light' ? s.light : s.dark;
  return [o.g1, o.g2];
}
