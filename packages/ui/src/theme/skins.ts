/**
 * Three skins, one product (docs/DESIGN_SYSTEM.md §13, §22, §23). A skin is a coordinated
 * change of MATERIAL, radius and elevation — never of hue, text ink, spacing, hit targets,
 * copy, or typeface (§19: one face for words, one for numbers, and a skin may not introduce a
 * third). Everything a skin may change is a number here; the component tree never forks.
 *
 * The material numbers are the prototype's, measured against the rendered contrast sweep:
 * glass panels at ~52% with an 18px blur (26 until 2026-09-29, below), glass CHROME at ~80% with
 * a 30px blur (a bar carries labels over whatever scrolls beneath it, so it frosts harder than a
 * card), category tints at 55% under glass so the lit ground reads through, and a filled control
 * never frosted.
 *
 * A SHEET frosts hardest of all — the prototype's last word on `.sheet` is 88–90% over a 34px
 * blur (block 7905), after an earlier 52% let the page show through it. The owner read blurred
 * text through the app's sheet on the phone and said it hurt the eyes: a sheet is where a
 * parent types, and nothing behind it may compete with the form. Where a platform has no blur
 * (Android, see Surface.tsx) the sheet composites to opaque instead — the material's alpha is a
 * promise about what is readable through it, and 90% with no blur keeps that promise only if
 * the ground is plain.
 *
 * THAT PROMISE IS THE WHOLE MATERIAL'S, NOT THE SHEET'S ALONE, and for a year it was kept by
 * two of the three surfaces and broken by the one a parent looks at most. The chrome takes
 * `CHROME_ALPHA_WITHOUT_BLUR` and the sheet composites to opaque, both because Android draws no
 * BlurView; the CONTENT panel — every card, every `Rows` group, every Quick tile — went on
 * painting its 52% (and a category tint its 55%) over an unblurred ground, which is by
 * construction a fill halfway between the card and the page. The owner read it on an Android
 * phone as three separate complaints on the same day: the milk stash is flat, the shopping list
 * is flat, the Quick tiles are "too similar" to the background. `surfaceAlphaFor` and
 * `tintAlphaFor` below are the same rule the chrome and the sheet already had, finally applied
 * to the surface — one place, so the three can never drift apart again.
 *
 * WHAT A PANEL IS MADE OF is a material fact too (`fill`). In light, glass is white over the
 * lit ground — the prototype's `rgba(255,255,255,.52)` — and the color comes from what shows
 * through it. That is `solid` and not `surface`: `surface` is the SOFT skin's card material and
 * already carries an alpha of its own (`rgba(255,255,255,.86)`), so reading it here multiplied
 * the two and painted 44.7% where this table declares 52%. A material that does not paint its
 * own number is a material nothing can be measured against. In dark the white recipe vanishes:
 * a 5.5% white at 52% over a near-black ground is a 2.9% lift, which is the "mostly nothing" the
 * owner saw on the phone. The prototype's dark glass is a lavender at 14% (block 7839:
 * `rgba(148,140,205,.14)`); ours is the scheme's own soft tint (`accentSoft`, a token every
 * scheme already carries), so a rose household gets a wine-tinted glass and a lilac one a deep
 * violet. Measured against every ink in the matrix (theme/contrast.test.ts) before the number was
 * chosen: the prototype's raw accent at 14% fails `crit` at 3.77:1 in the sage scheme (retired
 * 2026-09-27); `accentSoft` at 70% holds 5.21:1.
 *
 * The four ORBS behind glass (theme/ground.ts) are the other half of that owner note, and
 * `orbAlpha` is their single scalar: 0 is none, and night forces 0 like the wash. It is the
 * PEAK, and at 1 an orb's core is not a tint over the ground — it IS the token, which is how a
 * panel came to measure 1.000:1 against the page it floats on (see the `orbAlpha` field).
 *
 * CALMER, ON BOTH PHONES (the owner, 2026-09-29, from an iPhone and an Android phone in Expo Go:
 * *"liquid glass effect on iphone is so intense, too shiny metallic. reduce the effect, while i
 * feel like on android it does not show too much … it needs to look premium and nice"*). What
 * read as metal on the iPhone was four layers — each composited at its strongest over the panel
 * it sat on and measured against it in ΔE76 (arithmetic, as everywhere in this folder; no phone
 * renders here):
 *
 *   1. THE LIFT, SEEN THROUGH THE GLASS — by far the largest, ΔE 6.7–10.6 on a white panel and
 *      7.9–9.1 on a tile. A translucent box has no opaque background, so React Native gives iOS no
 *      `shadowPath` and Core Animation draws the hue shadow from the pixels of everything in the
 *      panel, UNDER the panel, not clipped to its outside. The blur then sampled that shadow and
 *      saturated it, so every card carried its own colored cast, darkest at the foot — a bevel,
 *      which is what metal looks like. It is a box-shadow now on both platforms (Surface.tsx).
 *   2. THE SPECULAR WASH — a flat +28% white over the top-left 42% of a diagonal, falling to
 *      nothing by 72%: ΔE 0.8–1.4 on a white panel, 2.7–3.1 on a tinted tile, and a hard shoulder
 *      where the plateau ended, the glare band of brushed steel. It is `SPECULAR_ALPHA` at the
 *      top edge fading to nothing within `SPECULAR_DEPTH` now — light caught by the top edge.
 *   3. THE PLATFORM'S OWN MATERIAL — `UIBlurEffectStyleLight` brings a white veil and a strong
 *      saturation boost with it, and at a card's 78% intensity both were most of the way on. A
 *      card sits over a ground made only of soft gradients, where a heavier blur changes nothing
 *      the eye can see, so the content frost is 18 and not 26 (54% of the effect, not 78%).
 *   4. THE EDGE, which on the iPhone was not an edge at all: React Native draws a non-clipping
 *      view's border BEHIND its children, so the blur covered the white rim and smeared it into
 *      a glow along the inside of every panel (and hid a tile's category edge and a Quick tile's
 *      alert ring with it). The edge is drawn above the glass now, as a hairline of white at
 *      `GLASS_EDGE_ALPHA` — the one crisp line a material like this carries.
 *
 * And on Android, where the owner saw too little: a content panel is no longer opaque there. The
 * ground under a card is washes and orbs — soft gradients a blur would not change — so the panel
 * lets a quarter of it through (`SURFACE_ALPHA_WITHOUT_BLUR`) and carries the same top light,
 * edge and lift as the iPhone's. Glass on Android is the same material with the one ingredient
 * the platform lacks left out, rather than Paper with a shadow.
 */
