/**
 * `useBilling()` — the one hook a screen reaches the store through.
 *
 * It does three things the provider deliberately does not. It knows WHO is signed in, so the
 * mock store can write its row against a real user without any screen handing an id around
 * (CLAUDE.md rule 9). It RE-READS THE ACCOUNT after anything that could have changed the
 * household's entitlement, because the plan is the server's answer and not the purchase call's
 * (rule 14). And it holds the one piece of state a screen would otherwise duplicate five times:
 * whether a call is in flight, so two taps cannot start two purchases.
 *
 * Products are loaded ONCE, lazily, on the first screen that asks. A store round trip on app
 * start would be a network call before Today has painted, for a screen most launches never
 * reach.
 *
 * WHICH STORE (2026-09-24). The mock whenever the accounts backend is the mock (Expo Go, tests);
 * RevenueCat in the app's own binary on the real backend with this platform's key; and otherwise no
 * store at all, which sells nothing and says so. With RevenueCat, a purchase is not over when the
 * store's sheet closes: the server has to hear it. So the phone asks the server to read the store
 * (`sync-subscription`) and waits a few seconds for the account to show Plus (`settle`). If it has
 * not, the parent is told the store is still working on it, which is true, and the next account
 * read picks it up.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { crumb } from '../app/boot';
import { useAuth } from '../auth/AuthContext';
import type { AppEnv } from '../env';
import { MockBillingProvider } from './mock';
import { RevenueCatBillingProvider } from './revenuecat';
import { settle, storeKey, storePlusArrived } from './revenuecatMap';
import { purchasesSdk } from './revenuecatSdk';
import { NoStoreBillingProvider } from './unavailable';
import type { BillingProvider, PurchaseOutcome, RedeemStyle, StoreProduct } from './types';

/** How long after sign-in the store is first asked about, so it never races Today's first paint. */
const FIRST_STORE_CHECK_MS = 4_000;
/** How often, at most, a return to the app asks the store whether it knows of Plus the server does not. */
const STORE_CHECK_EVERY_MS = 10 * 60_000;

/**
 * RevenueCat, when this build can reach it: the app's own binary (`purchasesSdk`), the real
 * accounts backend (a mock account is nobody RevenueCat or the server could know), and this
 * platform's key. Null means no store; the caller says so.
 */
function realStore(env: AppEnv, who: () => string | null): RevenueCatBillingProvider | null {
  const key = storeKey(env, Platform.OS);
  if (key === null) return null;
  const sdk = purchasesSdk();
  if (sdk === null) return null;
  return new RevenueCatBillingProvider({
    sdk,
    apiKey: key.apiKey,
    platform: key.platform,
    who,
    // a call, not the method itself: React Native's Linking reads `this`
    openUrl: url => Linking.openURL(url),
  });
}

