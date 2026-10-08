/**
 * WHERE A STORAGE PLACE'S PICTURE COMES FROM.
 *
 * The owner drew four (2026-09-19: *"use all these 4 images as the icons for milk stash
 * category… (freezer, deep freezer, fridge, and counter)"*): a bag of milk on the counter, a
 * refrigerator, a snowflake, ice cubes. They are illustrations with their own palette, so they
 * are IMAGES — the app's icon set is one stroke color on a 24 grid, recolored per theme, and a
 * drawing cannot live in it.
 *
 * `tools/brand/render-stash-icons.mjs` trims and scales the masters and writes both the PNGs
 * (PNG again since 2026-10-01: the lossless WebP they were for three days drew nothing on an
 * iPhone) and `stashArt.generated.ts`; `pnpm check:stash-icons` fails the build if either is
 * stale. Metro resolves an asset import at build time, so the sources cannot be built from a
 * variable — each kind names its own file, which is why this is a literal map rather than a
 * lookup.
 */
import deepfreezerArt from '../../assets/stash-kinds/deepfreezer.png';
import freezerArt from '../../assets/stash-kinds/freezer.png';
import fridgeArt from '../../assets/stash-kinds/fridge.png';
import roomArt from '../../assets/stash-kinds/room.png';
import thawedArt from '../../assets/stash-kinds/thawed.png';
import { STASH_ICON_SIZE } from './stashArt.generated';

export type StashArtKind = keyof typeof STASH_ICON_SIZE;

export interface StashArt {
  /** The imported picture. */
  source: unknown;
  width: number;
  height: number;
}

const SOURCES: Readonly<Record<StashArtKind, unknown>> = {
  ROOM: roomArt,
  FRIDGE: fridgeArt,
  FREEZER: freezerArt,
  DEEP_FREEZER: deepfreezerArt,
  THAWED: thawedArt,
};

const ART: Readonly<Record<StashArtKind, StashArt>> = {
  ROOM: { source: SOURCES.ROOM, ...STASH_ICON_SIZE.ROOM },
  FRIDGE: { source: SOURCES.FRIDGE, ...STASH_ICON_SIZE.FRIDGE },
  FREEZER: { source: SOURCES.FREEZER, ...STASH_ICON_SIZE.FREEZER },
  DEEP_FREEZER: { source: SOURCES.DEEP_FREEZER, ...STASH_ICON_SIZE.DEEP_FREEZER },
  THAWED: { source: SOURCES.THAWED, ...STASH_ICON_SIZE.THAWED },
};

/**
 * The picture for a storage kind, or `null` for one that has none.
 *
 * ALL FIVE KINDS HAVE ONE now that the owner has drawn thawing too (2026-09-19). `null` is
 * therefore about a build rather than a kind: AN ASSET THAT DID NOT RESOLVE IS NO PICTURE. Metro hands an asset import a registry id; if
 * the bundler has not picked the file up — a server started before the folder existed, a stale
 * cache — the import is `undefined` and `<Image>` draws nothing at all, silently. Falling back to
 * the glyph costs a decoration rather than a row, and `stashArt.test.ts` holds the five files at
 * the paths this module imports so a missing one fails the build rather than a phone.
 */
export const stashArtFor = (kind: string): StashArt | null => {
  if (!(kind in ART)) return null;
  const art = ART[kind as StashArtKind];
  return art.source ? art : null;
};