import { composite } from './contrast';
import type { Palette } from './theme';

/**
 * TWO LOOKS, NOT THREE. `'soft'` — "layered warm surfaces" — is gone (the owner, 2026-09-18:
 * "remove Soft design"). It sat between the other two doing neither job: not the translucent
 * showpiece and not the flat quiet one, just a slightly rounder Paper with a wash behind it.
 *
 * A household stored on it lands on the default, because `isSkinName` no longer recognises the
 * string and `parseAppearance` falls back — the same path an older client's removed shape
 * already takes (§16.2). Nothing has to be migrated and nothing is lost but a preference.
 */
export type SkinName = 'glass' | 'paper';

/** Paper is the default and the free one; Glass is sold (entitlements `themes`). */
/**
 * PAPER, SINCE 2026-09-18, AND IT USED TO BE SOFT (the owner: "remove Soft design").
 *
 * Soft is gone from the product, so the default had to move, and the default is also the FREE
 * look — `isLocked` reads "anything that is not the default is Plus". Paper is the right one to
 * inherit that, for a reason beyond taste: it is the only skin that asks for no blur at all
 * ("Flat, quiet, high contrast"). Every household on the free plan, on every Android phone,
 * therefore gets a look that is exactly what it was designed to be rather than a translucent
 * one degrading to a flat approximation — which is the class of defect CONTRAST_FINDINGS §6a
 * was opened for.
 *
 * WHAT THIS COSTS, said plainly because it is a pricing consequence and not a style choice:
 * Plus used to sell "the Glass and Paper looks" and now sells Glass alone. That is one line in
 * `assets/entitlements.ts` and it is the owner's to reverse.
 */
export const DEFAULT_SKIN: SkinName = 'paper';

/**
 * Which token the fill is made of before `alpha` is applied: `surface` (the translucent white
 * of a card), `solid` (`surfaceSolid`, the chrome and the sheet) or `tint` (`accentSoft`, the
 * scheme's own soft color — dark glass).
 */
