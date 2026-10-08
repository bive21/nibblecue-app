/**
 * THE MOTOR: how each haptic kind FEELS, in expo-haptics' words (the owner, 2026-09-25, of the
 * "that's cool" list: "a soft tick per stepper step, a firm tap on Save, a double tap when a timer
 * starts, a click at each theme-switch stop … Let's try doing everything. I will then review").
 *
 * The design system's `haptic(kind)` says what HAPPENED (`packages/ui/src/feedback/haptics.ts` has
 * the six meanings); this file says what each one is on the phone, and nothing else:
 *
 *   tick     selectionAsync()             the platform's own detent — a picker wheel's click, the
 *                                         lightest thing it has, because a held stepper fires it
 *                                         every 60 ms
 *   tap      impactAsync(Light)           a switch flipped, a chip chosen, Undo
 *   thud     impactAsync(Medium)          a pump stopped (its card freezes for the output)
 *   double   impactAsync(Light), twice,   a timer started: something that will keep going
 *            DOUBLE_GAP_MS apart
 *   success  notificationAsync(Success)   a Save that wrote something, as its check draws itself,
 *                                         and a timer stopped (the owner, 2026-09-26: "agreed")
 *   warning  notificationAsync(Warning)   a locked option, a save that could not be made
 *
 * IT IS A PURE FUNCTION OF THE MODULE IT IS HANDED — the real expo-haptics on a phone
 * (`native.ts`), a recorder in `haptics.test.ts` — and of a clock and a timer it is handed too, so
 * the whole table is proved in node, where there is no motor to drive.
 *
 * WHY 90 MS BETWEEN THE TWO TAPS OF A DOUBLE. A Light impact lasts about 50 ms on Android's
 * vibrator (expo-haptics' waveform) and less on iOS's Taptic Engine; 90 ms leaves a clear gap
 * after the first, so it is felt as two, and is short enough that the two are one event rather
 * than two unrelated taps. It is a starting point for the owner's thumb, not a measurement.
 *
 * THE SAME KIND ASKED FOR AGAIN WHILE IT IS STILL BEING FELT IS THE SAME MOMENT, and is felt once.
 * The case that needs it is twins: Both starts a timer per baby, both starts land within a few
 * milliseconds, and two doubles on top of each other are a stutter, not a double. A pulse is taken
 * to last `PULSE_MS` — which is also the stepper's own floor between ticks (`TICK_MIN_GAP_MS`), so
 * no tick the stepper lets through is ever swallowed here — and a double lasts its gap plus one.
 *
 * NEVER A REJECTION, NEVER A THROW. Every call here returns a promise, and a phone without the
 * native side, or an Android release without the permission (below), rejects it. `haptic()` catches
 * a throw but cannot catch a promise that rejects later, so every call is caught here: a haptic is
 * decoration, and whatever it marks is already on the screen.
 *
 * ANDROID, AND THE `VIBRATE` PERMISSION (checked 2026-09-25 against expo-haptics 57.0.3 and
 * `apps/mobile/permissions.config.cjs`). On Android these three functions drive the `Vibrator`
 * with a waveform, and that needs `android.permission.VIBRATE`. The app already has it and nothing
 * here adds it: expo-haptics' own AndroidManifest.xml declares it, and so does Expo's prebuild
 * template; it is a normal, install-time permission — no prompt, no Play declaration; it is NOT on
 * the block list (`androidBlockedPermissions()`); and `src/android-permissions.test.ts` already pins
 * it among the permissions the release keeps, which docs/STORE_RELEASE.md §B2 tells Play is for
 * "haptic feedback and reminder vibration". Were it ever blocked, every call would reject and be
 * swallowed above: the app would simply be still, never broken.
 *
 * THE PHONE'S OWN SILENCE (2026-10-03). The in-app Vibration switch stays the app's gate.
 * Android: `impactAsync` drives the vibrator and ignores both the ringer and touch feedback.
 * `performAndroidHapticsAsync` is already on expo-haptics and the system swallows it when touch
 * feedback is off, so this driver uses it on Android. Ringer mode itself is not readable without
 * a new native module, which this app does not add. iOS: the generators follow Settings, Sounds
 * and Haptics, System Haptics, and ignore the ringer silent switch by platform design. There is
 * no public API for that switch.
 */
import type { HapticKind, HapticsDriver } from '@nibblecue/ui/haptics';

