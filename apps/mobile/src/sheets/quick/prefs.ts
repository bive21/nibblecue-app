/**
 * The two preferences every capture sheet reads: the viewer's units and their clock.
 *
 *   * Weight, length and temperature come from the signed-in profile's own row — `weight_unit`,
 *     `length_unit`, `temp_unit` (0001_init.sql; mirrored locally since v18). Until 2026-09-24
 *     every household got pounds, inches and °F (`unitPrefs.ts` has the rest, and the units
 *     remembered on the phone rather than the profile).
 *   * THE MILK UNIT IS THE HOUSEHOLD'S (`household_settings.volume_unit`, migration 0128; the
 *     owner, 2026-09-26): chosen on More → What you track or in setup, read from the local mirror
 *     and re-read the moment it changes — a choice made on this phone (`saveVolumeUnit`) or pulled
 *     from the other parent's — so every amount on every screen follows at once, without leaving
 *     the page it was changed on (`useHouseholdVolumeUnit`).
 *   * The clock follows the DEVICE: a phone set to 24-hour time shows 24-hour time, which is
 *     what its owner expects from every other app on it. There is no in-app toggle to invent.
 *     So does the zone it reads in, while traveling too (`useTimeZone`).
 */
import {
  DEFAULT_UNITS,
  type LengthUnit,
  type TempUnit,
  type UnitPrefs,
  type VolumeUnit,
  type WeightUnit,
} from '@nibblecue/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { deviceId } from '../../data/ids';
import { systemClock } from '../../data/repository';
import { sameValue } from '../../data/sameValue';
import { saveVolumeUnit } from '../../data/schedule';
import { keys } from '../../data/store';
import { useSharedLocalQuery } from '../../data/useSharedLocalQuery';
import { openLocalDb } from '../../db';
import { prefsStore } from '../../prefs/async-storage';
import {
  HOUSEHOLD_VOLUME_SQL,
  householdVolumeOf,
  knownHouseholdVolume,
  noteHouseholdVolume,
  PROFILE_UNITS_SQL,
  rememberedLengthUnit,
  rememberedTempScale,
  rememberedWeightUnit,
  unitsFromProfile,
  type ProfileUnitsRow,
} from './unitPrefs';

/**
 * The household's milk unit, from the local mirror: re-read whenever the row changes on this phone
 * or arrives from another (`keys.volumeUnit`), and starting on the last unit read for the household
 * so a sheet opened after the first read never flashes the default (`knownHouseholdVolume`).
 *
 * ONE READ FOR EVERY READER (2026-09-28): every amount on every screen asks for it — `useUnits` is
 * read by thirty-odd components, several mounting with each sheet — so they share the read
 * (`useSharedLocalQuery`) instead of each reading the row again on mount and on every change.
 */
export function useHouseholdVolumeUnit(householdId: string | null): VolumeUnit {
  const watch = useMemo(
    () => (householdId === null ? [] : [keys.volumeUnit(householdId)]),
    [householdId],
  );
  return useSharedLocalQuery<VolumeUnit>(
    `volume-unit/${householdId ?? ''}`,
    watch,
    async db => {
      if (householdId === null) return DEFAULT_UNITS.volume;
      const row = await db.get<{ volume_unit: string | null }>(HOUSEHOLD_VOLUME_SQL, [householdId]);
      const unit = householdVolumeOf(row?.volume_unit);
      noteHouseholdVolume(householdId, unit);
      return unit;
    },
    knownHouseholdVolume(householdId),
  );
}

/**
 * THE MILK UNIT AS A SETTING: what the household reads, whether this person may change it — the
 * owner or a parent, exactly who may switch modules on What you track (`can_admin` on the server) —
 * and the one way to change it. The write is local-first through the outbox (`saveVolumeUnit`), so
 * the choice shows on this phone at once, offline included, and reaches the others on sync.
 */
export function useVolumeUnitSetting(): {
  unit: VolumeUnit;
  canChange: boolean;
  /** Resolves true once the choice is written on this phone; false when it could not be. */
  choose: (next: VolumeUnit) => Promise<boolean>;
} {
  const { account, session } = useAuth();
  const household = account?.memberships[0];
  const householdId = household?.household_id ?? null;
  const userId = session?.user.id ?? null;
  const canChange = household?.role === 'OWNER' || household?.role === 'PARENT';
  const unit = useHouseholdVolumeUnit(householdId);
  const choose = useCallback(
    async (next: VolumeUnit) => {
      if (householdId === null || userId === null || !canChange) return false;
      const db = await openLocalDb();
      const r = await saveVolumeUnit(db, systemClock, {
        householdId,
        createdBy: userId,
        deviceId: await deviceId(db),
        source: 'sheet',
        unit: next,
      });
      // the screens opened next start on it, before their own read (`knownHouseholdVolume`)
      if (r.committed) noteHouseholdVolume(householdId, next);
      return r.committed;
    },
    [householdId, userId, canChange],
  );
  return { unit, canChange, choose };
}

