/**
 * THE MARKS A CHOICE CARRIES, in the palette's own roles — the ring round the chosen option, the
 * check on it, the lock on one that is sold. The Appearance sheet has two rows of options drawn as
 * PICTURES rather than words (the owner, 2026-09-25: the six colors in one row of swatches, and
 * the two designs as two preview tiles), and a picture can be any color at all, so the marks that
 * say which one is chosen cannot borrow a color from it. They are read from here by both the
 * `Swatch` and the `SkinTile`, so the sheet has one selection language and not two.
 *
 * WHY THE TEXT INK, AND NOT THE ACCENT. The ring and the check badge are drawn in `text`, the ink
 * with the most contrast against every surface the palette has — the swatch's ring has always been
 * that, because it has to read on six different gradients, and the accent is one of them. The
 * check glyph on the badge is `surfaceSolid`, the badge's inverse, and the same color is the thin
 * ring of air between a mark and the picture it sits on, so a dark ring never touches a dark
 * picture. The lock is the one the swatch always drew: `text2` on a solid disc edged in `line`.
 *
 * NOTHING HERE IS NEW, and nothing moves with a picture. Every value is a role the resolver already
 * paints, so a mark follows the theme and the scheme with the rest of the sheet, and night — which
 * has its own amber `text` and near-black `surfaceSolid` — gets marks that are amber and dim like
 * everything else at 3 a.m. `choiceMarks.test.ts` measures every one of them, in every theme and
 * every scheme, against what it can sit on.
 */
import type { Palette } from './theme';

export interface ChoiceMarks {
  /** The ring round the chosen option. */
  ring: string;
  /** The clear ring between a mark and the picture it sits on. */
  ringGap: string;
  /** The chosen option's check badge. */
  badge: string;
  /** The check drawn on the badge. */
  check: string;
  /** The solid disc a lock sits on, and its edge. */
  lockDisc: string;
  lockEdge: string;
  /** The lock glyph. */
  lock: string;
}

export const choiceMarks = (p: Palette): ChoiceMarks => ({
  ring: p.text,
  ringGap: p.surfaceSolid,
  badge: p.text,
  check: p.surfaceSolid,
  lockDisc: p.surfaceSolid,
  lockEdge: p.line,
  lock: p.text2,
});
