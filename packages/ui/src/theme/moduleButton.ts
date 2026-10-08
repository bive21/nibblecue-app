/**
 * BACK IN USE ON 2026-10-06, WITH THE WHOLE SHEET: every log sheet is its module's color again, and
 * this time all of it, not the Save alone (`ModuleTheme`, `moduleAccent.ts`;
 * `apps/mobile/src/sheets/quick/modules/index.tsx` has the owner's words). For a few hours that
 * morning every sheet was the scheme's instead, because a module Save under scheme chips clashed.
 *
 * THE LOG BUTTONS WEAR THE MODULE'S COLOR (the owner, 2026-09-26: *"maybe the buttons to log these
 * activities (only when logging activities) should not be in theme color, perhaps it will look
 * better if it's in the module's color instead. think about it and if you agree, code it."*).
 *
 * AGREED, FOR A REASON BEYOND THE LOOK. A log sheet is already the module's from top to bottom —
 * its title, its path tiles, its pictures, the tile on Today that opened it — and then its one
 * button to press was the household's scheme teal, the only thing on the sheet that did not belong
 * to it. The primary button is the sheet's last word ("Save bottle", "Start feeding"); in the
 * module's own color it reads as the same thing the parent tapped to get here, which is exactly
 * what a tired eye checks before the tap. Everywhere else — Settings, the Plan, the account, the
 * schedule's own sheets — keeps the scheme's accent, because there the household's color IS the
 * subject (`ModuleTint` is only ever put round a log sheet's body).
 *
 * WHAT IT IS: the module's DEEP ink as a solid fill and a white label. The deep ink is the LIGHT
 * palette's module ink — the one tuned to carry white — pulled toward the palette's own `text` just
 * as far as a white label clears `MODULE_BUTTON_LABEL`, a little over AA, where the brand gradient's
 * lighter end sits (its `#1F7478` carries white at 5.3:1): a Save as heavy as every other primary
 * button, not a pastel. The same fill in light AND dark, as the brand gradient is a deep fill under
 * a white label in both; the dark palette's own inks are LIGHT, made to be read on a dark page, and
 * a button filled with one would be the brightest block on a dark sheet.
 *
 * …EXCEPT WHERE THE DEEP INK IS AN ALARM (`SOFT_BUTTON`; the owner, the same day: *"the red color is
 * too intimidating like in diaper, make the red a little softer, other color looks fine so far"*).
 * The diaper's ink is the reference's red-orange, and deepened until white could sit on it, it
 * became `#CC2207` — a jewel-tone red under white words, which is what every app's DELETE button
 * looks like; "Save wet diaper" read as a warning. The prototype recorded the cure the first time
 * this happened (its block 59, of the pastel cards): *"Every previous attempt kept the reference's
 * white type and then had to darken the fill until white could sit on it — which is how a playful
 * coral becomes a jewel tone … Satisfy it by moving the TYPE instead of the fill."* So the diaper's
 * button is a SOFT CORAL: the owner's own pastel swatch for the module taken a quarter of the way
 * toward its ink — `#F98E7D`, a salmon — with the words in that same ink shaded down to an oxblood
 * just as far as they clear the same `MODULE_BUTTON_LABEL` (`#690E00`, 5.53:1). A fill that light
 * does not part itself from a white sheet (2.3:1), so it carries an EDGE in the label's ink,
 * `MODULE_BUTTON_EDGE` wide, drawn inside the button — the path tile's own finished look, the
 * surface edged in the module's ink — and on a dark sheet the fill does it (5.9:1 and up). The same
 * paint in light and dark, as the deep ones are. Every other module keeps its deep fill.
 *
 * NIGHT KEEPS THE NIGHT PALETTE: `moduleButtonPaint` is null there, and the button is the amber
 * theme's own primary. Seven module hues at 3 a.m. are the thing that theme exists to prevent.
 *
 * Measured in `moduleButton.test.ts`: the label at 4.5:1 or more (by construction `MODULE_BUTTON_
 * LABEL`) on every module's fill, in every theme, scheme and skin the button can be drawn in — a
 * filled control is never frosted (§13 rule 1), so no skin can thin it — and the soft button's
 * boundary, its edge or its fill, at 3:1 or more against every ground a sheet is painted on.
 */
import { composite, contrastRatio } from './contrast';
import {
  moduleColor,
  moduleDiscSwatch,
  themes,
  type ModuleDiscName,
  type ThemeName,
} from './theme';