/**
 * The part of expo-haptics this file uses, by shape rather than by import, so node never loads
 * the native module — and `native.ts` hands it the real one, so the compiler holds the two to each
 * other. Methods rather than function-valued properties, with the argument optional as
 * expo-haptics declares it: its arguments are its own string enums, and a method's argument is
 * checked both ways, which only works when both sides allow `undefined`.
 */
export interface HapticsMotor {
  selectionAsync(): Promise<void>;
  impactAsync(style?: string): Promise<void>;
  notificationAsync(type?: string): Promise<void>;
  readonly ImpactFeedbackStyle: { readonly Light: string; readonly Medium: string };
  readonly NotificationFeedbackType: { readonly Success: string; readonly Warning: string };
  /**
   * Android only. When present, button haptics go through it so the system can refuse them when
   * touch feedback is off. Absent in node and on iOS.
   */
  performAndroidHapticsAsync?: (type: string) => Promise<void>;
  readonly AndroidHaptics?: {
    readonly Clock_Tick: string;
    readonly Context_Click: string;
    readonly Confirm: string;
    readonly Reject: string;
  };
}

export interface MotorDeps {
  motor: HapticsMotor;
  /** Run `fn` after `ms`: `setTimeout` on a phone, a list the test runs by hand. */
  later: (fn: () => void, ms: number) => void;
  /** Milliseconds, any origin: only the difference between two readings is used. */
  now: () => number;
  /** Android uses the touch-feedback path. Anything else keeps the impact generators. */
  platform?: 'android' | 'ios';
}

/** The gap between the two taps of a `double` (see the header). */
export const DOUBLE_GAP_MS = 90;
/** How long one pulse is taken to last — and the stepper's own floor between ticks. */
export const PULSE_MS = 40;

/** How long a kind is still being felt after it starts: a second ask inside this is absorbed. */
export const feltFor = (kind: HapticKind): number =>
  kind === 'double' ? DOUBLE_GAP_MS + PULSE_MS : PULSE_MS;

/** The driver `@nibblecue/ui`'s `setHapticsDriver` takes: every kind, on the motor it is handed. */
export function createHapticsDriver({ motor, later, now, platform }: MotorDeps): HapticsDriver {
  const lastAt = new Map<HapticKind, number>();
  const androidKinds = motor.AndroidHaptics;
  const android =
    platform === 'android' &&
    androidKinds !== undefined &&
    motor.performAndroidHapticsAsync !== undefined;
  /** One call to the motor, with its rejection — or a throw before it could reject — swallowed. */
  const run = (call: () => Promise<void>): void => {
    try {
      void call().catch(() => undefined);
    } catch {
      // a motor that throws before it returns a promise is as still as one that rejects
    }
  };
  const androidFeel = (type: string): void => {
    const call = motor.performAndroidHapticsAsync;
    if (call === undefined) return;
    run(() => call(type));
  };
  const light = (): void => run(() => motor.impactAsync(motor.ImpactFeedbackStyle.Light));
  return kind => {
    const at = now();
    const prev = lastAt.get(kind);
    // still being felt: the same moment asked for twice (a clock gone backwards is not one)
    if (prev !== undefined && at >= prev && at - prev < feltFor(kind)) return;
    lastAt.set(kind, at);
    if (android && androidKinds !== undefined) {
      switch (kind) {
        case 'tick':
          androidFeel(androidKinds.Clock_Tick);
          return;
        case 'tap':
          androidFeel(androidKinds.Context_Click);
          return;
        case 'thud':
          androidFeel(androidKinds.Confirm);
          return;
        case 'double':
          androidFeel(androidKinds.Context_Click);
          later(() => androidFeel(androidKinds.Context_Click), DOUBLE_GAP_MS);
          return;
        case 'success':
          androidFeel(androidKinds.Confirm);
          return;
        case 'warning':
          androidFeel(androidKinds.Reject);
          return;
      }
    }
    switch (kind) {
      case 'tick':
        run(() => motor.selectionAsync());
        return;
      case 'tap':
        light();
        return;
      case 'thud':
        run(() => motor.impactAsync(motor.ImpactFeedbackStyle.Medium));
        return;
      case 'double':
        light();
        later(light, DOUBLE_GAP_MS);
        return;
      case 'success':
        run(() => motor.notificationAsync(motor.NotificationFeedbackType.Success));
        return;
      case 'warning':
        run(() => motor.notificationAsync(motor.NotificationFeedbackType.Warning));
        return;
    }
  };
}