export type MaterialFill = 'surface' | 'solid' | 'tint';

export interface Material {
  /** What the fill is made of; see MaterialFill. */
  fill: MaterialFill;
  /** Opacity of the surface fill over the ground (1 = opaque). */
  alpha: number;
  /**
   * Blur radius behind the surface, in the prototype's CSS pixels; 0 = none. On iOS it is also
   * how much of the platform's blur material is used (Surface.tsx: `blur × 3`, capped at 100 —
   * its veil and its saturation come with it). Android draws no blur.
   */
  blur: number;
  /**
   * Which line token draws the edge. `glassEdge` is a hairline of white light at
   * `GLASS_EDGE_ALPHA`, drawn above the glass (Surface.tsx says why it has to be).
   */
  border: 'line' | 'line2' | 'glassEdge';
  /**
   * The top light: white at `SPECULAR_ALPHA` along the top edge, gone within `SPECULAR_DEPTH`.
   * Never on a pill, and never in dark or night.
   */
  specular: boolean;
  shadow: 'none' | 'card' | 'lift' | 'hue';
}

export interface SkinTokens {
  name: SkinName;
  label: string;
  note: string;
  radius: { s: number; m: number; l: number; xl: number; pill: number };
  /** Cards, rows, pickers, icon buttons. */
  surface: Material;
  /** The tab bar: chrome frosts harder than content. */
  chrome: Material;
  /** The bottom sheet and the popover: the page beneath is never legible through them. */
  sheet: Material;
  /** Category tints (`*Soft`) as fills: 1 = opaque, less = the ground reads through. */
  tintAlpha: number;
  /** Paper draws hairlines instead of shadows. */
  hairlines: boolean;
  /** The lit ground: the three radial washes behind every screen (0 = none). */
  groundWash: number;
  /**
   * The four soft-tint orbs behind glass (theme/ground.ts): the peak alpha of each orb's tint
   * token at its center, 0 = none. The tokens are the `*Soft` tints, never the raw hues — the
   * matrix showed a raw hue at any visible alpha costs `warn` its headroom on a panel over it.
   *
   * IT MUST STAY WELL BELOW 1, and that is not a taste. `orbStops` makes the profile flat inside
   * `r − blur`, so at a peak of 1 the core of each disc does not tint the ground, it REPLACES it:
   * the page there is exactly `roseSoft`, `milkSoft`, `sleepSoft` or `accentSoft`. Those are the
   * same four tokens a category tile is filled with and the same token dark glass is made of, so
   * a rose tile over the rose orb measured `#FCE1EC` on `#FCE1EC` — 1.000:1, ΔE 0.00, an object
   * that is not there — and a dark glass card over the accent orb measured `#2B2358` on
   * `#2B2358`. `.58` light and `.13` dark are the reference's own numbers
   * (prototype/ui-prototype.html `.orbs .blob`), which CONTRAST_FINDINGS §5b set when it moved
   * the reference off the saturated hues and which never reached this table.
   */
  orbAlpha: number;
  /**
   * What dark changes about the materials, as data: skinForTheme merges these over the skin
   * in dark (and drops the specular, which is a rule and not a number). Only glass has any.
   */
  dark?: {
    surface?: Partial<Material>;
    chrome?: Partial<Material>;
    sheet?: Partial<Material>;
    /** The orbs in dark, where the same alpha over a near-black ground is a far louder band. */
    orbAlpha?: number;
  };
}

/** The opaque token a material's fill starts from, before its alpha. Pure: the matrix uses it too. */
export const materialBase = (palette: Palette, m: Material): string =>
  m.fill === 'tint'
    ? palette.accentSoft
    : m.fill === 'solid'
      ? palette.surfaceSolid
      : palette.surface;

/**
 * The chrome's alpha where the platform cannot blur (Surface.tsx: Android draws no BlurView).
 * The bar's 80% in glass is a promise about what reads through it OVER a 30px blur; as a flat
 * fill it let the words scrolling under the bar read through its labels — every glass capture
 * of the design review (2026-09-15, A4), and the owner's phone. Without a blur the chrome takes
 * soft's 97%; a material that never blurred (paper, night) keeps its own number.
 */
