/**
 * `recordCrash` with the phone behind it: the build's facts, the AsyncStorage queue and the clock.
 * Its own file so `record.ts` stays free of React Native and runs in the node suite.
 */
import type { CrashReport } from '@nibblecue/core';
import { crashDevice } from './device';
import { crashStore } from './deviceStore';
import { recordCrashWith, type CrashCause } from './record';

export function recordCrash(error: unknown, cause: CrashCause): CrashReport | null {
  return recordCrashWith(error, cause, { device: crashDevice, store: crashStore, now: Date.now });
}
