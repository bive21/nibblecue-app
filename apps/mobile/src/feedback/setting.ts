/**
 * VIBRATION, THE PARENT'S OWN SWITCH (the owner, 2026-09-25, of the "that's cool" list: "a soft
 * tick per stepper step, a firm tap on Save, a double tap when a timer starts … Let's try doing
 * everything. I will then review").
 *
 * Everything the app makes felt goes through one call (`@nibblecue/ui`'s `haptic`) and one switch
 * turns all of it off (`setHapticsEnabled`). This file is that switch's memory: read at launch,
 * written when the parent flips the row on the Appearance sheet (`HapticsRow.tsx`), and nothing
 * else. It holds no second copy of the answer — the design system's switch IS the answer, and this
 * only remembers it and tells the row when it moves.
 *
 * ON UNTIL TURNED OFF. The feel is decoration that says nothing the screen does not, so it costs a
 * parent who does not want it one tap, and a parent who does nothing at all. It matters most on
 * Android, where expo-haptics' vibrator does not follow the phone's own touch-feedback setting
 * (`motor.ts` says why): this switch is the one way to turn it off there.
 *
 * DEVICE-LEVEL, SO IT OUTLIVES A SIGN-OUT (`prefs/index.ts`, DEVICE_LEVEL_KEYS). It is a fact about
 * the hand holding this phone, not about a person or a household, and it names nobody.
 *
 * NO REACT NATIVE HERE, so node tests it end to end with an in-memory store: the key, the default,
 * the round trip, and the order launch does things in.
 */
import { hapticsEnabled, setHapticsEnabled } from '@nibblecue/ui/haptics';
import { useSyncExternalStore } from 'react';
import type { KeyValueStore } from '../prefs';

/** The preferences key: device-level, in DEVICE_LEVEL_KEYS, so a sign-out keeps it. */
export const HAPTICS_KEY = 'haptics';
/** On until the parent turns it off (see the header). */
export const HAPTICS_DEFAULT = true;
const ON = '1';
const OFF = '0';

/** What the store holds, read. Nothing stored — or anything this file never wrote — is the default. */
export const parseHaptics = (raw: string | null): boolean =>
  raw === OFF ? false : raw === ON ? true : HAPTICS_DEFAULT;

/** The stored choice. A store that cannot be read is the default, never a launch that stops. */
export async function loadHaptics(store: KeyValueStore): Promise<boolean> {
  try {
    return parseHaptics(await store.get(HAPTICS_KEY));
  } catch {
    return HAPTICS_DEFAULT;
  }
}

const listeners = new Set<() => void>();
const tell = (): void => {
  for (const fn of listeners) fn();
};

/** How many times the parent has chosen since launch: a launch read that lands after one is stale. */
let chosen = 0;

export function subscribeHaptics(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Whether vibration is on now — read from the design system's own switch, the one `haptic` obeys. */
export const hapticsOn = (): boolean => hapticsEnabled();

/** The row's reading: it redraws whenever the switch moves, from wherever it was moved. */
export function useHapticsOn(): boolean {
  return useSyncExternalStore(subscribeHaptics, hapticsOn, hapticsOn);
}

/**
 * THE PARENT'S CHOICE: felt from the very next haptic — the switch is set before anything waits —
 * and kept on the phone. A store that cannot be written still leaves the choice in force for this
 * launch; the next one reads what the store has.
 */
export async function chooseHaptics(store: KeyValueStore, on: boolean): Promise<void> {
  chosen += 1;
  setHapticsEnabled(on);
  tell();
  try {
    await store.set(HAPTICS_KEY, on ? ON : OFF);
  } catch {
    // the switch has already moved for this launch; nothing a parent is doing waits on this
  }
}

/**
 * AT LAUNCH: THE STORED CHOICE FIRST, THEN THE MOTOR (`install`). Until a driver is installed every
 * `haptic()` is a no-op, so a parent who turned vibration off never feels the first second of a
 * launch either — the order is the whole point of this function. A choice made while the read was
 * still out (it is one AsyncStorage get, so it would take a very quick thumb) wins over the read.
 */
export async function bootHaptics(store: KeyValueStore, install: () => void): Promise<void> {
  const before = chosen;
  const on = await loadHaptics(store);
  if (chosen === before) {
    setHapticsEnabled(on);
    tell();
  }
  install();
}