/**
 * THE PROFILE'S UNITS AS LAST READ, per profile, for the app's life (2026-09-28) — the shape
 * `knownHouseholdVolume` gives the milk unit. Thirty-odd components read `useUnits`, several
 * mounting with every sheet, and each started on the defaults and read the row and two preferences
 * again: a frame of pounds and °F on a metric household's growth or temperature sheet, and one more
 * render of the sheet while it was still sliding up. A reader starts on the units last read for its
 * profile now, and a read already on its way is shared by every reader that mounts while it is out
 * (`readProfileUnits`); each still reads when it mounts, so nothing is older than it was.
 */
const lastUnits = new Map<string, UnitPrefs>();
type ProfileUnitsRead = [
  ProfileUnitsRow | undefined,
  TempUnit | null,
  LengthUnit | null,
  WeightUnit | null,
];
const unitReads = new Map<string, Promise<ProfileUnitsRead>>();

function readProfileUnits(profileId: string): Promise<ProfileUnitsRead> {
  const out = unitReads.get(profileId);
  if (out !== undefined) return out;
  const read = Promise.all([
    openLocalDb().then(db => db.get<ProfileUnitsRow>(PROFILE_UNITS_SQL, [profileId])),
    rememberedTempScale(prefsStore),
    rememberedLengthUnit(prefsStore),
    rememberedWeightUnit(prefsStore),
  ]).finally(() => unitReads.delete(profileId));
  unitReads.set(profileId, read);
  return read;
}

export function useUnits(): UnitPrefs {
  const { account } = useAuth();
  const profileId = account?.profile?.id ?? null;
  const volume = useHouseholdVolumeUnit(account?.memberships[0]?.household_id ?? null);
  const [units, setHeld] = useState<UnitPrefs>(
    () => (profileId === null ? undefined : lastUnits.get(profileId)) ?? DEFAULT_UNITS,
  );
  useEffect(() => {
    let live = true;
    if (profileId === null) return undefined;
    // a read that says what is held changes nothing, and is what the next reader starts on
    const setUnits = (next: UnitPrefs) => {
      lastUnits.set(profileId, next);
      setHeld(held => (sameValue(held, next) ? held : next));
    };
    void readProfileUnits(profileId)
      .then(([row, scale, length, weight]) => {
        if (live) setUnits(unitsFromProfile(row, scale, length, DEFAULT_UNITS.volume, weight));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profileId]);
  // the household's milk unit over the profile's three, one object while nothing changes
  return useMemo(() => (units.volume === volume ? units : { ...units, volume }), [units, volume]);
}

/**
 * The zone every time on this phone is read in — the phone's own, wherever it is, unless it was told
 * to keep home time for this trip (`time/useZone.ts`; the owner, 2026-09-23). It used to be the
 * household's home zone everywhere, so a family abroad read their own entries on a clock they had
 * left behind.
 */
export { useTimeZone } from '../../time/useZone';

/*
  THE PHONE'S CLOCK, READ ONCE A VISIT (2026-09-28; the owner: "app needs to run as smooth as fast
  and as light as possible"). Thirty-odd components ask at every render — Today, the Log, the
  planner, every sheet, the widget and shade publishers — and each ask built an ICU formatter only
  to read its hour cycle: on a phone, a trip across JNI every time. The answer moves only when the
  phone's own settings do, and a parent changes those outside the app, so it is kept until the app
  next comes back to the foreground and read afresh then — the moment `useZone`'s one listener
  re-reads the phone's zone, for the same reason. A screen takes it at its next render, as before.
*/
let clock24Held: boolean | null = null;
let clock24Watch: NativeEventSubscription | null = null;

/** True when the device formats hours 0–23. Read once; a phone does not change it mid-sheet. */
export function deviceClock24(): boolean {
  if (clock24Held !== null) return clock24Held;
  // one listener for the app's life, added by the first reader
  clock24Watch ??= AppState.addEventListener('change', state => {
    if (state === 'active') clock24Held = null;
  });
  clock24Held = readDeviceClock24();
  return clock24Held;
}

function readDeviceClock24(): boolean {
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    return opts.hour12 === false || opts.hourCycle === 'h23' || opts.hourCycle === 'h24';
  } catch {
    return false;
  }
}