export interface BillingValue {
  /** False makes every subscribe control disappear rather than render disabled. */
  canSell: boolean;
  /** True when the figures are targets rather than prices, so the screens can say so. */
  figuresAreTargets: boolean;
  products: StoreProduct[];
  /** Loads the products once. Safe to call from every render path; it de-duplicates itself. */
  load(): void;
  loading: boolean;
  /** A call is in flight, so no second one may start. */
  busy: boolean;
  purchase(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<PurchaseOutcome>;
  manageUrl(): string | null;
  /** How this build redeems a code, or null when there is no store (docs/PROMO_CODES.md). */
  redeemStyle: RedeemStyle | null;
  /** Hands a code to the store; the plan is read back from the server, as after a purchase. */
  redeem(code: string | null): Promise<PurchaseOutcome>;
}

const BillingContext = createContext<BillingValue | null>(null);

export function BillingProviderView({ children }: { children: ReactNode }) {
  const { account, session, mock, actions, api, env } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  /**
   * WHO IS BUYING, resolved at call time from the auth state. A ref rather than a dependency so
   * the provider below is built once: rebuilding it on every account change would throw away
   * the loaded products for no reason.
   */
  const buyer = useRef<{ userId: string; householdId: string } | null>(null);
  buyer.current =
    session !== null && account?.memberships[0] !== undefined
      ? { userId: session.user.id, householdId: account.memberships[0].household_id }
      : null;

  /** The signed-in person, for the real store, which needs no household to know who is buying. */
  const userId = session?.user.id ?? null;
  const person = useRef<string | null>(null);
  person.current = userId;

  const provider = useMemo<BillingProvider>(
    () =>
      mock !== null
        ? new MockBillingProvider(mock, () => buyer.current)
        : (realStore(env, () => person.current) ?? new NoStoreBillingProvider()),
    [mock, env],
  );

  /**
   * THE LATEST OF EVERYTHING THE STORE CHECK BELOW READS, without making it start over whenever
   * one of them is rebuilt: its throttle has to outlive a re-render.
   */
  const latest = useRef({ account, api, actions });
  latest.current = { account, api, actions };

  /**
   * THE REAL STORE, TOLD WHO THIS IS, soon after sign-in and not only on the paywall: the SDK
   * finishes an unsettled purchase the next time it runs, which on Android includes acknowledging it
   * before Google's three days are up. And whenever the app comes back, at most every ten minutes,
   * one question: does the store know of Plus the server has not heard of? That is a purchase whose
   * sync never arrived (the phone lost signal), or a code redeemed in the Play Store. If so, the
   * server is asked to look. The store's answer never unlocks anything by itself (rule 14): only the
   * account read that follows does.
   */
  useEffect(() => {
    if (!(provider instanceof RevenueCatBillingProvider) || userId === null) return undefined;
    let live = true;
    let checkedAt = 0;
    const check = async () => {
      if (!live || Date.now() - checkedAt < STORE_CHECK_EVERY_MS) return;
      checkedAt = Date.now();
      try {
        await provider.identify(userId);
        const { account: now, api: server, actions: act } = latest.current;
        if (now === null) {
          checkedAt = 0; // nothing to compare with yet; ask again next time
          return;
        }
        if (storePlusArrived(now.entitlement, now.serverNow)) return;
        if (!(await provider.storeSaysPlus())) return;
        crumb('billing: the store has Plus the server has not heard of; asking it to look');
        await server.syncSubscription().catch(() => undefined);
        await act.refreshAccount().catch(() => null);
      } catch (err) {
        crumb(`billing: store check failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    const first = setTimeout(() => void check(), FIRST_STORE_CHECK_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => {
      live = false;
      clearTimeout(first);
      sub.remove();
    };
  }, [provider, userId]);

  const load = useCallback(() => {
    if (asked.current || !provider.canSell) return;
    asked.current = true;
    setLoading(true);
    void provider
      .products()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [provider]);

  /**
   * One path for every call — buy, restore, redeem — because all three end the same way:
   * whatever the store said, ask the server what the plan is now. A purchase that succeeded and an account that was never
   * re-read look identical to every gate in the app, and the second is the bug.
   */
  const run = useCallback(
    async (call: () => Promise<PurchaseOutcome>): Promise<PurchaseOutcome> => {
      if (busy) return { kind: 'pending' };
      setBusy(true);
      try {
        const outcome = await call();
        if (outcome.kind !== 'purchased' && outcome.kind !== 'already') return outcome;
        if (!(provider instanceof RevenueCatBillingProvider)) {
          // the mock wrote its row into the backend the account is read from: one read shows it
          await actions.refreshAccount();
          return outcome;
        }
        // the store has it; now the server has to (the header says why this waits)
        const arrived = await settle({
          sync: () => api.syncSubscription(),
          read: async () => {
            const state = await actions.refreshAccount();
            return state === null
              ? null
              : { entitlement: state.entitlement, serverNow: state.serverNow };
          },
          sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
        });
        return arrived ? outcome : { kind: 'pending' };
      } catch {
        // a provider that threw is a failure, and the parent is told nothing was charged
        return { kind: 'failed', why: 'unexpected' };
      } finally {
        setBusy(false);
      }
    },
    [busy, actions, api, provider],
  );

  const value = useMemo<BillingValue>(
    () => ({
      canSell: provider.canSell,
      figuresAreTargets: provider.figuresAreTargets,
      products,
      load,
      loading,
      busy,
      purchase: id => run(() => provider.purchase(id)),
      restore: () => run(() => provider.restore()),
      manageUrl: () => provider.manageUrl(),
      redeemStyle: provider.redeemStyle,
      redeem: code => run(() => provider.redeem(code)),
    }),
    [provider, products, load, loading, busy, run],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingValue {
  const v = useContext(BillingContext);
  if (!v) throw new Error('useBilling outside BillingProviderView');
  return v;
}
