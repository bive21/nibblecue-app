/**
 * THE MANUAL PUMP FORM OPENS ON THE LAST SESSION (PRODUCT_SPEC §5.3: "Pump with the last session's
 * left/right"; the audit of 2026-09-24, timers Low). It opened on 3 oz + 3.5 oz for everybody,
 * whatever their pump gives, so every entry began by correcting two numbers the app made up.
 *
 * The last session is read the way the sheet's header rows read it (`pumpSummary`): household-wide,
 * and a PRIVATE session only for the person who logged it — a caregiver's form never opens on a
 * number they are not allowed to see. Its SHAPE comes too: a total-only session opens in total
 * mode, never split in half (`pumpForm.ts`). A household with no session yet keeps the defaults.
 *
 * HOW LONG OPENS ON THAT SAME SESSION (the owner, 2026-10-03: Already finished "is always 18
 * minutes on my phone. it should follow last entry, same way in oz"). The length is the session's
 * own start and end, in whole minutes, held to the stepper's top. No session yet, or one with no
 * end, leaves the 18 the form has always started on.
 *
 * Every pre-filled number is put ON THE STEPPER'S GRID (0.5 oz, 10 ml) before it is shown: a value
 * off the grid is drawn rounded and saved unrounded, so the form would say 4 oz and write 4.06
 * (the same audit's H5, for the numbers this form fills in itself).
 *
 * AND THE WAY THIS PHONE LAST ENTERED A PUMP: By side or Total only, remembered on the phone (the
 * owner, 2026-10-01; `pumpForm.ts` has why the switch exists). A parent whose pump gives one number
 * taps Total only once, and every pump after it opens there — the stopped timer's form as much as
 * "Already finished" — until they tap By side. It is the switch's own position, written when it is
 * moved on a new session (never by correcting an old one), so it is this person's pump and not the
 * household's: the other parent's phone keeps its own. A preference like the thermometer's scale
 * (`unitPrefs.ts`), so a sign-out clears it, and one that could not be read is simply not there.
 */
import { mlToVolume, volumeStep, volumeToMl, type VolumeUnit } from '@nibblecue/core';
import type { Db } from '../../../db/driver';
import type { KeyValueStore } from '../../../prefs';
import { setMode, type PumpMode, type PumpState } from './pumpForm';

export interface LastPumpAmounts {
  leftMl: number | null;
  rightMl: number | null;
  totalMl: number;
  /**
   * How long that session ran, in whole minutes, or null when it has no end. Callers that only
   * have amounts may omit it.
   */
  minutes?: number | null;
}

/** How long the finished form will hold. The stepper stops here (`PumpSheet`). */
export const PUMP_LENGTH_MAX = 120;

/**
 * Whole minutes between a session's start and end. A missing end, or an end before the start,
 * is null so the form keeps its own starting length. Longer than the stepper holds opens at
 * the stepper's top: that is the most this form can write.
 */
export function pumpLengthMinutes(startAt: string, endAt: string | null): number | null {
  if (endAt === null) return null;
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.min(PUMP_LENGTH_MAX, Math.max(0, Math.round((end - start) / 60_000)));
}

/** The newest pump session this viewer may see, as amounts, or null. */
export async function lastPumpAmounts(
  db: Db,
  householdId: string,
  viewerId: string,
): Promise<LastPumpAmounts | null> {
  const row = await db.get<{
    left_ml: number | null;
    right_ml: number | null;
    total_ml: number | null;
    start_at: string;
    end_at: string | null;
  }>(
    `select p.left_ml, p.right_ml, p.total_ml, a.start_at, a.end_at
       from activities a join pump_details p on p.activity_id = a.id
      where a.household_id = ? and a.type = 'pump' and a.deleted_at is null
        and (a.is_private = 0 or a.created_by = ?)
      -- THE SESSION THAT ENDED LAST, as Today's tile counts it (2026-10-06, the owner: "duration
      -- does not bring over from last entry"): ranked by start, a long session typed in afterwards
      -- lost to a shorter one that began later, and the form opened on that one's length
      order by coalesce(a.end_at, a.start_at) desc, a.start_at desc limit 1`,
    [householdId, viewerId],
  );
  if (row === undefined) return null;
  /*
    HOW LONG COMES FROM THE LAST SESSION THAT RAN (the owner, 2026-10-06: "duration does not bring
    over from last entry", over a form that opened on 0 min). A session stopped the moment it began,
    or typed in at 0, has no length to offer, and a form opening on 0 reads as nothing carried over;
    the one before it that ran a minute or more is the length worth starting from. The amounts stay
    the newest session's.
  */
  const ran = await db.get<{ start_at: string; end_at: string }>(
    `select a.start_at, a.end_at
       from activities a join pump_details p on p.activity_id = a.id
      where a.household_id = ? and a.type = 'pump' and a.deleted_at is null
        and (a.is_private = 0 or a.created_by = ?)
        and a.end_at is not null
        and julianday(a.end_at) >= julianday(a.start_at) + 1.0 / 1440
      order by a.end_at desc, a.start_at desc limit 1`,
    [householdId, viewerId],
  );
  return {
    leftMl: row.left_ml,
    rightMl: row.right_ml,
    totalMl: row.total_ml ?? 0,
    minutes: ran ? pumpLengthMinutes(ran.start_at, ran.end_at) : null,
  };
}

