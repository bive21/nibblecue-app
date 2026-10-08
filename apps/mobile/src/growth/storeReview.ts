/**
 * THE PLATFORM'S OWN RATING PROMPT, ASKED FOR SAFELY (docs/GROWTH_PROMPTS.md §2.1).
 *
 * The app asks the PLATFORM to show its prompt — `SKStoreReviewController.requestReview` on iOS,
 * the In-App Review API on Android. It never draws its own stars, never asks "do you like the
 * app?" first to filter out unhappy users (both stores treat that pre-screen as manipulation),
 * never links to the listing as a substitute, and never offers anything in exchange.
 *
 * WHY THE MODULE IS REQUIRED AT RUNTIME RATHER THAN IMPORTED. `expo-store-review` needs a native
 * side, and this app is developed in Expo Go, where a module that is not bundled is not a
 * degraded feature — it is a crash on the first call. Three crashes have already reached the
 * owner's phone through a green test suite, every one of them a native module doing something
 * the bundler could not see. So the require is guarded, the availability check is guarded, and
 * the call is guarded: on a build without it, `requestReview` returns `unavailable` and the card
 * records the outcome honestly rather than claiming a prompt that never appeared.
 *
 * BOTH PLATFORMS RATE-LIMIT AND MAY SILENTLY SHOW NOTHING. The app must never assume the prompt
 * appeared, never block on it, and never count a request as a rating — which is why the result
 * is `shown` (the platform accepted the request) rather than anything about what a person did.
 */

export type ReviewOutcome = 'requested' | 'unavailable' | 'failed';

interface StoreReviewModule {
  isAvailableAsync?: () => Promise<boolean>;
  hasAction?: () => Promise<boolean>;
  requestReview?: () => Promise<void>;
}

/** Resolved once. `null` means this build has no native side for it, which is not an error. */
let cached: StoreReviewModule | null | undefined;

/**
 * A STATIC IMPORT WOULD DEFEAT THE GUARD. The bundler resolves an `import` at build time and the
 * module's own initialisation runs at load, before any try block here can catch it — on a build
 * with no native side that is a crash on launch rather than a missing feature. The lookup has to
 * happen at CALL time, inside a try, and `require` is the only construct that does that.
 *
 * `no-require-imports` is disabled for that one expression, with this paragraph as the reason.
 */
function moduleOrNull(): StoreReviewModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-store-review') as StoreReviewModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether this build can ask the platform at all. Never throws. */
export async function reviewAvailable(): Promise<boolean> {
  const mod = moduleOrNull();
  if (mod === null || typeof mod.requestReview !== 'function') return false;
  try {
    // `isAvailableAsync` says the API exists; `hasAction` says the store is reachable
    const available = mod.isAvailableAsync === undefined ? true : await mod.isAvailableAsync();
    if (!available) return false;
    return mod.hasAction === undefined ? true : await mod.hasAction();
  } catch {
    return false;
  }
}

/**
 * Ask. Returns what happened to the REQUEST, never what a person did with it — the platform
 * does not tell us, and an app that inferred it would be inventing data.
 */
export async function requestReview(): Promise<ReviewOutcome> {
  const mod = moduleOrNull();
  if (mod === null || typeof mod.requestReview !== 'function') return 'unavailable';
  if (!(await reviewAvailable())) return 'unavailable';
  try {
    await mod.requestReview();
    return 'requested';
  } catch {
    return 'failed';
  }
}

/** Test seam: forget what was resolved, so a suite can exercise both branches. */
export const resetReviewModuleForTests = (): void => {
  cached = undefined;
};
