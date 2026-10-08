/**
 * THE BUILD THIS PHONE IS RUNNING, as one string.
 *
 * One place, because two callers reading it two ways is how "1.4.0" and "1.4" end up being
 * compared. `app.config.ts` takes the same semver from `package.json` (docs/DEPLOYMENT.md §4.2),
 * so what Expo reports at runtime and what the repository says are the same number.
 *
 * It is read through `expo-constants` and falls back to `0.0.0`, which sorts below every real
 * release: a build that cannot say what it is should behave as the OLDEST one, so an "update is
 * available" card shows rather than hides.
 */
import Constants from 'expo-constants';

export function appVersion(): string {
  const value = Constants.expoConfig?.version;
  return typeof value === 'string' && value.length > 0 ? value : '0.0.0';
}