export const CHROME_ALPHA_WITHOUT_BLUR = 0.97;
export const chromeAlphaFor = (m: Material, canBlur: boolean): number =>
  canBlur || m.blur === 0 ? m.alpha : Math.max(m.alpha, CHROME_ALPHA_WITHOUT_BLUR);

/**
 * A CONTENT panel's alpha where the platform cannot blur — the same rule as the chrome's and
 * the sheet's, and the one the cards never had.
 *
 * Glass's 52% is a recipe with two ingredients: the fill AND the blur under it. On iOS the blur
 * brings the platform material's own white veil and evens out anything sharp beneath a card, so
 * the 48% that comes through reads as light in the material rather than as the page. Take the
 * blur away and the same 52% is a veil: the card's color becomes, by construction, the midpoint
 * of the card and whatever it happens to be sitting on, and a panel that is the average of itself
 * and the page cannot separate from the page. Measured on the lit light ground it left the card
 * at 1.05:1 and ΔE 2.4 — under the just-noticeable difference for a field that size, which is
 * exactly what the owner reported from an Android phone on the stash, the shopping list and the
 * Quick tiles.
 *
 * 76%, SINCE 2026-09-29; OPAQUE BEFORE THAT. Opaque answered the arithmetic above and cost the
 * material. The owner, on the same Android phone: *"on android it does not show too much … we are
 * making liquid glass a plus feature, it needs to look premium"*. An opaque white card over the
 * lit ground is Paper's card with a shadow: nothing of the ground came through it, and the top
 * light and the light edge were white on white. The look a household pays for did not show on
 * the platform least able to show it.
 *
 * The number between the two is measured, not split. At 76% a card still stands off the plain
 * page by ΔE 3.1–5.0 in light (4.0–6.8 opaque; 2.1–3.3 at the old 52%) and off the busiest wash
 * point by 6.6–10.9, while an orb under it still shows through by ΔE 2.6–3.6 — the color seeping
 * into the glass that says what the material is. A blur is not what is missing: the ground a card
 * floats on is soft gradients all the way down, and a blur would leave them as they are.
 * `ground.test.ts` holds every panel a JND off every ground at this alpha, and
 * `contrast.test.ts` measures every ink on the panel at it, over every orb — the declared 52% is
 * not what this platform paints, so it is not the only number measured.
 *
 * A category TINT stays opaque here (`tintAlphaFor`, below): those were the three surfaces the
 * owner named, and a tint over a ground made of the same four soft tokens has no alpha to spare.
 * A translucent panel takes a box-shadow and never an `elevation` (shadows.ts).
 *
 * STILL THE ONE NUMBER TO MOVE. 1 puts the opaque cards back; nothing else needs touching.
 */
export const SURFACE_ALPHA_WITHOUT_BLUR = 0.76;
export const surfaceAlphaFor = (m: Material, canBlur: boolean): number =>
  canBlur || m.blur === 0 ? m.alpha : Math.max(m.alpha, SURFACE_ALPHA_WITHOUT_BLUR);

/**
 * A CATEGORY TINT's alpha, under the same rule: `tintAlpha` is a panel's alpha by another name,
 * and glass's 55% buys "the lit ground reads through a soft tint" only over a blur.
 *
 * `canBlur` is not only the platform. A tint painted on a view that never carries a BlurView —
 * the Quick bubble's disc, a row's 32pt icon chip — has no blur on ANY platform, so it passes
 * false and takes the full tint. That disc was the worst case of the three shapes: 55% of a soft
 * token over the app ground, on a lit ground made of the same family, which is a pale wash where
 * the household chose a color.
 */
export const tintAlphaFor = (s: SkinTokens, canBlur: boolean): number =>
  canBlur || s.surface.blur === 0 ? s.tintAlpha : 1;

/**
 * THE EDGE OF A TINTED PANEL: how much of its own category hue is blended into its border.
 *
 * A neutral line cannot mark the boundary of a colored object — a `line` at 15% over a soft tint
 * is the soft tint. And the fill alone cannot always carry the separation either, because a
 * scheme's `accentSoft` and a theme's `pageCool` are near neighbours by design (Ocean: `#DBEBF8`
 * against `#D6E8F8`), so an accent-tinted tile on the cool wash is the same blue however opaque
 * it is. What is always available is the CATEGORY, which is a different hue from the ground by
 * construction — usage rule 4 in theme.ts makes that a product guarantee, not a coincidence.
 *
 * The Quick bubble has drawn its ring this way since it was built (`composite(cat.soft, cat.fg,
 * …)`); the pebble and the capsule took the neutral material line instead, which is the same
 * one-shape-and-not-the-others split as the alphas above. One constant, so the four shapes and
 * every tinted card agree.
 */
