/**
 * THE INKS A CARD OVER ARTWORK MAY USE, and the layer that seats them on it.
 *
 * A card with a background picture is the one surface in the app whose ground is not a theme
 * token. Its text cannot take `t.color.text`, which moves with the theme while the owner's rose
 * stays rose, so the ink comes from the PICTURE the theme draws instead. WHICH ink a picture of the
 * owner's takes is the owner's (white on all four running-timer pictures since 2026-09-27,
 * playtime's blue included: *"make sure text comes back to white"*), set per picture in
 * `tools/brand/render-card-art.mjs`, which MEASURES the rest: the veil that carries that ink, what
 * it reaches, and every line a timer card draws where it lands, with what falls short recorded as
 * owed. It writes it all into `cardArt.generated.ts`, and swapping an artwork re-runs it.
 *
 * AND A PICTURE MAY HAVE VERSIONS (2026-09-29): a dark one for dark theme and a Night one for the
 * amber Night, drawn from the owner's masters by `tools/brand/card-art-versions.mjs` for inks of
 * their own (white and a light gold or green in dark; Night's amber), and measured the same way.
 *
 * Hexes rather than tokens on purpose, and this file is in `theme/` rather than `components/`
 * for exactly that reason (eslint forbids a hex in a component): a token would move with the
 * theme, and the ground under it does not.
 *
 * WHICH PICTURE A THEME DRAWS IS DECIDED ONCE, HERE (`artForTheme`), and every ink on the card is
 * chosen from that decision rather than from the picture's name. The two used to be decided in
 * different places (the card dropped its picture in Night, the screen kept the picture's dark ink)
 * and the words ended up written for a ground that was not there.
 */
import type { ThemeName } from './theme';

/**
 * Near-black rather than black: the same softening every other dark ink in the theme has.
 *
 * IT IS AN INK, NOT A WASH. The veil under a card's words used to be drawn in it, and a neutral
 * over a saturated ground desaturates it: the owner's orange reached the phone as brown and
 * their green as olive (2026-09-19: *"it looks ugly if it's with the darker left layer you
 * made"*). Each artwork now carries its OWN deepened hue for that job — `CardArt.veilColor`,
 * measured per picture — and this constant went back to being only what dark text is drawn in.
 */
const ART_INK_DARK = '#12131A';
const ART_INK_LIGHT = '#FFFFFF';
/**
 * A DARK GOLD for the one number a card is about — the stash's ounces, over its yellow (the
 * owner, 2026-09-19: "the number (indicating how many oz stored) needs to be dark gold also the
 * icon"). Not the milk token: that is a dark amber in light and a pale one in dark, and the card
 * is the same yellow in both. Measured like the inks — `render-card-art.mjs` fails the build if
 * it stops clearing AA over the artwork's content column.
 */
const ART_INK_GOLD = '#6B4409';
/**
 * A DARK GREEN for the shopping card's own words (the owner, 2026-09-19: "the 'x things to buy'
 * change its color to very dark green instead and for the list of items in the cart too"). The
 * olive token is the category's, and it is a mid-tone that has to work on a pale panel in light
 * and a dark one in dark; this card is the same pale green in both, so it takes an ink measured
 * against that green and nothing else.
 */
const ART_INK_GREEN = '#14532D';
/**
 * A LIGHT GOLD for the stash's figure over its DARK version (2026-09-29): the owner's dark gold
 * turned inside out for a ground that is dark gold itself. Measured like every ink here.
 */
const ART_INK_HONEY = '#FFD98A';
/** A LIGHT GREEN for the shopping card's own words over its dark version, the same way. */
const ART_INK_MINT = '#B5E68C';
/**
 * NIGHT'S AMBER, the Night palette's own `text` (`theme.ts`), for every word over a Night version:
 * the ink the whole of Night is written in, so a card with a picture reads as the page around it.
 * `artInk.test.ts` holds the two to one value.
 */
const ART_INK_AMBER = '#E0BC86';

/**
 * How much of its solid surface a stop pill keeps when it sits on a picture (the owner,
 * 2026-09-18: "make it a little more transparent. Solid white just hides the baby picture behind
 * it"). High enough that the text ink on it still clears 4.5:1 over the brightest pixel either
 * timer artwork can put under it — the sleeping baby's cloud — and over the darkest, the
 * mother's hair; `contrast.test.ts` composites both, in every theme. Low enough that the drawing
 * reads through as a drawing rather than a tint.
 */
export const PILL_OVER_ART_ALPHA = 0.78;

