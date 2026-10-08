/**
 * THE PHONE'S DAYTIME: 8 a.m. to 9 p.m. on its own clock, the hours in which the app may speak first
 * or move for show (2026-09-28, the owner: *"as new parents, how is the operational of the app
 * itself? Is it hard? Is it too animated? Is it too much?"*). The governing rule is older than the
 * question: *a parent who opens the app at 3 a.m. to log a bottle never has to dismiss anything
 * first* (docs/GROWTH_PROMPTS.md, 01-REQUIREMENTS.md §1).
 *
 * ONE PAIR OF HOURS FOR EVERY RULE THAT KEEPS TO THEM. They were first written down for the trial's
 * two sheets (`PROMPT_TIMING`, where they still live), and three more rules read them now: the
 * celebration sheet (`celebrationMayRise`), the contextual tips (`tipFor`), and Calm motion's "At
 * night" (the app's `AppearanceProvider`). A second pair here would be a second answer to "when is
 * it night" waiting to disagree with the first, so this file names the pair and holds no number.
 *
 * THE PHONE'S CLOCK, NOT THE HOUSEHOLD'S ZONE. This is about the room the phone is in (a parent
 * abroad at 3 a.m. is still up at 3 a.m.), so the caller reads the hour off the device, as
 * `promptMayShow`'s callers do, and hands it in: nothing here reads a clock, and a test can put the
 * phone at any hour without touching `Date`. The app's one minute clock asks it
 * (`apps/mobile/src/time/useDaytime.ts`).
 */
import { PROMPT_TIMING } from '../plan/welcome';

/** From `fromHour` (inclusive) to `untilHour` (exclusive), on the phone's own clock. */
export const DAYTIME = {
  fromHour: PROMPT_TIMING.fromHour,
  untilHour: PROMPT_TIMING.untilHour,
} as const;

/** The phone's local hour, 0 to 23, is in the daytime. */
export const isDaytimeHour = (hour: number): boolean =>
  hour >= DAYTIME.fromHour && hour < DAYTIME.untilHour;

/**
 * THE NEAREST DAYTIME HOUR (the owner, 2026-09-28: "The weekly summary's hour picker offers daytime
 * hours only (yes)"). A choice the app offers for something that rises on its own (the weekly
 * summary's "Not before") is a daytime hour, because a card set for 10 PM never rose at 10 PM
 * anyway: since the Calm pass it waited for the morning. An hour stored before the picker was
 * narrowed reads as the daytime hour nearest it, the same evening's last one or the morning's first.
 */
export const nearestDaytimeHour = (hour: number): number =>
  hour < DAYTIME.fromHour
    ? DAYTIME.fromHour
    : hour >= DAYTIME.untilHour
      ? DAYTIME.untilHour - 1
      : hour;

/** The daytime hour after `hour`, the last one wrapping to the first: the picker's one step. */
export const nextDaytimeHour = (hour: number): number => {
  const h = nearestDaytimeHour(hour);
  return h + 1 < DAYTIME.untilHour ? h + 1 : DAYTIME.fromHour;
};
