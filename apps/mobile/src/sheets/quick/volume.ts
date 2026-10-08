/**
 * A volume as a parent reads it: `4 oz`, `5.25 oz`, `120 mL`, `1.25 L`. The number is the display
 * unit's, converted at the edge from the canonical ml (CLAUDE.md §6); the storage never sees a
 * float ounce. Pure, so the toast wording is a table test.
 *
 * ONE WRITER FOR THE WHOLE APP (2026-09-26). This used to have a rule of its own — a quarter ounce
 * read as itself only when its ml were EXACTLY a quarter's, one decimal otherwise — while Today and
 * the stash card wrote one decimal, so the owner's 7 oz + 7.25 oz read "14.25 oz" in one place and
 * "14.3 oz" in another. Both now say what core's `volumeText` says: every ounce amount on the
 * quarter-ounce grid it is typed on, milliliters whole, and a thousand of them as liters.
 */
import { volumeText, type VolumeUnit } from '@nibblecue/core';

export const volumeLabel = (ml: number, unit: VolumeUnit): string => volumeText(ml, unit);
