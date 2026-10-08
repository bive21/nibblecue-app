/**
 * A MODULE'S SECOND LIFE (the owner, 2026-09-19: "at a later point once baby doesnt do tummy
 * time anymore, it needs to 'graduate' from it and become playtime").
 *
 * Tummy time is the one so far. A baby outgrows it in a few months, and the thing the household
 * keeps timing afterwards — floor time, play — is the same act with a different name: a timer,
 * a daily goal in minutes, a few short goes that add up. So the graduation changes the WORD and
 * only the word. The module keeps its id, its timer, its goal, its card, its icon and every entry
 * ever logged under it; a row logged as tummy time in March is still a `tummy` activity in
 * September, so nothing is rewritten and nothing is lost (CLAUDE.md §2 rule 7, §7). Reports and
 * the export read the id, which is why a household's history does not split in two on the day
 * they flip the switch.
 *
 * THE HOUSEHOLD DECIDES, NEVER THE APP. The variant is a household setting
 * (`module_settings.variant`, migration 0098) a parent switches on under What you track, and
 * back off if they like. Nothing here proposes it, prompts for it or derives it from the baby's
 * age: the day a baby is done with tummy time is the household's to say, not a milestone the app
 * has an opinion about (CLAUDE.md §2 rule 3).
 *
 * `moduleLabelFor` is the one place a module's word is chosen. Every surface that names a module
 * a household can rename reads through it (the app's `useModuleLabels`), and `labels.test.ts` in
 * the app fails the build for a surface that reads the registry directly.
 */
import { MODULE_BY_ID, type ModuleId } from './module-registry';

export type ModuleVariant = 'playtime';

export interface ModuleVariantDef {
  /** The module this is a second life of. */
  of: ModuleId;
  /** The word, in the registry's case: "Playtime". */
  label: string;
}

export const MODULE_VARIANTS: Readonly<Record<ModuleVariant, ModuleVariantDef>> = {
  playtime: { of: 'tummy', label: 'Playtime' },
};

export const isModuleVariant = (v: unknown): v is ModuleVariant => v === 'playtime';

/** The variants a module may take — empty for every module but tummy time. */
export const variantsOf = (id: string): ModuleVariant[] =>
  (Object.keys(MODULE_VARIANTS) as ModuleVariant[]).filter(v => MODULE_VARIANTS[v].of === id);

/** The household's chosen variants, by module. Absent means the module's own word. */
export type ModuleVariants = Partial<Record<ModuleId, ModuleVariant>>;

/**
 * From the settings rows. Only a variant the module may take counts; an unknown value — a
 * newer build's word, a stray edit — reads as the plain module rather than as a crash or a
 * blank, because a label is never worth failing a screen over.
 */
export function variantsFromRows(
  rows: readonly { module_id: string; variant: string | null }[],
): ModuleVariants {
  const out: ModuleVariants = {};
  for (const r of rows) {
    if (!isModuleVariant(r.variant) || MODULE_VARIANTS[r.variant].of !== r.module_id) continue;
    out[r.module_id as ModuleId] = r.variant;
  }
  return out;
}

/** The module's word for this household: its variant's when it has one, else the registry's. */
export function moduleLabelFor(variants: ModuleVariants, id: string): string {
  const v = variants[id as ModuleId];
  if (v !== undefined && MODULE_VARIANTS[v].of === id) return MODULE_VARIANTS[v].label;
  return MODULE_BY_ID[id as ModuleId]?.label ?? id;
}

/** The same word inside a sentence: "tummy time", "playtime", "sleep". */
export const moduleWordFor = (variants: ModuleVariants, id: string): string =>
  moduleLabelFor(variants, id).toLowerCase();
