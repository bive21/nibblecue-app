/**
 * A CONTROL THAT BREATHES ONCE WHEN IT BECOMES THE THING TO TAP — as numbers (the owner,
 * 2026-09-26: *"Think about on boarding process too, surely there are things we can do to make it
 * better with certain animation"*). Setup's Continue waits for an answer on two pages (the baby's
 * name and date, how the baby is fed); the moment the parent's own answer makes the page ready, the
 * button swells a little and settles, once — "you can go on now", said without a word and without
 * a second button. Pure TypeScript, tested in node (`nudge.test.ts`); `Nudge.tsx` only hands the
 * frame to `interpolate`.
 *
 * ONCE PER PAGE, AND ONLY FOR THE PARENT'S OWN ANSWER (`nudges`):
 *   - the cue has to TURN true — a page that arrives already answerable (a resumed setup, Back)
 *     breathes nothing;
 *   - after the page has arrived (`NUDGE_ARM_MS`, longer than the page's own turn): a value the app
 *     fills in as a page opens — setup writes today's date into the date of birth — is the page's,
 *     not the parent's, and must not be answered with a cue;
 *   - and once: undoing the answer and giving it again does not breathe a second time. The caller
 *     names the page (`page`), and a new page starts the nudge afresh — never by remounting it,
 *     which would throw a screen reader's focus off the control it wraps (`Nudge.tsx`).
 *
 * NEVER A SHAKE. A sideways nudge is the platform's word for "wrong" (a refused password shakes);
 * this only grows and settles, about its own middle, by three per cent — a 340 pt button grows five
 * points each side, into the page's own gutter.
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, type Key } from './keyframes';

/** The breath: a swell and a settle, over before a thumb could be on its way to it. */
export const NUDGE_MS = 520;
/** How long after the control appears a cue is taken as the parent's, not the page's. */
export const NUDGE_ARM_MS = 400;
/** How far it swells, as a scale. */
export const NUDGE_SWELL = 1.03;

export const NUDGE_KEYS: readonly Key[] = [
  [0, 1],
  [0.36, NUDGE_SWELL],
  [0.68, 0.994],
  [1, 1],
];

/**
 * Whether the cue breathes now: it has turned true (`was` false), the control is armed, it has not
 * breathed already, and something may move.
 */
export const nudges = (
  was: boolean,
  cue: boolean,
  armed: boolean,
  done: boolean,
  still: boolean,
): boolean => !was && cue && armed && !done && !still;

export const nudgeFrames = (): { scale: Frame } => ({ scale: keyFrame(NUDGE_KEYS) });
