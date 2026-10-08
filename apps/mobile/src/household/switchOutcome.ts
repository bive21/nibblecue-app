/**
 * WHAT A SWITCH CAME TO, AND WHAT A JOIN SAYS WHEN ITS SWITCH DID NOT LAND (0153; the verification
 * sweep of 2026-10-08). Pure, so the words and the choice of words are node tests
 * (`switchOutcome.test.ts`); `AuthContext` and the switcher only pass them on.
 */
import { SWITCH } from './switchCopy';
import type { OnDuty } from './switchDuty';

/** What a switch came to (`AuthContext` `switchHousehold`). */
export type SwitchOutcome =
  | { kind: 'switched'; name: string }
  | { kind: 'owed'; count: number; name: string }
  /**
   * The person is on in the family on screen (`switchDuty.ts`): nothing changed, and the switcher
   * asks before it switches again with the shift handed back.
   */
  | { kind: 'on_duty'; name: string; fromMs: number; untilMs: number; started: boolean }
  /** On, the hand-back was asked for, and there is no connection: nothing changed. */
  | { kind: 'on_duty_offline'; name: string }
  | { kind: 'failed' };

/**
 * A SECOND FAMILY JOINED WHOSE SWITCH DID NOT LAND (`settleJoin`). The join happened and stays; the
 * family being left is still on screen, so "You joined Lee's family" (the note, and the page it
 * opens) would be said over the wrong family, its name box in the wrong tree. The note waits for
 * the switch to land, and this is said instead, once, as a toast (`SwitchedToast`).
 */
export type JoinedOffScreen =
  | { kind: 'owed'; joined: string; count: number; leaving: string }
  | { kind: 'on_duty'; joined: string; leaving: string; untilMs: number }
  | { kind: 'failed'; joined: string };

/** What a join's switch leaves to say, or null when the joined family is on screen. */
export function joinedOffScreenOf(
  joined: string,
  leaving: string,
  out: SwitchOutcome,
): JoinedOffScreen | null {
  switch (out.kind) {
    case 'switched':
      return null;
    case 'owed':
      return { kind: 'owed', joined, count: out.count, leaving: out.name || leaving };
    case 'on_duty':
      return { kind: 'on_duty', joined, leaving: out.name || leaving, untilMs: out.untilMs };
    case 'on_duty_offline':
    case 'failed':
      return { kind: 'failed', joined };
  }
}

/** The sentence, with the phone's own clock for a time. */
export function joinedOffScreenSentence(n: JoinedOffScreen, clock: (ms: number) => string): string {
  switch (n.kind) {
    case 'owed':
      return SWITCH.joined.owed(n.joined, n.count, n.leaving);
    case 'on_duty':
      return SWITCH.joined.onDuty(n.joined, n.leaving, clock(n.untilMs));
    case 'failed':
      return SWITCH.joined.failed(n.joined);
  }
}

/** The switcher's question, in the phone's own clock (`HouseholdsList`). */
export function dutyAskLines(
  duty: OnDuty & { name: string },
  clock: (ms: number) => string,
): { title: string; body: string } {
  return {
    title: SWITCH.onDuty.title(duty.name, clock(duty.fromMs), clock(duty.untilMs), duty.started),
    body: SWITCH.onDuty.body(duty.name),
  };
}
