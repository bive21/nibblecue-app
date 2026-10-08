/**
 * The `Use from stash` row's second line (PRODUCT_SPEC.md §6.1):
 * `Oldest first · 4 oz frozen Aug 22 · Deep freezer`.
 *
 * It describes the container a draw would take FIRST, in the order data/stash.ts walks them,
 * so what the row promises is what the save does. "frozen" or "fridge" is the container's
 * state, the date is when it went in, the place is the household's own location name. No
 * guidance window is quoted here: the milk-storage windows come from the versioned guidance
 * files in WP6 and are displayed with their source, never paraphrased into a row.
 */
import { dayText, type VolumeUnit } from '@nibblecue/core';
import { HINTS } from './copy';
import { volumeLabel } from './volume';

export interface StashRowInput {
  amountMl: number;
  status: string;
  pumpedAt: string;
  firstFrozenAt: string | null;
  locationName: string | null;
}

// `Oct 3`: core's kept formatter (the same options), not one built per stash row (2026-10-08)
const dayLabel = (iso: string, timeZone: string): string => dayText(Date.parse(iso), timeZone);

export function stashRowDetail(s: StashRowInput, unit: VolumeUnit, timeZone: string): string {
  const frozen = s.firstFrozenAt !== null;
  const when = dayLabel(frozen ? s.firstFrozenAt! : s.pumpedAt, timeZone);
  const state = s.status === 'THAWING' ? 'thawing' : frozen ? 'frozen' : 'fridge';
  const parts = [HINTS.stash, `${volumeLabel(s.amountMl, unit)} ${state} ${when}`];
  if (s.locationName) parts.push(s.locationName);
  return parts.join(' · ');
}

/** When there is nothing to draw from, the row says so instead of hiding. */
export const STASH_EMPTY = 'Nothing in the stash yet';
