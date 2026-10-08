/**
 * WHETHER THE SHOPPING LIST HAS BEEN OPENED YET IN THIS RUN OF THE APP (2026-09-26, S1 of the
 * shopping list's batch). The first time it is, its lines rise into their places one after another
 * (`enter` in packages/ui's `rowMotion.ts`); every time after, they are simply there. "Once per app
 * session", the owner's batch says, and not on every return: a list a parent flips back to ten
 * times on a trip should not replay an entrance ten times.
 *
 * IN MEMORY, AND NEVER WRITTEN ANYWHERE, like `arrivals.ts`: the app starting again is a new
 * session and the list rises in once more. Nothing about the list itself depends on it.
 */

export interface Intro {
  /** The list has not yet been shown this session. */
  due(): boolean;
  /** It has now: nothing rises in again until the app starts again. */
  take(): void;
}

/** A latch: one for the app (`shoppingIntro`), and a fresh one per test. */
export function createIntro(): Intro {
  let taken = false;
  return {
    due: () => !taken,
    take: () => {
      taken = true;
    },
  };
}

/** This run of the app's. */
export const shoppingIntro: Intro = createIntro();
