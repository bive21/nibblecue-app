/**
 * AUTOMATIC NIGHT MODE AS A SUNSET (the owner, 2026-09-25, of the "that's cool" list: *"might not
 * necessarily be useful, but it's cool … Let's try doing everything"*). When the evening window
 * opens — or closes in the morning — ON ITS OWN while the app is on screen, the repaint fades over
 * about two seconds instead of snapping: the page dims into its own ground, the app repaints under
 * it where nobody can see, and the new look comes up through the ground as it lifts.
 *
 * WHAT THIS FILE IS: every rule the fade obeys, as pure functions, so they are tested in node. The
 * provider (`AppearanceProvider.tsx`) owns the clock's answer and the Animated value, and asks
 * here whether a change may fade, what the veil is doing, and how long each half takes.
 *
 * ONLY THE CLOCK FADES. The fade is for one moment — the window crossing its edge while a parent is
 * looking — and for nothing else:
 *
 *  - never for a TAP. A parent choosing a theme, turning the window on, moving its times or trying
 *    dark in setup is watching the screen for the result; the instant repaint IS the live preview
 *    (docs/DESIGN_SYSTEM.md §17), and a two-second fade there would be two seconds of doubt;
 *  - never on a COLD START, where the right first frame is the only frame (the provider paints
 *    nothing until the stored choice is in), and never when the app COMES BACK from the
 *    background: the parent was not watching the edge go by, and a phone that fades on being
 *    picked up looks like one that is still waking;
 *  - never when nothing would change: a household already on dark whose window opens to dark sees
 *    the same screen before and after, and a fade into the same picture is a flicker;
 *  - never under REDUCE MOTION (docs/DESIGN_SYSTEM.md §7): the repaint is instant, as it always was.
 *
 * INTO THE AMBER NIGHT IT IS ALLOWED, AND IT IS STILL NOTHING BUT A DIM: one flat ground color, its
 * opacity going up and then down. No glow, no light, no movement across the screen — a slow dim is
 * what Night is for. Out of it in the morning, the near-black amber ground lifts off the day.
 */
import type { AutoDarkTheme } from '@nibblecue/ui/appearance';
import type { ThemeName } from '@nibblecue/ui/theme';

/* ------------------------------------------------------------- what changed the answer */

/**
 * Why the automatic window's answer is what it is now:
 *
 *   `clock`   the minute tick found the window's edge while the app sat in front of the parent
 *   `resume`  the app came back to the foreground (or a tick arrived late, after time away)
 *   `input`   something the answer is computed FROM changed: the parent's own times, the mode, the
 *             look it dims to, or the household's bed time — and the first answer on a launch
 */
export type AnswerCause = 'clock' | 'input' | 'resume';

/** The window's answer as the provider receives it: what to paint, and what made it so. */
export interface AutoDarkAnswer {
  theme: AutoDarkTheme | null;
  cause: AnswerCause;
}

/**
 * The longest a minute tick may follow the previous look and still count as the clock: a minute,
 * and half a minute of slack for a timer the JavaScript thread was late to. A longer gap means the
 * timer did not run for a while — the phone was locked, the app was away — and the tick that
 * arrives now is really the app waking up.
 */
export const CLOCK_GAP_MAX_MS = 90_000;

/**
 * What a MINUTE TICK means. It is the clock only if the app is in front of the parent now, has not
 * left the foreground since the last look, and the last look was a minute ago rather than an hour —
 * because a timer's callback can run on the way back from the background before the AppState event
 * that says so, and that tick must not fade the screen a parent is just picking up.
 */
export function tickCause(t: {
  /** `AppState.currentState` when the tick ran. */
  appState: string;
  /** Whether the app left the foreground at any point since the last look. */
  away: boolean;
  /** Milliseconds since the last look. */
  sinceLastLook: number;
}): AnswerCause {
  return t.appState === 'active' && !t.away && t.sinceLastLook <= CLOCK_GAP_MAX_MS
    ? 'clock'
    : 'resume';
}

/* --------------------------------------------------------------------- whether to fade */

export interface RepaintFacts {
  /** What changed the window's answer. */
  cause: AnswerCause;
  /** The app's own tree is on screen: past the boot frame, with the stored choice and the faces in. */
  live: boolean;
  /** The theme painted now, and the one the new answer paints. */
  from: ThemeName;
  to: ThemeName;
  reduceMotion: boolean;
}

