/**
 * THE BUILD AND THE PHONE, as a crash report carries them: the app's version, which JavaScript it
 * runs (Expo Go, the binary's own, or an update by its id, on its channel), the platform and its
 * version. Everything here is about the binary; nothing can reach a person (the same promise as
 * `community/diagnostics.ts`, which reads the same facts for a problem report).
 */
import type { CrashPlatform } from '@nibblecue/core';
import { Platform } from 'react-native';
import { inExpoGo } from '../app/runtime';
import { runningUpdate, updateChannel } from '../app/updates';
import { appVersion } from '../lib/version';

export interface CrashDevice {
  appVersion: string;
  runtime: string | null;
  platform: CrashPlatform;
  osVersion: string | null;
}

function runtimeTag(): string {
  try {
    if (inExpoGo()) return 'expo-go';
  } catch {
    // the constants are unreadable: say nothing about the binary rather than guess
  }
  const update = runningUpdate();
  return `${updateChannel() ?? 'no-channel'}/${update?.id ?? 'embedded'}`;
}

export function crashDevice(): CrashDevice {
  return {
    appVersion: appVersion(),
    runtime: runtimeTag(),
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    osVersion: String(Platform.Version),
  };
}
