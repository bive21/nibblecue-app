/**
 * Which binary this JavaScript is running in: Expo Go, or the app's own — a development build
 * or the store build (docs/MOBILE.md §1). The distinction decides what native code exists to
 * be called: Expo Go on Android has carried no expo-notifications since SDK 53, and asking it
 * for that module is not an error that can be caught, it is the app closing.
 *
 * So the question is answered from two independent facts, and only a POSITIVE answer is
 * trusted with native code Expo Go lacks. `expo`'s own check (`isRunningInExpoGo`: the `ExpoGo`
 * native module exists in nothing else, and it is what expo-notifications itself consults) OR
 * the constants' execution environment says Expo Go; and a build is its own binary only when
 * the constants say `bare` — what every EAS and development build has reported since SDK 46.
 * An environment the constants do not name is treated as one that cannot deliver a
 * notification. The cost of being wrong that way is a reminder that does not fire in a build
 * nobody ships; the cost of being wrong the other way was the owner's phone on 2026-09-15.
 */
import { isRunningInExpoGo } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Go — the store client. Either witness is enough. */
export const inExpoGo = (): boolean =>
  isRunningInExpoGo() || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Positively the app's own binary, and so the only build the native-only modules are asked of. */
export const ownBinary = (): boolean =>
  !inExpoGo() && Constants.executionEnvironment === ExecutionEnvironment.Bare;

/** One line of facts for the boot log: the platform, the binary, and what the constants say. */
export const runtimeLine = (): string =>
  [
    `${Platform.OS} ${String(Platform.Version)}`,
    inExpoGo() ? 'Expo Go' : ownBinary() ? 'own binary' : 'unknown binary',
    `executionEnvironment=${String(Constants.executionEnvironment)}`,
    `appOwnership=${String(Constants.appOwnership)}`,
  ].join(' · ');