/** A module whose log buttons can be painted: every module with an ink of its own. */
export type TintModule = keyof typeof moduleColor;

export const isTintModule = (id: string): id is TintModule => id in moduleColor;

/** The ink role a module's button is painted from (`moduleColor`). */
export type TintRole = (typeof moduleColor)[TintModule];

/** What the label must clear on the fill: over AA with room, the brand gradient's lighter end. */
export const MODULE_BUTTON_LABEL = 5.5;

/**
 * THE ROLES WHOSE BUTTON IS SOFT, and the owner's swatch each starts from (see the header): only
 * the diaper's — and the note's, which wears the diaper's hue everywhere. A role is added here
 * only when its deep ink reads as an alarm; the rest are "fine so far" (the owner).
 */
export const SOFT_BUTTON: Readonly<Partial<Record<TintRole, ModuleDiscName>>> = {
  diaper: 'diaper',
};

/**
 * How far the soft fill goes from the pastel swatch toward the module's ink: a quarter — a salmon
 * with the presence of a primary button, not the pastel of a disc that could be read as disabled.
 */
export const SOFT_FILL_DEPTH = 0.25;

/** The soft button's edge, in points: the finished path tile's own 1.5 (`pathCard.ts`). */
export const MODULE_BUTTON_EDGE = 1.5;

export interface ModuleButtonPaint {
  /** The button's solid fill: the module's deep ink, or a soft role's coral. */
  fill: string;
  /** The label, the loader and the Save's check, drawn on it. */
  ink: string;
  /**
   * An edge drawn inside the button, `MODULE_BUTTON_EDGE` wide, where the fill alone does not part
   * it from the sheet (a soft role); null where it does.
   */
  edge: string | null;
}

/** The label: white, the brand gradient's own (`onGradient`), the light palette's `onAccent`. */
const LABEL = themes.light.onAccent;

/**
 * The deep ink for an ink role: pulled toward `text` a hundredth at a time until white clears the
 * target. Deterministic, and computed once per role (`PAINT`), never per render.
 */
export function deepInk(role: TintRole): string {
  const ink = themes.light[role];
  for (let step = 0; step <= 60; step += 1) {
    const fill = composite(ink, themes.light.text, step / 100);
    if (contrastRatio(LABEL, fill) >= MODULE_BUTTON_LABEL) return fill;
  }
  return composite(ink, themes.light.text, 0.6);
}

/**
 * A SHADE, NEVER A SECOND COLOR: the ink taken toward black, where `deepInk` takes it toward the
 * palette's `text`. `text` is a teal-black, and a red walked far toward it turns to gray on the way
 * (#E51F00 at 80% is #3C302F); toward black it stays the same red, only deeper — the oxblood the
 * soft button's words and edge are drawn in.
 */
const SHADE = '#000000';

/**
 * A soft role's paint: the swatch a `SOFT_FILL_DEPTH` of the way to the ink, and that ink shaded a
 * hundredth at a time until it clears the target on it. Deterministic, computed once per role.
 */
function softPaint(role: TintRole, disc: ModuleDiscName): Omit<ModuleButtonPaint, 'edge'> {
  const ink = themes.light[role];
  const fill = composite(moduleDiscSwatch[disc], ink, SOFT_FILL_DEPTH);
  for (let step = 0; step <= 100; step += 1) {
    const label = composite(ink, SHADE, step / 100);
    if (contrastRatio(label, fill) >= MODULE_BUTTON_LABEL) return { fill, ink: label };
  }
  return { fill, ink: SHADE };
}

const PAINT = new Map<TintRole, ModuleButtonPaint>();
const paintFor = (role: TintRole): ModuleButtonPaint => {
  const hit = PAINT.get(role);
  if (hit !== undefined) return hit;
  const disc = SOFT_BUTTON[role];
  const made: ModuleButtonPaint =
    disc === undefined
      ? { fill: deepInk(role), ink: LABEL, edge: null }
      : (() => {
          const soft = softPaint(role, disc);
          // the edge is the words' own ink: one oxblood for the label, the check and the rim
          return { ...soft, edge: soft.ink };
        })();
  PAINT.set(role, made);
  return made;
};

/** The paint of a log sheet's primary button; null in the Night, where the theme's own is drawn. */
export function moduleButtonPaint(module: TintModule, theme: ThemeName): ModuleButtonPaint | null {
  if (theme === 'night') return null;
  return paintFor(moduleColor[module]);
}
