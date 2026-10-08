/**
 * The viewer's units, read from their profile (the audit of 2026-09-24, M9: weight, length and
 * temperature were pounds, inches and °F for everyone, whatever the profile said).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UNITS } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../prefs';
import { openTestDb } from '../../testing/local-db';
import {
  HOUSEHOLD_VOLUME_SQL,
  householdVolumeOf,
  knownHouseholdVolume,
  LENGTH_UNIT_KEY,
  noteHouseholdVolume,
  PROFILE_UNITS_SQL,
  TEMP_SCALE_KEY,
  WEIGHT_UNIT_KEY,
  rememberLengthUnit,
  rememberTempScale,
  rememberWeightUnit,
  rememberedLengthUnit,
  rememberedTempScale,
  rememberedWeightUnit,
  unitsFromProfile,
  type ProfileUnitsRow,
} from './unitPrefs';

const here = dirname(fileURLToPath(import.meta.url));

describe('the units a profile row asks for', () => {
  it('reads weight, length and temperature from the profile, and the milk unit from the household', () => {
    expect(
      unitsFromProfile({ weight_unit: 'kg', length_unit: 'cm', temp_unit: 'c' }, null, null, 'ml'),
    ).toEqual({ volume: 'ml', weight: 'kg', length: 'cm', temp: 'c' });
  });

  /**
   * THE MILK UNIT IS THE HOUSEHOLD'S (migration 0128; the owner, 2026-09-26: "make the oz/mL
   * setting household-wide, not per person"). A profile's own `volume_unit` is not read for milk:
   * a row that still says ml reads the household's unit, ounces when it has none.
   */
  it('never reads a profile’s own volume unit for milk', () => {
    const profile = { volume_unit: 'ml', weight_unit: 'kg', length_unit: 'cm', temp_unit: 'c' };
    expect(unitsFromProfile(profile).volume).toBe('oz');
    expect(unitsFromProfile(profile, null, null, 'ml').volume).toBe('ml');
    expect(PROFILE_UNITS_SQL).not.toContain('volume_unit');
  });

  it('keeps the default for a unit that has not arrived yet, or that it does not know', () => {
    expect(
      unitsFromProfile({ weight_unit: null, length_unit: 'yd', temp_unit: null }, null, null, 'ml'),
    ).toEqual({ ...DEFAULT_UNITS, volume: 'ml' });
    expect(unitsFromProfile(undefined)).toEqual(DEFAULT_UNITS);
  });

  it('takes the scale a reading was last saved in over the profile’s', () => {
    expect(unitsFromProfile({ temp_unit: 'f' }, 'c').temp).toBe('c');
    expect(unitsFromProfile({ temp_unit: 'c' }, null).temp).toBe('c');
  });

  it('remembers the scale on the phone, and reads nothing it does not recognise', async () => {
    const store = memoryStore();
    expect(await rememberedTempScale(store)).toBeNull();
    await rememberTempScale(store, 'c');
    expect(await store.get(TEMP_SCALE_KEY)).toBe('c');
    expect(await rememberedTempScale(store)).toBe('c');
    await store.set(TEMP_SCALE_KEY, 'kelvin');
    expect(await rememberedTempScale(store)).toBeNull();
    // a store that cannot be read costs the preference, never the sheet
    const broken = { ...store, get: () => Promise.reject(new Error('gone')) };
    expect(await rememberedTempScale(broken)).toBeNull();
  });

  /**
   * THE TAPE A PARENT READS, REMEMBERED (2026-09-26, the owner: *"we need to show cm option for
   * length and head too"*): the growth sheet's in / cm switch, kept on the phone like the scale.
   */
  it('takes the length unit a measurement was last saved in over the profile’s', async () => {
    expect(unitsFromProfile({ length_unit: 'in' }, null, 'cm').length).toBe('cm');
    expect(unitsFromProfile({ length_unit: 'cm' }, null, null).length).toBe('cm');
    const store = memoryStore();
    expect(await rememberedLengthUnit(store)).toBeNull();
    await rememberLengthUnit(store, 'cm');
    expect(await store.get(LENGTH_UNIT_KEY)).toBe('cm');
    expect(await rememberedLengthUnit(store)).toBe('cm');
    await store.set(LENGTH_UNIT_KEY, 'yd');
    expect(await rememberedLengthUnit(store)).toBeNull();
    const broken = { ...store, get: () => Promise.reject(new Error('gone')) };
    expect(await rememberedLengthUnit(broken)).toBeNull();
  });

  /**
   * THE SCALE A PARENT READS, REMEMBERED (2026-10-03): the growth sheet's lb / kg switch, kept on
   * the phone like the tape.
   */
  it('takes the weight unit a measurement was last saved in over the profile’s', async () => {
    expect(unitsFromProfile({ weight_unit: 'lb_oz' }, null, null, 'oz', 'kg').weight).toBe('kg');
    expect(unitsFromProfile({ weight_unit: 'kg' }, null, null, 'oz', null).weight).toBe('kg');
    const store = memoryStore();
    expect(await rememberedWeightUnit(store)).toBeNull();
    await rememberWeightUnit(store, 'kg');
    expect(await store.get(WEIGHT_UNIT_KEY)).toBe('kg');
    expect(await rememberedWeightUnit(store)).toBe('kg');
    await store.set(WEIGHT_UNIT_KEY, 'stone');
    expect(await rememberedWeightUnit(store)).toBeNull();
    const broken = { ...store, get: () => Promise.reject(new Error('gone')) };
    expect(await rememberedWeightUnit(broken)).toBeNull();
  });

  it('is a query the local database answers — the columns are mirrored since v18', async () => {
    const { db } = await openTestDb();
    await db.run(
      `insert into profiles (id, display_name, volume_unit, weight_unit, length_unit, temp_unit,
                             created_at, updated_at)
       values ('p1', 'Dana', 'ml', 'kg', 'cm', 'c', '2026-09-24T00:00:00.000Z',
               '2026-09-24T00:00:00.000Z')`,
    );
    const row = await db.get<ProfileUnitsRow>(PROFILE_UNITS_SQL, ['p1']);
    expect(unitsFromProfile(row)).toEqual({ volume: 'oz', weight: 'kg', length: 'cm', temp: 'c' });
  });

  it('is what the capture sheets read their units from', () => {
    const src = readFileSync(join(here, 'prefs.ts'), 'utf8');
    expect(src).toContain('db.get<ProfileUnitsRow>(PROFILE_UNITS_SQL, [profileId])');
    expect(src).toContain(
      'setUnits(unitsFromProfile(row, scale, length, DEFAULT_UNITS.volume, weight))',
    );
    expect(src).toContain('rememberedWeightUnit(prefsStore)');
    expect(src).not.toContain("'select volume_unit from profiles where id = ?'");
    // and the milk unit is the household's, re-read when it changes
    expect(src).toContain('HOUSEHOLD_VOLUME_SQL');
    expect(src).toContain('[keys.volumeUnit(householdId)]');
    expect(src).toContain(
      'const volume = useHouseholdVolumeUnit(account?.memberships[0]?.household_id ?? null);',
    );
  });
});

