/**
 * WHAT OF PLUS THIS PLATFORM HAS, AND IN WHAT SHAPE — so no surface on it sells a parent something
 * they could not find (the Play readiness check of 2026-09-24).
 *
 * Android has home-screen widgets since 2026-09-24 (docs/WIDGETS.md §8), but not the lock-screen
 * widgets iOS has: an Android home-screen widget is the home screen's alone. Its live timer, since
 * 2026-09-30, is a running timer in the notification shade, counting (`notifications/liveTimers.ts`).
 * So on Android the widgets line stays and says what the phone gets. The matrix stays one matrix:
 * this only words one of its lines for the platform, and removes nothing.
 */
import type { FeatureKey } from '@nibblecue/core';
import { Platform } from 'react-native';
import type { PlanWords } from './gate';

/** Plus features this platform does not have at all. None today, on either platform. */
export const NOT_ON_THIS_PLATFORM: readonly FeatureKey[] = [];

/**
 * Plus features this platform has in another shape, each with the words that say which: the plan
 * lists' short name and the sentence both, so neither size of it promises what the phone lacks.
 */
export const WORDED_ON_THIS_PLATFORM: Readonly<Partial<Record<FeatureKey, PlanWords>>> = {};

/** Which widgets this phone has: the home and lock screens, or the home screen (both have the live timer). */
export type WidgetsShape = 'full' | 'home';
export const WIDGETS_ON_THIS_PLATFORM: WidgetsShape = Platform.OS === 'android' ? 'home' : 'full';
