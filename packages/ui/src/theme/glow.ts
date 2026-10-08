/**
 * THE TOUR'S OWN INK: a color taken much further than the UI ever takes it — the household's
 * accent at first (`glowInk`), red since 2026-09-25, and a softer, rosier red since 2026-09-26
 * (`tourInk`, below).
 *
 * The owner, 2026-09-18, on the first-run outline: *"make the border color for the tutorial the
 * theme color but way more intense (if theme color is purple, then it should be very dark
 * purple)."*
 *
 * It lives in the theme package and not beside the tour for the reason every other color helper
 * does: it is arithmetic over two palette values, it has to be right in three themes and six
 * schemes, and `contrast.ts`'s suite is where that is measured. `apps/mobile/src/tour/glow.ts`
 * holds the GEOMETRY — how many bands, how thick, how far they breathe — which is arithmetic of
 * a different kind and has no business knowing what a palette is.
 */
import { composite } from './contrast';

/**
 * How far the accent is pulled toward the page's own ink.
 *
 * Nearly half, on purpose. An outline that is merely the accent is the same weight as every chip
 * and link already on the screen, so it reads as decoration rather than as a pointer — which is
 * the whole reason this exists rather than `t.color.accent` being used directly.
 */
const DEEPEN = 0.45;

/**
 * THE INK IS TAKEN TOWARD THE PAGE'S INK, NOT TOWARD BLACK, which is what makes one expression
 * right in all three themes. In `light` the ink is near-black, so purple becomes a very dark
 * purple; in `dark` and `night` it is near-white, so it becomes a brighter one. "Intense" means
 * *further from the page* — and a very dark purple on a dark page is a hole, not a highlight.
 */
export const glowInk = (accent: string, pageInk: string): string =>
  composite(accent, pageInk, DEEPEN);

/**
 * THE SEED IS RED (the owner, 2026-09-25, after trying the first-run tour on a phone: *"Make the
 * breathing effect more easily seen or more intense. Perhaps do it in a closer to red color?"*).
 *
 * It has been three colors, and each move kept what the last one got right:
 *
 *  * 2026-09-18, the household's accent, deepened — right about the WEIGHT, wrong about the hue:
 *    on the default scheme the mark was the same teal as every chip, tab and button it pointed
 *    at, and a mark's job is to be the color nothing else on the page is.
 *  * 2026-09-22, the brand's coral `#F8907C` (*"this needs to change drastically to the second
 *    color theme (orange-like)"*) — right about the hue family, and too faint to find. Coral is a
 *    pale color with a lot of green and blue in it (144 and 124 of 255), and all of that survived
 *    the pull toward the page's ink: measured, it resolved to `#91675F` in light (HSL saturation
 *    0.21, CIE chroma 19 — a dusty brown), `#F1BDB2` in dark (a pastel pink) and `#EDA481` at
 *    night (a peach, and only ΔE 6.6 from the Clay scheme's own `accent2` there — the very
 *    "same color as what it points at" the move away from the accent was meant to end).
 *  * 2026-09-25, pure red.
 *
 * WHY PURE RED, `#FF0000`, and not a "nicer" red with a little orange or blue in it: the seed is
 * never drawn. It is a DIRECTION, and the page's own ink is mixed into it (`TOUR_DEEPEN`), so
 * whatever green or blue the seed carries survives into every theme and pulls the mark back
 * toward brick, salmon or coral — which is exactly what the coral's did. The page's ink supplies
 * the rest, and supplies it per theme: light's teal-black makes a deep red, dark's near-white a
 * light one, and night's amber warms it to a vermilion on its own (hue 7°) — so a seed that was
 * already warm would have put night's mark straight back in coral. Measured, as the tour draws
 * it (`glow.test.ts` pins every number that matters):
 *
 *   light  `#A01518`  hue 359°, CIE chroma 65, 5.61:1 on the worst ground it sits on
 *   dark   `#F66162`  hue   0°, CIE chroma 64, 3.95:1
 *   night  `#F34B36`  hue   7°, CIE chroma 79, 4.74:1
 *
 * — against the coral's chroma of 19, 21 and 37. Red is also the right color for night mode
 * specifically: it is the hue a dark-adapted eye is least disturbed by, which is the whole point
 * of the amber theme.
 *
 * ── A STEP BACK, TOWARD ROSE (2026-09-26) ───────────────────────────────────────────────────────
 *
 * The owner, the next day: *"the highlight feels too intense, before too soft, now too intense.
 * find middle ground."* Most of the answer is the mark's weight and its breath
 * (`apps/mobile/src/tour/glow.ts`); this is the ink's share, and the obvious middle was measured and
 * refused before this one was chosen:
 *
 *  * HALFWAY BACK TO THE CORAL collides with two things the mark must never be. Red mixed 40–70%
 *    with the coral, pulled the same 40%, lands ΔE 1.4–8.8 from `crit` in the dark theme — the
 *    tour's mark would be the app's own "late" — and ΔE 15–19 from the Clay scheme's accents,
 *    under the 20 that keeps a mark off the color it points at.
 *  * A PINK ROSE collides with the Rose scheme's own accent, which sits at the same hue: ΔE 1–5
 *    from it in light.
 *  * WHAT IS LEFT is a step toward crimson: `#E6001D`, full saturation, 352°. Pulled toward the
 *    page's ink by the same 40% it becomes a deeper, rosier red with 13–16% less chroma in every
 *    theme, ΔE 13.5–15.2 from the red it replaces, and still clear of both:
 *
 *   light  `#911529`  hue 350°, CIE chroma 55 (red 65), 6.27:1 on the worst ground it sits on
 *   dark   `#E76173`  hue 352°, CIE chroma 56 (red 64), 3.69:1
 *   night  `#E44B47`  hue   2°, CIE chroma 69 (red 79), 4.36:1 — drawn still, and the edge alone
 *
 *   — ΔE 14.3 / 14.6 / 29.2 from `crit`, and at least 20.9 from every scheme's accents.
 *
 * WHY THE SEED IS STILL A FULL-STRENGTH COLOR, and not a "nicer" muted one: the seed is never
 * drawn. It is a DIRECTION, and the page's own ink is mixed into it (`TOUR_DEEPEN`), so whatever
 * gray a seed carries survives into every theme and drags the mark back toward the dusty brown the
 * coral was. The softening is the step in hue and the lighter mark, not a grayer ink.
 *
 * THE ONE MEANING IT SHARES, said plainly because it is the owner's to weigh: the app already
 * uses red for "late" (`crit` — a Log tile's edge, a missed slot). The two stay apart by the
 * measure (ΔE 14.3–29.2 across the themes) and the tour's mark always carries its words, but the
 * "Amber and red" tip outlines the Log tiles in this ink while explaining that a red edge means
 * late. Nothing is conveyed by the color alone (every tile says late or due in words), and the
 * tip exists only once a tile has really turned.
 */
