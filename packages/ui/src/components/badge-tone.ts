/**
 * Badge tones (docs/DESIGN_SYSTEM.md §5, §12 rules 3, 6 and 7): each tone is a soft companion
 * as the fill with the tone's own ink on it, and the ink is MEASURED (ink.ts) because a badge
 * is text, not a glyph. `accent` takes `accent2`, the pair the token gate verifies at 4.5:1 on
 * `accentSoft` (the flat `accent` is checked there too, but with less margin, and a badge is the
 * smallest type in the system). `warn` sits on the amber tint and `crit` on the rose tint: the
 * status inks have no soft companion of their own, and these are the tints whose temperature
 * matches. Status is never the only signal — the badge always carries its word.
 *
 * `info` IS THE CALM ONE: the fixed cool hue (`cyan` on `cyanSoft`) for a status that is simply
 * there — a vaccine window that is open, a plan, a date still weeks off (the owner, 2026-09-26:
 * "the rest … should remain a calm color like blue"). It is not `accent`, on purpose: a scheme
 * moves the accent, and on the rose scheme a "calm" accent badge would be the same pink as a crit
 * one. The tokens' own note already names info beside good, warn and crit as a status hue no
 * scheme may touch.
 */
import type { Palette } from '../theme/theme';
import { readableInk } from './ink';

export type BadgeTone = 'neutral' | 'accent' | 'good' | 'warn' | 'crit' | 'milk' | 'info';
export const BADGE_TONES: readonly BadgeTone[] = [
  'neutral',
  'accent',
  'good',
  'warn',
  'crit',
  'milk',
  'info',
];

export interface BadgeColors {
  fill: string;
  ink: string;
  /** True when the tone's ink could not clear AA on its fill and the text ink took over. */
  fellBack: boolean;
}

function pairFor(c: Palette, tone: BadgeTone): { fill: string; ink: string } {
  switch (tone) {
    case 'neutral':
      return { fill: c.surface2, ink: c.text2 };
    case 'accent':
      return { fill: c.accentSoft, ink: c.accent2 };
    case 'good':
      return { fill: c.sleepSoft, ink: c.good };
    case 'warn':
      return { fill: c.milkSoft, ink: c.warn };
    case 'crit':
      return { fill: c.roseSoft, ink: c.crit };
    case 'milk':
      return { fill: c.milkSoft, ink: c.milk };
    case 'info':
      return { fill: c.cyanSoft, ink: c.cyan };
  }
}

export function badgeColors(color: Palette, tone: BadgeTone): BadgeColors {
  const pair = pairFor(color, tone);
  const ink = readableInk(pair.ink, pair.fill, color.text);
  return { fill: pair.fill, ink, fellBack: ink !== pair.ink };
}

/**
 * A TONE'S INK ON THE SOLID SURFACE, for a chip that sits on a TINTED card. The soft companion
 * would vanish into a card painted in a soft tint of its own — a cyan chip on the cyan vaccines
 * card is a word with no pill round it — so the chip takes `surfaceSolid`, as the icon square on
 * that card already does, and the tone's own ink is measured on it the same way `badgeColors`
 * measures it on the soft tint, falling back to the text ink when it cannot clear AA.
 */
export function badgeColorsOnSolid(color: Palette, tone: BadgeTone): BadgeColors {
  const pair = pairFor(color, tone);
  const ink = readableInk(pair.ink, color.surfaceSolid, color.text);
  return { fill: color.surfaceSolid, ink, fellBack: ink !== pair.ink };
}