export const TINT_EDGE = 0.28;

/**
 * THE LIGHT EDGE (`border: 'glassEdge'`): a hairline of white at this alpha, drawn above the glass.
 *
 * It was a full point of opaque white, and on the iPhone it was never seen as a line. React Native
 * draws a non-clipping view's border behind its children, so the blur covered it and smeared it
 * into a glow along the inside of the panel — a lit bevel, part of what read as metal. Drawn above
 * the fill now (Surface.tsx), it is one crisp line and can afford to be quiet: one device pixel,
 * not quite white, which on a pale panel over a pale page shows where the page behind it is
 * colored and nowhere else (ΔE 1.3–2.2 against a 76% panel, 7.8–13 against the page). The panel
 * keeps its 1pt border for layout; only what is painted there changed.
 */
export const GLASS_EDGE_ALPHA = 0.6;

/**
 * THE TOP LIGHT (`specular`): white at `SPECULAR_ALPHA` along a panel's top edge, fading to
 * nothing within `SPECULAR_DEPTH` points, whatever the panel's height.
 *
 * It replaced a diagonal wash — a flat 28% over the top-left 42% of the panel, then a ramp to
 * nothing by 72% — whose plateau and shoulder were the glare band of brushed steel (ΔE 2.7–3.1 on
 * a tinted tile). Light caught by a top edge falls off within a finger's width and has no
 * shoulder, and in points rather than as a fraction of the height a tall card is lit along its
 * top instead of down half its face. At 0.14 it is ΔE 1.0–2.0 on a tile and under 1.2 on a white
 * panel: the difference between a pane and a sheet of plastic, and no more. Never on a pill,
 * where a gloss across 36 points is a button from 2010; never in dark or night (`skinForTheme`).
 */
export const SPECULAR_ALPHA = 0.14;
export const SPECULAR_DEPTH = 40;

/**
 * HOW FAR A NAMED CARD IS PULLED TOWARDS ITS OWN HUE, and why one exists at all.
 *
 * The owner, 2026-09-18: *"change the color of milk stash to something more contrasting to
 * background, same with shopping list, and shopping list stays green and milk stash stays
 * yellow."* Two instructions in one sentence — further from the page, same hue — and a `*Soft`
 * token alone cannot obey both. It IS the hue, but it is also the palest step of it, chosen to
 * sit quietly behind a tile; on a page that is itself a warm or cool wash, the palest step of a
 * hue and the wash are neighbours (`TINT_EDGE` above has the measured Ocean case).
 *
 * So the fill is composited a third of the way from the soft step towards the full category
 * hue. That is the same move `TINT_EDGE` makes for a border, applied to the fill, and it keeps
 * the instruction that matters: the milk stash is still milk, the shopping list is still olive,
 * and neither becomes a saturated block — a third is a long way from the hue itself.
 *
 * It is NOT applied to every tinted card. A Quick tile is one of eight on a row and takes its
 * separation from the edge; these two are single, full-width, named cards whose whole job is to
 * be spotted from across a room while holding a baby. `0.34` is the number to move if the owner
 * wants them louder or quieter, and it moves both together, which is the point of it being here.
 */
const CARD_LIFT = 0.34;

/**
 * A named card's fill: its soft tint, pulled `CARD_LIFT` towards its own hue.
 *
 * Here rather than at the call site so the two cards cannot drift apart, and so the contrast
 * gate in `ground.test.ts` can measure the thing that is actually painted.
 */
export const liftedTint = (soft: string, hue: string): string => composite(soft, hue, CARD_LIFT);

