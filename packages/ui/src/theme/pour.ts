/**
 * THE POUR SWITCH'S COLORS (`PourSwitch`; the owner, 2026-09-27, of setup's "Feeding and milk"):
 * the platform switch's own off pair, the module's own ink as the milk, and a knob that reads on it.
 *
 * OFF IS THE PLATFORM SWITCH'S OFF (`Switch.tsx`, `theme/bell.ts`): the `line2` track with a
 * `text2` knob, so a row of these at rest looks like every other switch in setup, and the two
 * states differ in the track AND the knob, never in hue alone. The knob's POSITION says it first.
 *
 * ON, THE TRACK IS THE MODULE'S OWN INK, poured in: `categoryColors(...).fg`, the hue that names
 * the module on every other surface (breastfeeding's rose, the pump's green, the bottle's amber,
 * solids' olive), because the page is four ways of feeding and each row pours its own. The ink is
 * the role that paints a line or a label, so it is measured to read against a card, which is what
 * a filled track has to do. The knob on it is `surfaceSolid`, the card's own color: white in
 * light, the dark card in dark and in the amber Night, so it stands against the ink in every theme
 * (`pour.test.ts` measures it: 4.6:1 at the least, over a 3:1 floor).
 *
 * THE GLOW is the same ink at `POUR_GLOW` strength, and it is null in the amber NIGHT, where
 * nothing on the screen glows (docs/DESIGN_SYSTEM.md §7), and null on a design that draws no
 * shadows (Paper), where a halo would be a second material: the rule `moduleCard.ts` keeps for the
 * card that lights up.
 */
import { withAlpha } from './contrast';
import type { Palette, ThemeName } from './theme';

/** How strong the glow is at its brightest: a soft ring, never a second track. */
export const POUR_GLOW = 0.35;

export interface PourColors {
  /** The empty track: `line2`, translucent, measured over the ground it lands on. */
  trackOff: string;
  /** The knob: `text2` off, the card's own `surfaceSolid` on the milk. */
  knobOff: string;
  knobOn: string;
  /** The milk: the module's own ink, as the caller hands it in. */
  milk: string;
  /** The glow round a full track, or null where nothing may glow. */
  glow: string | null;
}

export const pourColors = (
  p: Palette,
  milk: string,
  theme: ThemeName,
  glows = true,
): PourColors => ({
  trackOff: p.line2,
  knobOff: p.text2,
  knobOn: p.surfaceSolid,
  milk,
  glow: theme === 'night' || !glows ? null : withAlpha(milk, POUR_GLOW),
});
