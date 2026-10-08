/**
 * WHERE THE PARTS OF THE OWNER'S PICTURES ARE — the ones a running timer moves (2026-09-26; the
 * move itself is `packages/ui/src/components/timerMotion.ts`).
 *
 * The pictures are finished drawings, so the air above a sleeping baby cannot be asked where it is:
 * it was MEASURED from the owner's sleeping picture of 2026-09-26, in the shipped picture's own
 * pixels (1280 × 427, as `render-card-art.mjs` renders it), and `cardArtParts.test.ts` reads the
 * picture back and holds every number to what is in it. A swapped artwork fails that test rather
 * than drifting "z"s across the wrong corner of a new picture on a phone.
 *
 *   THE NAP'S "Z"S are born just behind the top of the sleeping baby's head, in the plain lavender
 *     between the head, the star on its mobile and the two sparkles by the ear, and rise 76 px, up
 *     and a little right, past the star — never over the moon, the star, its string, a sparkle, the
 *     baby or the cloud. The test walks every frame of every "z" over the picture, holds the
 *     picture's own deep hue they are drawn in to 3:1 on every pixel under them (the path measures
 *     5.2:1 at its worst), and keeps them on the card, while they can be seen, at every phone size
 *     and every text size. The rise is what the widest phones allow: a 3:1 picture on a short, wide
 *     card is cropped at its top, and a "z" still visible there would be cut off by the card's edge.
 *
 * THE MOON AND THE TUMMY-TIME BABY NO LONGER MOVE (they breathed and pushed up in the old
 * pictures): the new moon cradles the baby's head and the new baby reaches for its rings, so a
 * window that moved either would move the baby's face or carry a hand across a toy.
 */
import type { ArtParts } from '@nibblecue/ui';
import type { ART_MEASURED } from './cardArt.generated';

export const ART_PARTS: Readonly<Partial<Record<keyof typeof ART_MEASURED, ArtParts>>> = {
  sleep: {
    zs: { from: { x: 750, y: 150 }, to: { x: 786, y: 74 }, size: 34, sway: 9 },
  },
};
