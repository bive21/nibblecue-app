/**
 * THE PHONE'S OWN BROWSER SHEET FOR SIGNING IN (`browserSignIn.ts`): expo-web-browser's
 * `openAuthSessionAsync`, which is ASWebAuthenticationSession on iOS and a Chrome Custom Tab on
 * Android. Never a web view inside the app: Google refuses to show its sign-in page in one, and a
 * page the app could read is not a page a parent should type a Google password into.
 *
 * A native module, and one Expo Go carries (`expo/bundledNativeModules.json`), so it is imported
 * like the keystore is rather than looked up at call time (`pnpm check:expo-go`). It is a new one
 * in the build, though, and the runtime fingerprint moves with it: the first build that has it is
 * a new binary, not an over-the-air update (docs/RELEASES.md §4).
 */
import * as WebBrowser from 'expo-web-browser';
import type { AuthBrowser } from './browserSignIn';

export const systemAuthBrowser: AuthBrowser = {
  async openAuthSession(url, returnUrl) {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    return result.type === 'success' ? { type: 'success', url: result.url } : { type: result.type };
  },
};