export const GLOW_SEED = '#E6001D';

/**
 * How far the red is pulled toward the page's own ink — less than the accent was (`DEEPEN`).
 *
 * The accent needed nearly half to stop reading as one more chip; red is already the color
 * nothing else on the page is, so the pull is only there to fit it to the page — darker on
 * light, lighter on dark. At 0.45 the dark theme's pure red would be `#F56D6E`, a light coral
 * ΔE 12 from `crit`; at 0.4 it is a clear light red, and 0.4 is still enough to keep the bottom of
 * a breath (`TOUR_INK_FLOOR`) above the graphic threshold on the lightest dark surface (3.25:1 for
 * the rosier red of 2026-09-26). Unchanged that day: pulling harder is how a red turns into `crit`.
 */
export const TOUR_DEEPEN = 0.4;

export const tourInk = (pageInk: string): string => composite(GLOW_SEED, pageInk, TOUR_DEEPEN);

/**
 * THE MARK'S OTHER INK, FOR A CONTROL ON A RUNNING TIMER'S CARD: the page's own solid surface, white
 * in light and the dark surface in dark (the owner, 2026-10-01: *"on step 1 tour, i chose
 * breastfeeding, but the red module doesnt breath enough and breastfeeding module is also
 * pink-red-ish; making it hard to see"*).
 *
 * The tour marks the stop of the timer card 1 started, and that stop is a pill on the running card:
 * the breastfeed card's rose, the pump's green, the indigo of sleep and tummy time. The edge of the
 * mark is drawn on the pill, in this red, and reads there. Its glow, the part that breathes, falls
 * on the card, and a red glow on a rose card is no glow at all: measured as the app draws them, the
 * glow's strongest band in red is ΔE 18.7 off the breastfeed picture in light, and ΔE 2.0 off it in
 * dark, where the tour's red and the deepened rose are the same color (ΔE 3.6). In this ink it is
 * ΔE 40.7 and 40.9 off them, and at least 25 off every running card in either theme
 * (`apps/mobile/src/tour/glow.test.ts` walks them). So on a running card the glow is drawn in this
 * ink and the edge stays red: the mark is still the tour's, and its breath can be seen.
 *
 * A PALETTE ROLE, NOT A NEW COLOR. The solid surface is what every card and sheet is made of, so a
 * glow in it reads as light round the pill in light and as shade round it in dark, and in the amber
 * Night no glow is drawn at all (`markLayers`). The red keeps 3:1 against it at the bottom of its
 * breath in every theme (`glow.test.ts`), so the two inks never run together.
 */
export const tourHalo = (palette: { surfaceSolid: string }): string => palette.surfaceSolid;

/**
 * THE LEAST THE TOUR EVER DRAWS ITS INK AT: the bottom of a breath, as a fraction of each band's
 * full strength.
 *
 * Here, beside the ink, and not with the geometry, because it is a CONTRAST number: the edge of
 * the mark is drawn at this opacity once per breath, and `glow.test.ts` measures the ink
 * composited at it against every ground it can sit on, in every theme, scheme and skin — so "the
 * low point is still clearly visible" is a gate, not a hope. It was 0.8 on the edge and 0.55 on
 * every band outside it, which moved the other way: the edge brightened exactly while the glow
 * faded, and across a whole breath the mark's ink hardly changed. Every band dims to the same
 * fraction together and comes back together (`bandOpacity` in `apps/mobile/src/tour/glow.ts`).
 *
 * 85% on 2026-09-25 — a 15% swing, three times the old breath's, which the owner found too intense
 * the next day — and 90% since: a 10% swing, between the two, and a gentler low point for the gate
 * (worst 5.40:1 in light, 3.25:1 in dark, 3.76:1 at night).
 */
export const TOUR_INK_FLOOR = 0.9;