/** Whether this change of the window's answer repaints through a sunset, or at once. */
export const sunsetFor = (f: RepaintFacts): boolean =>
  f.cause === 'clock' && f.live && !f.reduceMotion && f.from !== f.to;

/* ------------------------------------------------------------------------- the veil */

/**
 * THE TWO HALVES, and why there are two. The app cannot photograph its own screen without a native
 * module (and none may be added: this ships over the air, and Expo Go must keep working), so the
 * old look cannot be cross-faded into the new one. What CAN be drawn over everything is one flat
 * color — so the fade goes THROUGH the one color both looks share a moment of: the old page's own
 * ground.
 *
 *   DUSK  the old look stays painted, and a veil of its own ground color rises over it: the words
 *         and the cards dissolve into the page they sit on. Nothing changes under it yet.
 *   —     at full cover, the app repaints in the new look where nobody can see — the one frame a
 *         whole-app repaint may take as long as it likes — and waits `settleMs` for it to land.
 *   DAWN  the veil fades away, and the new look comes up through it: the screen goes from the old
 *         ground to the new page as the light goes down (or, in the morning, up).
 *
 * About two seconds from the tick to the last of the veil. The dusk is the shorter half: the fade
 * the owner asked for is the new look arriving, and the dusk only has to get the old one out of the
 * way without a cut.
 */
export const SUNSET = {
  duskMs: 520,
  settleMs: 100,
  dawnMs: 1380,
} as const;

/** The whole sunset, tick to clear, in milliseconds. */
export const SUNSET_TOTAL_MS = SUNSET.duskMs + SUNSET.settleMs + SUNSET.dawnMs;

/**
 * The two halves' curves, as `Easing.bezier`'s four control points: the dusk eases in and out, so
 * the page neither blinks away nor lingers half-gone; the dawn starts slowly — the old ground holds
 * a moment, as the light does — and settles gently into the new look.
 */
export const SUNSET_EASE = {
  dusk: [0.42, 0, 0.58, 1],
  dawn: [0.45, 0, 0.25, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/**
 * A sunset in progress. `hold` is the window answer that stays PAINTED while the page dims — the one
 * it is leaving — and `ground` is the veil's color, the old look's page. `id` tells one sunset's
 * late callbacks from the next one's. `prefs` is the stored choice the sunset started under: a
 * parent's tap changes it, and a tap is never faded.
 */
export interface Sunset<P = unknown> {
  id: number;
  phase: 'dusk' | 'dawn';
  hold: AutoDarkTheme | null;
  ground: string;
  prefs: P;
}

export type SunsetEvent<P = unknown> =
  /** A clock flip that `sunsetFor` allowed: begin the dusk, holding what is painted now. */
  | { type: 'start'; id: number; hold: AutoDarkTheme | null; ground: string; prefs: P }
  /** The dusk reached full cover: let the new look paint under it, and lift. */
  | { type: 'covered'; id: number }
  /** The dawn reached nothing: the sunset is over. */
  | { type: 'cleared'; id: number }
  /**
   * Stop now and paint the answer as it is: a tap, a second flip, the app leaving the foreground,
   * reduce motion turned on. Whatever the veil was doing, it is simply gone.
   */
  | { type: 'abort' };

/** What a sunset becomes on an event. Events for an older sunset than the current one do nothing. */
export function sunsetStep<P>(s: Sunset<P> | null, e: SunsetEvent<P>): Sunset<P> | null {
  switch (e.type) {
    case 'start':
      // a flip during a sunset is not faded twice: it never happens by the clock inside two
      // seconds, and if a changed clock makes it happen, painting the answer at once is the truth
      return s === null
        ? { id: e.id, phase: 'dusk', hold: e.hold, ground: e.ground, prefs: e.prefs }
        : null;
    case 'covered':
      return s !== null && s.id === e.id && s.phase === 'dusk' ? { ...s, phase: 'dawn' } : s;
    case 'cleared':
      return s !== null && s.id === e.id && s.phase === 'dawn' ? null : s;
    case 'abort':
      return null;
  }
}

/** The window answer to PAINT: the one being left while the page dims, the clock's own otherwise. */
export const paintedAuto = (
  s: Pick<Sunset, 'phase' | 'hold'> | null,
  answer: AutoDarkTheme | null,
): AutoDarkTheme | null => (s !== null && s.phase === 'dusk' ? s.hold : answer);