export const SKINS: Record<SkinName, SkinTokens> = {
  glass: {
    name: 'glass',
    label: 'Liquid Glass',
    note: 'Translucent, blurred, floating',
    radius: { s: 14, m: 20, l: 26, xl: 30, pill: 999 },
    surface: {
      // `solid`, so 0.52 is the 0.52 the reference paints (`rgba(255,255,255,.52)`). Reading the
      // soft skin's `surface` token here multiplied its own 0.86 into this number and painted
      // 44.7% — the header has the account.
      fill: 'solid',
      alpha: 0.52,
      // 18, not the reference's 26 (2026-09-29): a card floats over soft gradients a heavier blur
      // cannot change, and on iOS the number is also how much of the platform material comes with
      // it — 54% of its veil and saturation rather than 78%, the foil the owner called metallic.
      // The chrome (30) and the sheet (34) keep theirs: they carry words over sharp content.
      blur: 18,
      border: 'glassEdge',
      specular: true,
      shadow: 'hue',
    },
    chrome: {
      fill: 'solid',
      alpha: 0.8,
      blur: 30,
      border: 'glassEdge',
      specular: true,
      shadow: 'lift',
    },
    sheet: {
      fill: 'solid',
      alpha: 0.9,
      blur: 34,
      border: 'glassEdge',
      specular: true,
      shadow: 'lift',
    },
    tintAlpha: 0.55,
    hairlines: false,
    groundWash: 0.22,
    orbAlpha: 0.58,
    // Dark glass is made of the scheme's soft tint (header). The light edge is made of
    // `surfaceSolid`, which in dark is darker than the tinted panel it would sit on, so the edge
    // is the theme's own light `line` — drawn above the glass like the light one (Surface.tsx).
    dark: {
      surface: { fill: 'tint', alpha: 0.7, border: 'line' },
      chrome: { fill: 'tint', alpha: 0.85, border: 'line' },
      sheet: { fill: 'tint', alpha: 0.95, border: 'line' },
      // .13, not .58: the reference dims them by the same factor in dark, and it has to. A soft
      // tint is a LIGHT token, so the same alpha that quietly warms a light page is a bright band
      // on a near-black one — and dark glass is made of one of these four tokens itself, so an
      // orb left loud is the one ground its own panel cannot be seen against.
      orbAlpha: 0.13,
    },
  },
  paper: {
    name: 'paper',
    label: 'Paper',
    note: 'Flat, quiet, high contrast',
    radius: { s: 10, m: 14, l: 16, xl: 16, pill: 999 },
    surface: {
      fill: 'surface',
      alpha: 1,
      blur: 0,
      border: 'line2',
      specular: false,
      shadow: 'none',
    },
    chrome: { fill: 'solid', alpha: 1, blur: 0, border: 'line2', specular: false, shadow: 'none' },
    sheet: { fill: 'solid', alpha: 1, blur: 0, border: 'line2', specular: false, shadow: 'none' },
    tintAlpha: 1,
    hairlines: true,
    groundWash: 0,
    orbAlpha: 0,
  },
};

export const SKIN_NAMES = Object.keys(SKINS) as SkinName[];
export const isSkinName = (v: unknown): v is SkinName => typeof v === 'string' && v in SKINS;

/**
 * Night outranks every skin: no blur, no specular, no shadow, no wash, no orbs — at 3 a.m.
 * there should be nothing on the screen that is not information (§22). The radius stays the
 * skin's. Dark keeps the skin and applies its own numbers (`dark`), then drops the specular.
 */
export function skinForTheme(skin: SkinTokens, theme: 'light' | 'dark' | 'night'): SkinTokens {
  if (theme === 'night') {
    const flat = (m: Material): Material => ({
      ...m,
      alpha: 1,
      blur: 0,
      specular: false,
      shadow: 'none',
      border: 'line',
    });
    return {
      ...skin,
      surface: flat(skin.surface),
      chrome: flat(skin.chrome),
      sheet: flat(skin.sheet),
      tintAlpha: 1,
      groundWash: 0,
      orbAlpha: 0,
    };
  }
  if (theme === 'dark') {
    // a highlight on a dark ground reads as a scratch, not as glass
    const d = skin.dark ?? {};
    return {
      ...skin,
      surface: { ...skin.surface, ...d.surface, specular: false },
      chrome: { ...skin.chrome, ...d.chrome, specular: false },
      sheet: { ...skin.sheet, ...d.sheet, specular: false },
      orbAlpha: d.orbAlpha ?? skin.orbAlpha,
    };
  }
  return skin;
}
