/**
 * WHAT THE TOUR DOES WHEN THE APP READS WHERE IT GOT TO (the owner, 2026-09-28: *"Tour changes:
 * Share becomes optional, it says 'about 3 minutes', and it asks before resuming"*).
 *
 * The provider reads the tour's written-down state whenever nothing is on the screen: as the app
 * opens, after a guide ends, when Help asks for the tour. Until 2026-09-28 a tour the app was
 * killed under went straight back to the card it had got to, because the question had been asked
 * once, at "Show me". Now the app asks first (`TOUR_RESUME` in `steps.ts`), and this is the one
 * rule for when:
 *
 *   1. no tour is owed (`tour_pending` gone), or this household's tour has no cards: nothing;
 *   2. the parent closed it with × (`tour_paused`): it waits in Help, as it always has;
 *   3. it has not started (`tour_at` unset): the ask after setup, as it always has;
 *   4. Help has just asked for it, Show me around or Resume the tour: it runs, with no question,
 *      because the parent just asked;
 *   5. it was under way when the app closed: the card that asks whether to continue or end it,
 *      ONCE an opening, and only in the daytime, 8 a.m. to 9 p.m. on the phone's clock
 *      (`isDaytimeHour`, the hours the tips and the trial's sheets keep);
 *   6. and otherwise it waits, not running, in Help, where Resume the tour picks it up.
 *
 * WHY THE NIGHT WAITS (the owner, the same day: "never at night beyond what the Calm pass already
 * allows for a tour the parent started"). The Calm pass lets the tour itself run at night because a
 * parent starts it, and holds everything the app would say first; a question on opening is the app
 * speaking first. A parent who opens the app at 3 a.m. came to log a bottle, and the tour asks the
 * next time the app is opened in the daytime. A parent who wants it at night starts it from Help,
 * as the Calm pass allows.
 *
 * WHY ONCE AN OPENING. The state is read again whenever the screen is quiet again, and a question
 * that came back after every tip, or after a module was turned on from the other phone, would be
 * the app speaking first in the middle of a session. Asked, or held back for the night, the tour
 * waits in Help for the rest of that opening.
 *
 * Pure, so every case is walked in node (`opening.test.ts`); the provider hands in what it read and
 * the phone's hour, and acts on the answer.
 */
import { isDaytimeHour } from '../today/daytime';

/**
 * What the provider does with the tour: `none` · `paused` (waits in Help, closed by hand) ·
 * `offer` (the ask after setup) · `run` (straight in: Help asked) · `ask` (the card that asks
 * whether to continue) · `wait` (not now: it waits in Help, and asks at a later opening).
 */
export type TourArmed = 'none' | 'paused' | 'offer' | 'run' | 'ask' | 'wait';

export interface TourArmState {
  /** `tour_pending`: setup finished, or Help asked for the tour, and it has not ended since. */
  pending: boolean;
  /** `tour_at`: the card it got to, or null for a tour that has not started. */
  at: string | null;
  /** `tour_paused`: the parent closed it with × on a card. */
  paused: boolean;
  /** How many cards this household's tour has (`tourFor`). */
  cards: number;
  /** Help has just asked for the tour: Show me around, or Resume the tour. */
  asked: boolean;
  /** This opening of the app has already asked, or held the question back. */
  put: boolean;
  /** The phone's local hour, 0 to 23. */
  hour: number;
}

export function tourArmed(s: TourArmState): TourArmed {
  if (!s.pending || s.cards === 0) return 'none';
  if (s.paused) return 'paused';
  if (s.at === null) return 'offer';
  if (s.asked) return 'run';
  if (s.put || !isDaytimeHour(s.hour)) return 'wait';
  return 'ask';
}