/**
 * THE BRIGHTEST AND THE DARKEST PIXEL A TIMER PICTURE CAN PUT UNDER THAT PILL — the two grounds
 * the pill's ink and its hold ring are measured over (`contrast.test.ts`, `timerMotion.test.ts`).
 *
 * THE BRIGHTEST IS WHITE ITSELF since the pictures of 2026-09-26: the double pump's cream flanges
 * and bottles reach the stop button's corner on a narrow phone, and nothing is brighter than
 * white, so no later picture can move this one. It was `#E5E5E5`, the old sleeping cloud. The
 * darkest is still the mother's hair on the breastfeeding card. The app measures every running
 * timer's picture under the pill against both, at every phone size and text size
 * (`apps/mobile/src/ui/cardArtParts.test.ts`), so a new picture darker than this fails a build.
 * A Night version (2026-09-29) is darker than the hair at its floor and dimmer than white at its
 * top, and in Night the pill's words are light: a darker ground under them only reads better.
 */
export const PILL_UNDER_ART = { brightest: '#FFFFFF', darkest: '#363636' } as const;

export type ArtInk = 'light' | 'dark' | 'amber';
/** An accent a card may carry beside its ink, measured the same way. */
export type ArtAccent = 'gold' | 'green' | 'honey' | 'mint' | 'amber';

const ART_INKS: Readonly<Record<ArtInk | ArtAccent, string>> = {
  light: ART_INK_LIGHT,
  dark: ART_INK_DARK,
  amber: ART_INK_AMBER,
  gold: ART_INK_GOLD,
  green: ART_INK_GREEN,
  honey: ART_INK_HONEY,
  mint: ART_INK_MINT,
};

export const artInkColor = (ink: ArtInk | ArtAccent): string => ART_INKS[ink];

/**
 * THE PICTURE A THEME DRAWS, or null where it draws none, and so the ground every word on the card
 * is written for. A card's inks come from what this returns, never from the picture's name:
 * `Card` asks it before drawing, and so must the screen that picks the words' colors.
 *
 *   * LIGHT DRAWS THE OWNER'S OWN PICTURE, as they made it.
 *   * DARK DRAWS THE DARK VERSION where a picture has one (the owner, 2026-09-29: *"And yes, do dark
 *     version for milk stash too"*): the pale three (the stash's gold, the stash summary's, the
 *     shopping list's green) redrawn deep for white words. Before them dark drew no pale picture at
 *     all, since a daytime picture on a dark page was a bright box there (the owner, from an Android
 *     phone: *"the top textbox still shows bright yellow as if it was in day theme"*), and a pale
 *     picture whose version did not resolve still draws none: its card takes its own dark tint and
 *     the theme's inks. A picture drawn for white words already (the four timers') is the owner's
 *     own in dark, a shade deeper (`artDimFor`).
 *   * NIGHT DRAWS THE NIGHT VERSION (*"And night theme as well"*): every picture redrawn dim in its
 *     module's one amber tone for Night's amber words, since the amber theme exists so nothing is
 *     bright or blue at 3 a.m. (DESIGN_SYSTEM §2). A picture with none draws nothing in Night, as
 *     Night always did, and the card falls back to its own dim tint.
 */
export function artForTheme(art: CardArt | null | undefined, theme: ThemeName): CardArt | null {
  if (!art) return null;
  // A VERSION IS ALREADY AN ANSWER, and asking again must not change it: a screen that chose its
  // inks with this hands the picture it got to `Card`, which asks the same question before drawing,
  // and a Night version asked for its own Night version would have come back as nothing
  if (art.version !== undefined) return art.version === theme ? art : null;
  if (theme === 'night') return art.night ?? null;
  if (theme === 'dark') return art.dark ?? (art.ink === 'dark' ? null : art);
  return art;
}

/**
 * HOW MUCH A PICTURE IS DEEPENED IN DARK (the owner, 2026-09-29: *"should we make a (slightly)
 * darker overlay when for the timer background on night time"*). The owner's own pictures that dark
 * draws as they are, the running timers', are saturated for white words, and on a dark page they
 * were by far the brightest thing there: half the pixels of the pump, sleep and playtime pictures
 * are over 50% luminance, beside a page ground near 1%. So in dark each carries a flat layer of its
 * OWN deepened hue (`CardArt.veilColor`) at this strength: a shade of the same colors, never a gray
 * film (the owner's "darker left layer" of 2026-09-19 was a neutral, and they said no to it).
 *
 * TWENTY PERCENT takes about a quarter off each picture's mean luminance and leaves the drawing
 * whole. It is also the most the nap's "z"s allow with room: they are drawn in the same
 * `veilColor`, so every step up brings the sky toward their ink; they clear 3:1 over every pixel
 * of their path at 3.39 here and fall under it past about 28% (`cardArtParts.test.ts` holds this).
 * The words over the picture only gain: white over a deeper ground measures higher, and so do the
 * stop pill's light words in dark.
 *
 * Light draws the picture as the owner made it, and a dark or Night version is drawn at its theme's
 * depth already (`artDimFor`).
 */
