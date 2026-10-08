/**
 * WHICH OVER-THE-AIR UPDATE THIS BINARY IS RUNNING, AND ON WHICH CHANNEL (docs/RELEASES.md §4).
 *
 * A store build is made for one channel (`production` for the Play Store's tracks, `preview` for
 * a staging build) and runs either the JavaScript it shipped with or an update published to that
 * channel since. Two things read it: the guard that stops a store build from ever running on the
 * test backend (`releaseEnvProblem`, called by `AuthProviderRoot`), and the About sheet, so a
 * problem report can say which update it came from.
 *
 * `expo-updates` has a native side, so it is reached through a deferred `require` inside a `try` —
 * the shape `tools/expo-go-imports.mjs` asks of every such module, and the one
 * `growth/storeReview.ts` explains. Expo Go, a development build and the node tests all read "no
 * channel, no update" instead of failing.
 */
interface UpdatesModule {
  isEnabled: boolean;
  channel: string | null;
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean;
}

/**
 * The module, but only where updates are really ON: a store build made with the EAS project's
 * update URL. Everywhere else — Expo Go, which runs the project it was pointed at and may report
 * that as an "update"; a debug build; a build made before the project existed — `isEnabled` is
 * false, and neither a channel nor an update is read, so nothing here can fire the store-build
 * guard during development.
 */
function updatesModule(): UpdatesModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const u = require('expo-updates') as UpdatesModule;
    return u.isEnabled === true ? u : null;
  } catch {
    return null;
  }
}

/** The channel this store build was made for, or null in Expo Go, a development build or a test. */
export function updateChannel(): string | null {
  try {
    const channel = updatesModule()?.channel ?? null;
    return channel === null || channel === '' ? null : channel;
  } catch {
    return null;
  }
}

/** The update that replaced the JavaScript the binary shipped with, or null while it runs its own. */
export function runningUpdate(): { id: string; createdAt: Date | null } | null {
  try {
    const u = updatesModule();
    if (u === null || u.isEmbeddedLaunch || !u.updateId) return null;
    return { id: u.updateId, createdAt: u.createdAt ?? null };
  } catch {
    return null;
  }
}
