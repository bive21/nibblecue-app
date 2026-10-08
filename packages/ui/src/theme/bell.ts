/**
 * THE BELL SWITCH'S COLORS (`BellSwitch`; the owner, 2026-09-25, of the "that's cool" list, idea
 * 5) — every one of them a role of the palette being painted, and none of them new.
 *
 * WHY THE PALETTE AND NOT A PICTURE'S OWN COLORS, when setup's day/night switch keeps its sky in
 * `sky.ts` apart from the theme. That switch is what CHANGES the theme, so a sky drawn from the
 * palette would repaint itself half way through its own roll; this one changes a reminder, and
 * nothing it does repaints the app. So it can be what it is: an ordinary switch with a bell on it.
 * Every settings page around it is full of platform switches — setup's Do not disturb sits a
 * step after thirteen of them — and a bell switch in colors of its own would read as a different
 * kind of control rather than the same control, a little more awake.
 *
 * THE PLATFORM SWITCH'S OWN PAIRS (`Switch.tsx`), for its reason: off is the `line2` track with a
 * `text2` knob, on is the `accent` track with an `onAccent` knob, so the two states differ in the
 * track AND the knob and not in hue alone — and the knob's POSITION says it before either does.
 * The bell is drawn on the knob in the knob's opposite: the accent on the `onAccent` knob (the
 * pair every filled button already puts its label in), the card's own `surfaceSolid` on the
 * `text2` knob. The "z"s drift over the ground ABOVE the pill, where a row's ground is the same
 * whether the switch is on or off, so they are one ink — `text2`, the one verified on every ground.
 *
 * WHAT IS MEASURED (`bell.test.ts`), in all six schemes and all three themes, on the grounds a row
 * actually sits on — a card, the page and the paper:
 *
 *   - each knob against its track clears 3:1 (WCAG 1.4.11: the part of a control that shows its
 *     state), the off track measured as it lands — `line2` is translucent, so over each ground;
 *   - each bell against its knob clears 3:1: it is a mark, and the only thing on the knob;
 *   - the "z"s against every ground clear 3:1 as marks (they clear 4.5).
 *
 * THE AMBER NIGHT THEME needs no set of its own, because the palette already is one: under night
 * every role below IS the night palette's (a scheme contributes only its accent there, which the
 * test measures too). What night changes is motion, not color — nothing moves and nothing drifts
 * (`BellSwitch` reads `t.theme`), so the "z"s are never drawn there at all.
 */
import type { Palette } from './theme';

export interface BellColors {
  /** The track: `line2` off (translucent — measured over its ground), `accent` on. */
  trackOff: string;
  trackOn: string;
  /** The knob: `text2` off, `onAccent` on. */
  knobOff: string;
  knobOn: string;
  /** The bell on each knob: the knob's opposite. */
  bellOff: string;
  bellOn: string;
  /** The "z"s, over the ground above the pill. */
  z: string;
}

export const bellColors = (p: Palette): BellColors => ({
  trackOff: p.line2,
  trackOn: p.accent,
  knobOff: p.text2,
  knobOn: p.onAccent,
  bellOff: p.surfaceSolid,
  bellOn: p.accent,
  z: p.text2,
});
