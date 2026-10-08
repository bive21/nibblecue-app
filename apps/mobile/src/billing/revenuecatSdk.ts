/**
 * THE REVENUECAT SDK, OR NOTHING (`revenuecat.ts` is what uses it).
 *
 * Expo Go does not carry the SDK's native side, and asking for it there closes the app before a
 * frame is drawn (tools/expo-go-imports.mjs, where `react-native-purchases` is listed for exactly
 * this). So the module is looked up at call time, inside a `try`, and only in the app's own binary.
 * A static import would make the demand the bundle's first act, before anything could catch it.
 */
import type Purchases from 'react-native-purchases';
import { crumb } from '../app/boot';
import { ownBinary } from '../app/runtime';
import type { RcSdk } from './revenuecat';

let loaded: RcSdk | null | undefined;

/**
 * The SDK, or null where this build has none. Resolved once. The `require` is the only construct
 * that defers the lookup to this moment, and this `try` is what makes a missing native side a
 * missing feature rather than a closed app.
 */
export function purchasesSdk(): RcSdk | null {
  if (loaded !== undefined) return loaded;
  if (!ownBinary()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as { default: typeof Purchases };
    // the real module has to fit the calls `RcSdk` names: a signature that moved fails the typecheck here
    const sdk: RcSdk = mod.default;
    loaded = sdk;
  } catch {
    loaded = null;
  }
  crumb(loaded === null ? 'billing: store SDK unavailable' : 'billing: store SDK loaded');
  return loaded;
}