describe('the household’s milk unit (migration 0128)', () => {
  it('reads ml as milliliters and anything else — no row, an unknown value — as ounces', () => {
    expect(householdVolumeOf('ml')).toBe('ml');
    expect(householdVolumeOf('oz')).toBe('oz');
    expect(householdVolumeOf(undefined)).toBe('oz');
    expect(householdVolumeOf(null)).toBe('oz');
    expect(householdVolumeOf('cups')).toBe('oz');
  });

  it('is read from the household’s settings row, which the local database mirrors since v21', async () => {
    const { db } = await openTestDb();
    const read = async (h: string) =>
      householdVolumeOf(
        (await db.get<{ volume_unit: string | null }>(HOUSEHOLD_VOLUME_SQL, [h]))?.volume_unit,
      );
    // no row: ounces
    expect(await read('h1')).toBe('oz');
    // a row the waking window made reads ounces, the column's own default
    await db.run(
      `insert into household_settings (household_id, wake_time, bed_time, updated_at)
       values ('h1', '06:30', '20:00', '2026-09-26T00:00:00.000Z')`,
    );
    expect(await read('h1')).toBe('oz');
    await db.run(`update household_settings set volume_unit = 'ml' where household_id = 'h1'`);
    expect(await read('h1')).toBe('ml');
    // another household's row is not this one's
    expect(await read('h2')).toBe('oz');
  });

  it('starts a screen on the last unit read for its household, never another household’s', () => {
    expect(knownHouseholdVolume(null)).toBe('oz');
    expect(knownHouseholdVolume('hh-known')).toBe('oz');
    noteHouseholdVolume('hh-known', 'ml');
    expect(knownHouseholdVolume('hh-known')).toBe('ml');
    expect(knownHouseholdVolume('hh-other')).toBe('oz');
    noteHouseholdVolume('hh-known', 'oz');
    expect(knownHouseholdVolume('hh-known')).toBe('oz');
  });
});
