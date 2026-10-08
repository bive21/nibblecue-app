/**
 * THE PARTY HAT'S COLORS (`PartyHat`; the owner, 2026-09-26) — every one a role of the palette
 * being painted, and none of them new.
 *
 * THE HOUSEHOLD'S OWN COLOR, BY DAY AND IN DARK: the cone in `accent2` — the accent's INK, the one
 * that stands furthest from the surfaces in either theme (deeper by day, lighter in dark) — its two
 * bands in `onAccent`, and the pom-pom in `accent` itself. A hat in the scheme the household chose
 * is theirs, the way the avatar's gradient under it is.
 *
 * WHY THE INK AND NOT THE ACCENT FOR THE CONE: the cone's base is the one part of the hat that lies
 * on the avatar, and the avatar is the accent's own gradient. In dark Sage (a scheme until
 * 2026-09-27) the accent measured 2.95:1 against the gradient's deeper stop, and the keyline, dark
 * on a dark gradient, 2.48:1; the ink clears it (3.81:1 there, and 3.32:1 at its worst anywhere, on
 * dark Reef's lighter stop). The pom-pom never lies on a head (`components/partyHat.test.ts`
 * proves it for every hat), so it can be the brighter accent.
 *
 * ONE KEYLINE ROUND ALL OF IT, in `surfaceSolid`: the chip's own solid surface, the ring the pair's
 * discs already wear to part two circles of one gradient (`childPair.ts`). The avatar under the hat
 * IS the accent's gradient, so without it a teal hat on a teal head would be a bump on the head.
 * With it, wherever the hat sits one of two edges carries it: the keyline, where the ground is far
 * from the chip's surface (the gradient, a dark sky), or the hat's own colors, where the ground is
 * near it (the chip, the paper, a pale sky) and the keyline melts into it.
 *
 * THE AMBER NIGHT draws it from the night palette's inks, never its accent — a scheme's accent
 * reaches night unchanged (`resolvePalette`) and can be a blue, which night exists to keep out of a
 * dark room: the cone in `text3`, its bands in `surfaceSolid`, the pom-pom in `text2`. Dim, amber,
 * nothing that shines, and it does not move (`motionStill`).
 *
 * WHAT IS MEASURED (`partyHat.test.ts`), in all six schemes and all three themes: each part against
 * the part it lies on (the bands on the cone, the cone and the pom-pom on their keyline) at 3:1, and
 * the hat as a whole against every ground it can be drawn over — the avatar's gradient, the chip in
 * both skins over everything the bar can sit on, the paper and the doodle pattern, and Today's sky
 * all the way down its fade — at 3:1, by the keyline or by its own colors. The baby's own picture
 * is the one ground nothing can be measured against: it can be any color at all, which is what the
 * keyline is for. Night hides the picture anyway (`ChildChip`).
 */
import type { Palette, ThemeName } from './theme';

export interface PartyHatColors {
  cone: string;
  stripe: string;
  pom: string;
  /** The keyline round the cone and the pom-pom. */
  halo: string;
}

export const partyHatColors = (p: Palette, theme: ThemeName): PartyHatColors =>
  theme === 'night'
    ? { cone: p.text3, stripe: p.surfaceSolid, pom: p.text2, halo: p.surfaceSolid }
    : { cone: p.accent2, stripe: p.onAccent, pom: p.accent, halo: p.surfaceSolid };
