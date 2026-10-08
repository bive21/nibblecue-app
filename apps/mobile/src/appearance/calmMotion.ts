/**
 * CALM MOTION, THE ROW'S WORDS AND WHAT IT SHOWS (the design system has the setting itself:
 * `CalmMotion`, `reducesMotion`). Pure, so every sentence and every state is a node test; the row
 * (`CalmMotionRow.tsx`) only draws this.
 *
 * THE WORDS SAY WHAT A PARENT WILL SEE, not what the code does: pictures and celebrations stay
 * still, and sheets open at once. "Reduce motion" is the phone's own name for the same thing, and
 * the row does not borrow it: a parent who meets both would take them for one switch in two places,
 * and the phone's one wins whatever this says. When it is on, the row says so, shows Always, and
 * takes no tap, rather than offering three answers that change nothing.
 *
 * THE ROW EXPLAINS ITSELF (2026-10-06): one line for the answer chosen, then `about`, what the
 * setting keeps still and that logging is untouched.
 *
 * AT NIGHT NAMES ITS HOURS, from the one pair every quiet rule keeps (`DAYTIME` in core, the trial
 * sheets' hours), in the phone's own clock format: "from 9 PM to 8 AM." or "from 21:00 to 08:00."
 */
import { DAYTIME } from '@nibblecue/core';
import type { CalmMotion } from '@nibblecue/ui/appearance';

export const CALM_MOTION_COPY = {
  title: 'Calm motion',
  /**
   * WHAT IT IS, under the answer (the owner, 2026-10-06: "add more explanation what this is"): what
   * keeps still, and that nothing about logging changes, so a parent can turn it on without
   * wondering what they lose. Every item named is one the setting really stills (`reducesMotion`:
   * the confetti and goal pictures, Today's live sky, the sheet's slide).
   */
  about:
    'For less movement on the screen. Pictures and celebrations stay still, the sky on Today keeps still, and sheets open at once instead of sliding up. Logging, timers and reminders work exactly the same.',
  /** The one line for each answer, read with `about` under it. */
  off: 'Off: the app moves as it was designed to.',
  always: 'Always: still at every hour.',
  night: (hours: string): string => `At night: still ${hours}`,
  /** The phone's own Reduce Motion is on: it wins, and the row says where it lives. */
  phone: 'On in your phone’s settings, so the app keeps still at every hour.',
} as const;

/** Off first: the order a parent reads from least to most. Off is the default (2026-10-06). */
export const CALM_MOTION_OPTIONS: readonly { value: CalmMotion; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'night', label: 'At night' },
  { value: 'always', label: 'Always' },
];

/** A whole hour on the phone's clock: `9 PM`, or `21:00` on a 24-hour phone. */
export function hourWords(hour: number, clock24: boolean): string {
  if (clock24) return `${String(hour).padStart(2, '0')}:00`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** The night At night keeps still for: from the end of the daytime to its start. */
export const calmNightLine = (clock24: boolean): string =>
  `from ${hourWords(DAYTIME.untilHour, clock24)} to ${hourWords(DAYTIME.fromHour, clock24)}.`;

export interface CalmMotionView {
  /** The answer the control shows as chosen. */
  value: CalmMotion;
  /** The phone's own setting is on: the control takes no tap. */
  disabled: boolean;
  /** The one line under the control. */
  line: string;
}

/** What the row shows, for the stored answer and the phone's own Reduce Motion. */
export function calmMotionView(calm: CalmMotion, phone: boolean, clock24: boolean): CalmMotionView {
  if (phone) return { value: 'always', disabled: true, line: CALM_MOTION_COPY.phone };
  return {
    value: calm,
    disabled: false,
    line:
      calm === 'night'
        ? CALM_MOTION_COPY.night(calmNightLine(clock24))
        : calm === 'always'
          ? CALM_MOTION_COPY.always
          : CALM_MOTION_COPY.off,
  };
}