/** An amount put on the unit's stepper grid, so what is shown is what is saved. */
export const onGrid = (ml: number, unit: VolumeUnit): number => {
  const step = volumeStep(unit);
  return volumeToMl(Math.round(mlToVolume(ml, unit) / step) * step, unit);
};

/** The form a new manual session opens on, from the last one; null to keep the defaults. */
export function pumpPrefill(last: LastPumpAmounts | null, unit: VolumeUnit): PumpState | null {
  if (last === null || !(last.totalMl > 0)) return null;
  if (last.leftMl === null && last.rightMl === null) {
    // a pump that reports one number: the total, with the sides left at nothing (never halves)
    const totalMl = onGrid(last.totalMl, unit);
    return { mode: 'total', amounts: { leftMl: 0, rightMl: 0, totalMl } };
  }
  const leftMl = onGrid(last.leftMl ?? 0, unit);
  const rightMl = onGrid(last.rightMl ?? 0, unit);
  return { mode: 'side', amounts: { leftMl, rightMl, totalMl: leftMl + rightMl } };
}

/**
 * THE FORM BEFORE ANY SESSION EXISTS, in the household's own unit: 3 oz and 3.5 oz, or 90 mL and
 * 100 mL. A milliliter household is given round milliliters of its own (2026-09-26), not ounces
 * converted — 3.5 oz is 103.5 ml, and "105" on a pump that reads in tens of milliliters is a number
 * nobody would have typed. The numbers are only where the steppers start: the last session replaces
 * them the moment there is one (`pumpPrefill`), and nothing here is a suggestion of how much.
 */
const DEFAULT_SIDES: Readonly<Record<VolumeUnit, readonly [number, number]>> = {
  oz: [3, 3.5],
  ml: [90, 100],
};

export function pumpDefaults(unit: VolumeUnit): PumpState {
  const [left, right] = DEFAULT_SIDES[unit];
  const leftMl = onGrid(volumeToMl(left, unit), unit);
  const rightMl = onGrid(volumeToMl(right, unit), unit);
  return { mode: 'side', amounts: { leftMl, rightMl, totalMl: leftMl + rightMl } };
}

/** The phone's key for the way its person last entered a pump. A person's, like the scale. */
export const PUMP_BY_KEY = 'pump_by';

/** By side or Total only, as this phone last chose it; null when it never did or cannot say. */
export async function rememberedPumpMode(store: KeyValueStore): Promise<PumpMode | null> {
  try {
    const v = await store.get(PUMP_BY_KEY);
    return v === 'side' || v === 'total' ? v : null;
  } catch {
    return null;
  }
}

export async function rememberPumpMode(store: KeyValueStore, mode: PumpMode): Promise<void> {
  try {
    await store.set(PUMP_BY_KEY, mode);
  } catch {
    // a choice not remembered costs one tap next time, never the session
  }
}

/**
 * WHAT A NEW "ALREADY FINISHED" FORM OPENS ON: the last session's amounts, in the way this phone
 * last entered a pump. Where the two agree, or the phone never chose, the last session as it was.
 *
 * Where they do not, the phone's way wins, because it is this person's pump: By side over a last
 * session logged as a total opens on the household's starting numbers (3 oz and 3.5 oz), since no
 * side can be read out of a total; Total only over a session logged by side opens on its total.
 */
export function openingForm(
  last: LastPumpAmounts | null,
  by: PumpMode | null,
  unit: VolumeUnit,
): PumpState {
  const from = pumpPrefill(last, unit) ?? pumpDefaults(unit);
  if (by === null || by === from.mode) return from;
  return by === 'side' ? pumpDefaults(unit) : setMode(from, by);
}
