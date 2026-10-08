/**
 * THE MOTOR, INSTALLED ONCE, AT LAUNCH (the owner, 2026-09-25, of the "that's cool" list: "a soft
 * tick per stepper step, a firm tap on Save, a double tap when a timer starts … Let's try doing
 * everything"). `App.tsx` calls `startHaptics()` once, as the root mounts: the parent's stored
 * choice is read first and the driver installed after it (`setting.ts` says why that order), and
 * from then on every `haptic(kind)` in the design system and the app reaches expo-haptics through
 * the table in `motor.ts`.
 *
 * WHY THE MODULE IS REQUIRED AT RUN TIME RATHER THAN IMPORTED, when Expo Go carries expo-haptics and
 * `pnpm check:expo-go` would pass a static import: this runs on the way to the first frame, and a
 * native module reached by an `import` is demanded the moment the bundle evaluates, before anything
 * can catch it (`growth/storeReview.ts` and `notifications/expoDriver.ts` tell the three crashes
 * that taught this repository). Asked for here, inside a `try`, a build without the native side
 * degrades to a phone that is still — every `haptic()` stays the no-op it is until a driver is
 * installed — and never to one that does not open. It costs nothing: expo-haptics was already a
 * dependency, so every binary and every over-the-air update already links it, and the runtime
 * fingerprint does not move.
 */
import { setHapticsDriver } from '@nibblecue/ui/haptics';
import { Platform } from 'react-native';
import { prefsStore } from '../prefs/async-storage';
import { createHapticsDriver, type HapticsMotor } from './motor';
import { bootHaptics } from './setting';

/** expo-haptics, or null on a build without its native side. Asked for once. Never throws. */
function expoHaptics(): HapticsMotor | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the header says why
    const mod = require('expo-haptics') as typeof import('expo-haptics');
    // adapted to HapticsMotor: the Android call takes the module's own enum, and this file's
    // driver passes that enum's values as strings
    return {
      selectionAsync: () => mod.selectionAsync(),
      impactAsync: style => mod.impactAsync(style as never),
      notificationAsync: type => mod.notificationAsync(type as never),
      ImpactFeedbackStyle: mod.ImpactFeedbackStyle,
      NotificationFeedbackType: mod.NotificationFeedbackType,
      performAndroidHapticsAsync: type => mod.performAndroidHapticsAsync(type as never),
      AndroidHaptics: mod.AndroidHaptics,
    };
  } catch {
    return null;
  }
}

/** Install the motor, if this build has one. `false` leaves every haptic a no-op. */
function installHapticsMotor(): boolean {
  const motor = expoHaptics();
  if (motor === null) return false;
  setHapticsDriver(
    createHapticsDriver({
      motor,
      // Android: touch feedback can refuse the buzz. iOS: System Haptics, not the silent switch.
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      later: (fn, ms) => {
        setTimeout(fn, ms);
      },
      now: () => Date.now(),
    }),
  );
  return true;
}

/** Once, as the app's root mounts: the stored choice, then the motor. Never rejects. */
export function startHaptics(): Promise<void> {
  return bootHaptics(prefsStore, () => {
    installHapticsMotor();
  }).catch(() => undefined);
}
