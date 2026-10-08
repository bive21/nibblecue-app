/**
 * THE VIEWER'S UNITS — pure, so the reading is a node test. Weight, length and temperature come
 * from the viewer's own profile row (`profiles.weight_unit | length_unit | temp_unit`,
 * 0001_init.sql); THE MILK UNIT IS THE HOUSEHOLD'S (`household_settings.volume_unit`, migration
 * 0128; the owner, 2026-09-26: *"make the oz/mL setting household-wide, not per person"*), chosen
 * on More → What you track or in setup, so every phone in the household reads a bottle in the same
 * unit. `profiles.volume_unit` is no longer read for milk: nothing could ever set it, it says ounces
 * for everyone, and a second source that disagreed with the household's would be a bug waiting.
 *
 * Only the volume unit used to be read, because only it was mirrored; weight, length and
 * temperature stayed at pounds, inches and °F for everyone, so a kg or cm stepper could never be
 * reached and a °C household's readings were shown back in °F everywhere (the audit of
 * 2026-09-24, M9). The local database mirrors all four since v18; a column that has not arrived
 * yet (null until the first pull after the upgrade) or holds a value this build does not know
 * keeps the default for that one unit only.
 *
 * THE TEMPERATURE SCALE A PARENT LAST SAVED A READING IN is remembered on the phone and wins
 * over the profile's. Nothing in the app can change a profile's units yet — there is no settings
 * screen for them — so the profile says °F for nearly everyone; the scale switch on the
 * temperature sheet is the only place a parent says which one they read, and it is remembered
 * from there. A preference that belongs to a person, so it is cleared at sign-out like the rest.
 *
 * THE LENGTH UNIT A PARENT LAST SAVED A MEASUREMENT IN is remembered the same way, and for the same
 * reason (2026-09-26, the owner: *"we need to show cm option for length and head too"*): the growth
 * sheet's in / cm switch is the only place a parent says which tape they read, so a household that
 * measures in centimeters switches once, not at every check-up.
 *
 * THE WEIGHT UNIT is the same shape (2026-10-03): the growth sheet's lb / oz · kg switch is where a
 * parent says which scale they read, remembered on the phone so a clinic's kilograms are not
 * converted by hand at every weigh-in.
 */
import {
  DEFAULT_UNITS,
  type LengthUnit,
  type TempUnit,
  type UnitPrefs,
  type VolumeUnit,
  type WeightUnit,
} from '@nibblecue/core';
import type { KeyValueStore } from '../../prefs';

export const PROFILE_UNITS_SQL =
  'select weight_unit, length_unit, temp_unit from profiles where id = ?';

export interface ProfileUnitsRow {
  weight_unit: string | null;
  length_unit: string | null;
  temp_unit: string | null;
}

const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * The four units: weight, length and temperature from a profile row, each falling back on its own
 * (`remembered` is the scale, `rememberedLength` the tape and `rememberedWeight` the scale's unit,
 * each the one a reading was last saved in on this phone), and the milk unit the household reads
 * (`householdVolumeOf`).
 */
export function unitsFromProfile(
  row: Partial<ProfileUnitsRow> | undefined,
  remembered: TempUnit | null = null,
  rememberedLength: LengthUnit | null = null,
  householdVolume: VolumeUnit = DEFAULT_UNITS.volume,
  rememberedWeight: WeightUnit | null = null,
): UnitPrefs {
  return {
    volume: householdVolume,
    weight:
      rememberedWeight ??
      oneOf<WeightUnit>(['lb_oz', 'kg'], row?.weight_unit, DEFAULT_UNITS.weight),
    length:
      rememberedLength ?? oneOf<LengthUnit>(['in', 'cm'], row?.length_unit, DEFAULT_UNITS.length),
    temp: remembered ?? oneOf<TempUnit>(['f', 'c'], row?.temp_unit, DEFAULT_UNITS.temp),
  };
}

/* ------------------------------------------------------------------ the household's milk unit */

/** The household's milk unit, from its one settings row (0128); no row is ounces. */
export const HOUSEHOLD_VOLUME_SQL =
  'select volume_unit from household_settings where household_id = ? limit 1';

/**
 * What a settings row's column says, as a unit: `ml` is milliliters and anything else — no row, a
 * row pulled before the column existed, a value this build does not know — is ounces, which is the
 * server's own default for the column and what every household read before the choice existed.
 */
export const householdVolumeOf = (raw: unknown): VolumeUnit => (raw === 'ml' ? 'ml' : 'oz');

/**
 * THE UNIT A SCREEN OPENS IN, before its own read of the row lands. Every screen reads the row on
 * mount, asynchronously, and a screen that started on the default would flash "14.25 oz" before
 * "421 mL" for a milliliter household every time a sheet opened. So the last unit read — or
 * chosen — for a household is kept for the life of the app, per household, and a screen starts on
 * it. It is a copy of what the row said a moment ago, never a source: the read replaces it.
 */
const lastKnown = new Map<string, VolumeUnit>();

export const knownHouseholdVolume = (householdId: string | null): VolumeUnit =>
  (householdId === null ? undefined : lastKnown.get(householdId)) ?? DEFAULT_UNITS.volume;

export const noteHouseholdVolume = (householdId: string, unit: VolumeUnit): void => {
  lastKnown.set(householdId, unit);
};

/** The phone's key for the scale a reading was last saved in. Not device-level: it is a person's. */
export const TEMP_SCALE_KEY = 'temp_scale';

export async function rememberedTempScale(store: KeyValueStore): Promise<TempUnit | null> {
  try {
    const v = await store.get(TEMP_SCALE_KEY);
    return v === 'f' || v === 'c' ? v : null;
  } catch {
    return null;
  }
}

export async function rememberTempScale(store: KeyValueStore, unit: TempUnit): Promise<void> {
  try {
    await store.set(TEMP_SCALE_KEY, unit);
  } catch {
    // a scale not remembered costs one tap next time, never the reading
  }
}

/** The phone's key for the length unit a measurement was last saved in. A person's, like the scale. */
export const LENGTH_UNIT_KEY = 'length_unit';

export async function rememberedLengthUnit(store: KeyValueStore): Promise<LengthUnit | null> {
  try {
    const v = await store.get(LENGTH_UNIT_KEY);
    return v === 'in' || v === 'cm' ? v : null;
  } catch {
    return null;
  }
}

export async function rememberLengthUnit(store: KeyValueStore, unit: LengthUnit): Promise<void> {
  try {
    await store.set(LENGTH_UNIT_KEY, unit);
  } catch {
    // a unit not remembered costs one tap next time, never the measurement
  }
}

/** The phone's key for the weight unit a measurement was last saved in. A person's, like the tape. */
export const WEIGHT_UNIT_KEY = 'weight_unit';

export async function rememberedWeightUnit(store: KeyValueStore): Promise<WeightUnit | null> {
  try {
    const v = await store.get(WEIGHT_UNIT_KEY);
    return v === 'lb_oz' || v === 'kg' ? v : null;
  } catch {
    return null;
  }
}

export async function rememberWeightUnit(store: KeyValueStore, unit: WeightUnit): Promise<void> {
  try {
    await store.set(WEIGHT_UNIT_KEY, unit);
  } catch {
    // a unit not remembered costs one tap next time, never the measurement
  }
}
