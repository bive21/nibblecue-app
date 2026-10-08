/**
 * The mirror's containers as the core ranking sees them (docs/MILK_STASH.md §6b): each row plus
 * the two dates its location's condition gives it under the household's guidance profile. Pure —
 * a screen and a test both go through here, so what the bottle sheet's chips promise is what
 * the draw does.
 */
import {
  guidanceDates,
  isPastWindow,
  milkCondition,
  rankForUse,
  type MilkGuidanceProfile,
  type MilkStorageKind,
  type RankedCandidate,
  type ReasonFormat,
  type StashCandidate,
} from '@nibblecue/core';
import type { StashContainerRow } from '../db/queries/stash';

/** A container whose location row is missing from the mirror reads as fridge: the shortest
 *  plain window, so nothing is ranked ahead of milk it should not be. */
const FALLBACK_KIND: MilkStorageKind = 'FRIDGE';

export function candidateOf(
  row: StashContainerRow,
  profile: MilkGuidanceProfile | null,
): StashCandidate {
  // the condition the milk is DATED by: a thawed bag moved on to the plain fridge is still on
  // the thawed clock, so it ranks with the thawed milk, ahead of the fridge (core `milkCondition`)
  const kind = milkCondition(row.location_kind ?? FALLBACK_KIND, row.thawed_at);
  const dates =
    profile === null
      ? null
      : guidanceDates(profile, kind, {
          pumped_at: row.pumped_at,
          first_frozen_at: row.first_frozen_at,
          thawed_at: row.thawed_at,
        });
  return {
    id: row.id,
    amountMl: row.amount_ml,
    status: row.status === 'THAWING' ? 'THAWING' : 'STORED',
    kind,
    pumpedAt: row.pumped_at,
    firstFrozenAt: row.first_frozen_at,
    thawedAt: row.thawed_at,
    locationName: row.location_name,
    locationShort: row.location_short,
    bestUseAt: dates?.bestUseAt ?? null,
    limitAt: dates?.limitAt ?? null,
  };
}

export function rankRows(
  rows: readonly StashContainerRow[],
  profile: MilkGuidanceProfile | null,
  nowMs: number,
  format: ReasonFormat,
): RankedCandidate[] {
  return rankForUse(
    rows.map(r => candidateOf(r, profile)),
    nowMs,
    format,
  );
}

/**
 * WHAT TODAY COUNTS AS THE STASH: milk still inside its best-use window (the owner, 2026-10-07: "it
 * counts milk that is already past window. i think it shouldnt count it in both use soon or total
 * stash"). Past-window milk stays in the household's list on the Stash tab, on its own "Past window"
 * line, and stays usable (milk-guidance `display.rule`: the app never declares a container
 * unusable); it is only not added into the amount Today and the widgets call the stash. Its places
 * lose it too, so the tile's places add up to its total.
 */
export function inWindowStash<
  L extends { location_id: string; totalMl: number; containers: number },
>(
  rows: readonly StashContainerRow[],
  byLocation: readonly L[],
  profile: MilkGuidanceProfile | null,
  nowMs: number,
): { rows: { row: StashContainerRow; candidate: StashCandidate }[]; byLocation: L[] } {
  const all = rows.map(row => ({ row, candidate: candidateOf(row, profile) }));
  const past = all.filter(x => isPastWindow(x.candidate.bestUseAt, nowMs));
  if (past.length === 0) return { rows: all, byLocation: [...byLocation] };
  const out = new Map<string, { ml: number; n: number }>();
  for (const { row } of past) {
    const o = out.get(row.location_id) ?? { ml: 0, n: 0 };
    out.set(row.location_id, { ml: o.ml + row.amount_ml, n: o.n + 1 });
  }
  return {
    rows: all.filter(x => !isPastWindow(x.candidate.bestUseAt, nowMs)),
    byLocation: byLocation
      .map(l => {
        const o = out.get(l.location_id);
        return o === undefined
          ? l
          : { ...l, totalMl: Math.max(0, l.totalMl - o.ml), containers: l.containers - o.n };
      })
      .filter(l => l.containers > 0),
  };
}
