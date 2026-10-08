/**
 * THE BACK HOLD ITSELF, with no React Native in it so node can hold it to its rules (`backGuard.ts`
 * wires it to Android's Back and says why it exists): every page that starts to slide holds Back,
 * the last one to finish lets go, and `BACK_HOLD_MS` after the last start it lets go whatever has
 * or has not arrived, so a lost event can never leave Back dead.
 */

/**
 * How long a Back is held at most, from the last transition to start: longer than any page slide on
 * either platform (Android 13's is 450 ms), and short enough that a hold is never felt as a stuck
 * button.
 */
export const BACK_HOLD_MS = 700;

export interface BackHoldDeps {
  /** Starts taking Back presses (the handler answers true while held); null where there is no Back. */
  listen: (held: () => boolean) => { remove: () => void } | null;
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  now: () => number;
}

export interface BackHold {
  /** A page began to slide in or out. */
  hold: () => void;
  /** A page finished its slide; the hold ends with the last one. */
  end: () => void;
  /** Back works again, whatever is still moving. */
  release: () => void;
  /** Whether a Back now would land on a page still sliding. */
  held: () => boolean;
}

export function createBackHold(deps: BackHoldDeps): BackHold {
  let until = 0;
  let moving = 0;
  let listener: { remove: () => void } | null = null;
  let timer: unknown = null;

  const held = () => deps.now() < until;
  const release = () => {
    moving = 0;
    until = 0;
    if (timer !== null) deps.cancel(timer);
    timer = null;
    listener?.remove();
    listener = null;
  };
  return {
    held,
    release,
    hold: () => {
      moving += 1;
      until = deps.now() + BACK_HOLD_MS;
      // added when a slide starts, never before: the newest listener is the one asked first
      if (listener === null) listener = deps.listen(held);
      if (timer !== null) deps.cancel(timer);
      timer = deps.schedule(release, BACK_HOLD_MS);
    },
    end: () => {
      moving = Math.max(0, moving - 1);
      if (moving === 0) release();
    },
  };
}