export const ART_DIM_IN_DARK = 0.2;

/**
 * The strength of that layer for a picture in a theme: `ART_DIM_IN_DARK` for the owner's own
 * picture in dark, and nothing anywhere else. A dark or Night version was drawn for its theme and
 * its words were measured on it as it ships; deepening it again would put them on a ground nobody
 * measured.
 */
export const artDimFor = (theme: ThemeName, art: Pick<CardArt, 'version'>): number =>
  theme === 'dark' && art.version === undefined ? ART_DIM_IN_DARK : 0;

/**
 * A card's background picture, as the components take it. The app builds these from
 * `apps/mobile/src/ui/cardArt.ts`; `packages/ui` never reaches for a file of its own.
 */
export interface CardArt {
  /** The imported file (a JPEG since 2026-10-01; a lossy WebP from 2026-09-27 to then). */
  source: unknown;
  /** Its pixels, so the layer can place it in numbers rather than trust a percentage. */
  width: number;
  height: number;
  /** Which ink the card's content takes over it. */
  ink: ArtInk;
  /** A second, measured color for the card's figure and glyph, where the artwork carries one. */
  accent?: ArtAccent;
  /**
   * How dark the veil under the content column is, 0–1, and 0 for an artwork that needs none.
   *
   * IT IS NOT A DIMMER ON THE PICTURE. It is flat across the content column and gone by
   * `veilEnd`, so it deepens the plain gradient the words sit on and leaves the illustration —
   * the part the owner drew — untouched. The alternative was dark text on their rose, which they
   * looked at and said no to; the alternative to THAT was white at 2.51:1, which is a card a
   * parent squints at.
   */
  veil: number;
  /**
   * WHAT THE VEIL IS DRAWN IN: this artwork's own darkest pixel, deepened — never a neutral.
   *
   * The distinction is the whole difference between a shadow inside a picture and a film laid on
   * top of one, and it is the difference the owner saw and named. A hex rather than a token for
   * the reason this file gives: it belongs to the ground, which does not move with the theme.
   *
   * It is also what the nap's "z"s are drawn in over the picture (`TimerMotion`, 2026-09-26): the
   * picture's own line color rather than the card's white, which the new lavender sky cannot carry.
   */
  veilColor: string;
  /** Where the veil has faded to nothing, as a share of the card's width. */
  veilEnd: number;
  /**
   * The leftmost share of the card content may occupy — past it the illustration begins. `Card`
   * holds its words to it; a running timer's card does not (`TimerCard` says why), so its words
   * are measured where they land instead (`artWords.ts`).
   */
  contentFraction: number;
  /**
   * THE PICTURE'S OWN COLOR, AS A SOLID GROUND UNDER IT (2026-09-29): the color it is painted in
   * where a card's words always sit, measured from the file (`render-card-art.mjs`), with the ink
   * held to its bar on it as well.
   *
   * A picture is not always there. It arrives a moment after its card, it may not arrive at all (a
   * development build fetches it from a dev server, and the owner's went to sleep), and the stash
   * summary's is translucent everywhere, so what is under it shows through. Under it used to be
   * the card's theme tint — dark gold in dark theme — and the words, written for a pale picture,
   * went dark on dark. `Surface` draws this under the picture instead, so a card over a picture
   * reads the same with it, without it, and through it. (`TimerCard` keeps its own gradient under
   * its picture, the ground its white words were designed on before there were pictures.)
   */
  ground: string;
  /**
   * WHERE THE DRAWING'S OWN PARTS ARE, for a running timer's small moves (2026-09-26): the air
   * above the sleeping baby that the nap's "z"s rise through. In the artwork's own pixels,
   * measured from the owner's file and held to it by the app's test
   * (`apps/mobile/src/ui/cardArtParts.test.ts`), so a swapped artwork fails a build rather than
   * drifting "z"s across the wrong corner of a new picture. Absent on a card with nothing that
   * moves.
   */
  parts?: ArtParts;
  /**
   * WHICH VERSION OF A PICTURE THIS IS (2026-09-29): absent on the owner's own, `dark` or `night` on
   * one drawn from it for that theme (`tools/brand/card-art-versions.mjs`). A version is never
   * deepened again (`artDimFor`).
   */
  version?: 'dark' | 'night';
  /** The picture dark theme draws in its place, where it has one (`artForTheme`). */
  dark?: CardArt;
  /** The picture the amber Night draws in its place, where it has one (`artForTheme`). */
  night?: CardArt;
}

export interface ArtParts {
  /**
   * The air the nap's "z"s rise through: where one is born and where it has faded, its size once
   * grown and how far it sways — all in the artwork's pixels, so they grow with the picture.
   */
  zs?: { from: { x: number; y: number }; to: { x: number; y: number }; size: number; sway: number };
}
