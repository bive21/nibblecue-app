/**
 * THE HOUSEHOLD'S WORD FOR A MODULE. Every surface that names a module the household can rename
 * reads its label through here rather than from the registry — the one difference today is
 * tummy time, which a parent can graduate into "Playtime" under What you track
 * (`packages/core/src/modules/variants.ts` has the whole of it). `label` is the word as a title
 * ("Playtime"), `word` the same word inside a sentence ("playtime"); for every other module both
 * are the registry's, so a screen loses nothing by asking here for all of them.
 *
 * `labels.test.ts` fails the build for a surface that can show the tummy module and still reads
 * `MODULE_BY_ID[…].label` directly.
 */
import {
  moduleLabelFor,
  moduleWordFor,
  variantsFromRows,
  type ModuleVariants,
} from '@nibblecue/core';
import { useMemo } from 'react';

/**
 * NibbleCue reads no household's module variants (CuddleCue's age-dependent names, like "Bottle"
 * becoming "Cup"): its one logged module is solids, whose name never changes.
 */
const NO_VARIANTS: ModuleVariants = variantsFromRows([]);

export interface ModuleLabels {
  variants: ModuleVariants;
  label: (moduleId: string) => string;
  word: (moduleId: string) => string;
}

export function useModuleLabels(): ModuleLabels {
  const variants = NO_VARIANTS;
  return useMemo(
    () => ({
      variants,
      label: (id: string) => moduleLabelFor(variants, id),
      word: (id: string) => moduleWordFor(variants, id),
    }),
    [variants],
  );
}
