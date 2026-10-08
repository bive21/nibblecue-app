/**
 * The appearance the app paints (docs/DESIGN_SYSTEM.md §3, §11, §13; UX_AUDIT R-5, R-6).
 *
 * The stored choice always wins: it is read from the device before the first frame (the
 * provider renders nothing until the preference and the two faces are in), the OS scheme is
 * only a default for `system`, and the plan decides what a stored choice may paint — a paid
 * look the plan no longer includes is taken back by the resolver, with night landing on dark.
 * Changing anything here is a token swap through <ThemeProvider>: the tree never remounts and
 * in-progress form state survives. Every `set` persists; a relaunch paints the same thing.
 *
 * THE AUTOMATIC EVENING DIM (2026-09-20, §3.1) is the one input here that is not a preference
 * or a platform fact: it is the time. `useAutoDarkTheme` owns the clock and the household's bed
 * time and returns the ANSWER — `'dark'`, `'night'` or null — which goes into the resolver as
 * its fourth argument, so the resolver is still the one place that decides what is painted and
 * the app re-renders when the window opens and closes rather than once a minute.
 *
 * A PREVIEW IS THE ONE THING HERE THAT IS PAINTED AND NEVER PERSISTED (2026-09-25): setup's "Try
 * me". It used to be written through `set` like any answer, so an app killed while it was on came
 * back dark, with the switch on the sun and the parent's own theme gone from the device. Now it
 * is memory only — `preview` below, the resolver's fifth argument — so storage only ever holds
 * what the parent chose, and a fresh launch starts from exactly that.
 *
 * THE EVENING ARRIVES AS A SUNSET (the owner, 2026-09-25, of the "that's cool" list). When the
 * window opens — or closes in the morning — on its own while the app is on screen, the repaint is
 * a two-second fade instead of a snap: the page dims into its own ground, the app repaints in the
 * new look underneath where nobody can see it, and the new look comes up as the ground lifts. The
 * app cannot photograph itself (that would be a native module, and this ships over the air), so
 * the fade goes through the one flat color the old look is standing on. Every rule — only the
 * clock, never a tap, a cold start, a wake-up, reduce motion, or a change that repaints nothing —
 * is a pure function in `sunset.ts`; this file holds the answer and the one Animated value.
 *
 * It is the resolver's answer that is held, not a picture of it: for the half second the page is
 * dimming, `autoTheme` is still the answer being left, so everything that reads the appearance —
 * the sheet's "on now" line, the widgets, the status bar — agrees with what is on the screen, and
 * all of it changes together at the one moment the veil hides.
 *
 * CALM MOTION IS WHAT `reduceMotion` MEANS HERE (2026-09-28; `CalmMotion` in the design system). The
 * phone's own Reduce Motion used to be the whole of it; now the design system is told the app is
 * still when the phone asks, when the parent chose Always, or, on At night (the default), from
 * 9 p.m. to 8 a.m. on the phone's clock (`useDaytime`, which re-renders this provider at those two
 * edges and at no other minute). One OR, in one place (`reducesMotion`), and every rule that keeps
 * still for the phone keeps still for it: `motionStill`, `loopRuns`, the sheet, the toast, the
 * popover, navigation, and the sunset below, which does not fade the evening in while the app is
 * calm. The phone's own setting is still handed out on its own (`osReduceMotion`), because the
 * Appearance sheet has to say when it is the phone, not the parent's choice here, keeping things
 * still.
 */
import { can } from '@nibblecue/core';
import {
  DEFAULT_APPEARANCE,
  reducesMotion,
  resolveAppearance,
  statusBarStyleFor,
  ThemeProvider,
  type AppearanceEntitlements,
  type AppearancePrefs,
  type ResolvedAppearance,
  type ThemeChoice,
} from '@nibblecue/ui';
import { StatusBar } from 'expo-status-bar';
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
import {
  AccessibilityInfo,
  Animated,
  Appearance,
  AppState,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { usePlan } from '../plan/PlanProvider';
import type { KeyValueStore } from '../prefs';
import { prefsStore } from '../prefs/async-storage';
import { crumb } from '../app/boot';
import { useDaytime } from '../time/useDaytime';
import { useAutoDarkTheme } from './useAutoDark';
import { useAppFonts } from './fonts';
import { loadAppearance, saveAppearance } from './prefs';
import { paintedAuto, SUNSET, SUNSET_EASE, sunsetFor, sunsetStep, type Sunset } from './sunset';

/** A sunset's number, so one sunset's late callbacks can be told from the next one's. */
let sunsets = 0;
const DUSK = Easing.bezier(...SUNSET_EASE.dusk);
const DAWN = Easing.bezier(...SUNSET_EASE.dawn);

export interface AppearanceValue {
  /** The stored choice. */
  prefs: AppearancePrefs;
  /** What is painted, after the OS default and the plan. */
  resolved: ResolvedAppearance;
  entitled: AppearanceEntitlements;
  system: 'light' | 'dark';
  /**
   * The phone's own Reduce Motion. The app keeps still whenever it is on, whatever Calm motion says,
   * and the Appearance sheet says so rather than offering a choice that changes nothing.
   */
  osReduceMotion: boolean;
  /** Persist and repaint. A token swap, never a remount. */
  set(patch: Partial<AppearancePrefs>): void;
  /**
   * Paint `theme` over the stored choice until it is cleared with null — and never write it.
   * Memory only, so it cannot outlive the process, and every gate still applies: it takes the
   * stored theme's place in the resolver and nothing else. `prefs` is untouched by it.
   */
  preview(theme: ThemeChoice | null): void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

const systemScheme = (): 'light' | 'dark' =>
  Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

export function AppearanceProvider({
  children,
  store = prefsStore,
}: {
  children: ReactNode;
  store?: KeyValueStore;
}) {
  const plan = usePlan();
  const fontsReady = useAppFonts();
  const [prefs, setPrefs] = useState<AppearancePrefs | null>(null);
  // the preview: in this component's memory and nowhere else — never handed to `saveAppearance`,
  // and empty on every launch, so a killed app always reopens on the stored choice
  const [preview, setPreview] = useState<ThemeChoice | null>(null);
  const [system, setSystem] = useState<'light' | 'dark'>(systemScheme);
  // the PHONE's setting; what the design system is told is `reduceMotion`, below, with Calm motion
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  useEffect(() => {
    if (fontsReady) crumb('fonts: ready');
  }, [fontsReady]);

  // the stored choice, before anything paints
  useEffect(() => {
    let cancelled = false;
    void loadAppearance(store).then(p => {
      if (!cancelled) setPrefs(p);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // an OS preference is only a default for `system`; it is read, not obeyed — and re-read on
  // every wake, because the OS can change it while the app is in the background
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => setSystem(systemScheme()));
    const app = AppState.addEventListener('change', s => {
      if (s === 'active') setSystem(systemScheme());
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(setOsReduceMotion);
    const rm = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion);
    return () => {
      sub.remove();
      app.remove();
      rm.remove();
    };
  }, []);

  const entitled = useMemo<AppearanceEntitlements>(
    () => ({ nightTheme: can('nightTheme', plan.tier), themes: can('themes', plan.tier) }),
    [plan.tier],
  );

  /*
    STILL OR NOT, IN ONE PLACE (the header's Calm motion): the phone's Reduce Motion, or Always, or
    At night outside the daytime. Free on every plan: no entitlement is read, because how the app
    moves in a parent's hand is not something a plan decides. Read before the sunset below, which
    asks it too.
  */
  const daytime = useDaytime();
  const reduceMotion = reducesMotion({
    phone: osReduceMotion,
    calm: prefs?.calmMotion ?? DEFAULT_APPEARANCE.calmMotion,
    daytime,
  });

  const set = useCallback(
    (patch: Partial<AppearancePrefs>) => {
      setPrefs(prev => {
        const next = { ...(prev ?? DEFAULT_APPEARANCE), ...patch };
        void saveAppearance(store, next);
        return next;
      });
    },
    [store],
  );

  /**
   * THE EVENING DIM, if the household asked for one (the owner, 2026-09-20). The hook owns the
   * clock and the household's bed time; everything it decides with them is a pure function in
   * `@nibblecue/ui/appearance`, and what comes back is the answer — `'dark'`, `'night'` or null,
   * and since 2026-09-25 what made it so (`AutoDarkAnswer`) — so the app re-renders when the
   * window opens and closes, not once a minute.
   *
   * It is passed to the resolver rather than applied here, because the resolver is the ONE place
   * that decides what is painted (§3, §11): the window is taken back by a free plan exactly as a
   * stored night theme is, and it never brightens what the parent chose for themselves.
   */
  const answer = useAutoDarkTheme(prefs?.autoDark ?? DEFAULT_APPEARANCE.autoDark);
  // the answer this provider has already decided how to paint — at once, or through a sunset
  const [decided, setDecided] = useState(answer);
  const [sunset, setSunset] = useState<Sunset<AppearancePrefs | null> | null>(null);
  // what is painted: the window's answer, or — while a sunset dims the page — the one it is leaving
  const autoTheme = paintedAuto(sunset, decided.theme);

  const resolved = useMemo(
    () => resolveAppearance(prefs ?? DEFAULT_APPEARANCE, system, entitled, autoTheme, preview),
    [prefs, system, entitled, autoTheme, preview],
  );

  /*
    A NEW ANSWER IS DECIDED DURING RENDER — the "adjusting state when a prop changes" pattern the
    hook itself uses, for its reason: React runs this component again before it commits anything,
    so the first frame after the tick is already either the new look (at once) or the old one with
    its veil about to rise (a sunset). Decided in an effect, the new look would paint for a frame
    first, and the fade would begin with the very snap it exists to remove.

    Whether it may fade is `sunsetFor`'s question: the clock's own flip, on the app's own tree,
    without reduce motion, and to a look that differs from the one on screen — which the ONE
    resolver answers, asked with the new answer instead of the painted one.
  */
  if (answer !== decided) {
    const to = resolveAppearance(
      prefs ?? DEFAULT_APPEARANCE,
      system,
      entitled,
      answer.theme,
      preview,
    ).theme;
    const fade = sunsetFor({
      cause: answer.cause,
      live: prefs !== null && fontsReady,
      from: resolved.theme,
      to,
      reduceMotion,
    });
    // the veil is the ground of the look being LEFT: the page the old look's words dissolve into
    const next = fade
      ? {
          type: 'start' as const,
          id: (sunsets += 1),
          hold: autoTheme,
          ground: resolved.palette.paper,
          prefs,
        }
      : { type: 'abort' as const };
    setDecided(answer);
    setSunset(s => sunsetStep(s, next));
  } else if (sunset !== null && (reduceMotion || sunset.prefs !== prefs)) {
    // a tap on anything the look is stored in, or reduce motion turned on: the answer, now
    setSunset(s => sunsetStep(s, { type: 'abort' }));
  }

  /*
    THE VEIL: one flat color over the whole app, touch-transparent and hidden from assistive
    technology, its opacity on the native driver — up for the dusk, and when it is whole the held
    answer is let go (`covered`) and the app repaints under it; down for the dawn after `settleMs`
    for that repaint to land. A sunset that is aborted simply stops where it is and is gone.
  */
  const veil = useRef(new Animated.Value(0)).current;
  const sunsetId = sunset?.id ?? null;
  const phase = sunset?.phase ?? null;
  useEffect(() => {
    if (sunsetId === null || phase === null) {
      veil.setValue(0);
      return;
    }
    const run =
      phase === 'dusk'
        ? Animated.timing(veil, {
            toValue: 1,
            duration: SUNSET.duskMs,
            easing: DUSK,
            useNativeDriver: true,
          })
        : Animated.timing(veil, {
            toValue: 0,
            duration: SUNSET.dawnMs,
            delay: SUNSET.settleMs,
            easing: DAWN,
            useNativeDriver: true,
          });
    run.start(({ finished }) => {
      if (!finished) return;
      setSunset(s =>
        sunsetStep(
          s,
          phase === 'dusk' ? { type: 'covered', id: sunsetId } : { type: 'cleared', id: sunsetId },
        ),
      );
    });
    return () => run.stop();
  }, [veil, sunsetId, phase]);

  // the app leaving the foreground ends a sunset where it is: nobody is watching it, and the veil
  // must not be the first thing a parent sees when they pick the phone up again
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') setSunset(prev => sunsetStep(prev, { type: 'abort' }));
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<AppearanceValue | null>(
    () =>
      prefs
        ? { prefs, resolved, entitled, system, osReduceMotion, set, preview: setPreview }
        : null,
    [prefs, resolved, entitled, system, osReduceMotion, set],
  );

  // nothing paints until the stored choice and the faces are in: the first frame is the right one
  if (!value || !fontsReady)
    return (
      <View
        style={{ flex: 1, backgroundColor: resolved.palette.app }}
        testID="appearance.booting"
      />
    );

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeProvider
        appearance={resolved}
        fontsReady={fontsReady}
        reduceMotion={reduceMotion}
        // still only because of Calm motion, not the phone: a few answers may still move, slower
        calmMotion={!osReduceMotion}
      >
        <StatusBar style={statusBarStyleFor(resolved.theme)} />
        {/* one box for the app and its veil, always there, so a veil coming and going never
            re-parents the app under it (which would remount every screen) */}
        <View style={styles.fill}>
          {children}
          {sunset ? (
            // A sheet is a native modal and draws above this layer, so a sunset that falls while
            // one is open dims the page behind it and repaints the sheet itself at the swap
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[StyleSheet.absoluteFill, { backgroundColor: sunset.ground, opacity: veil }]}
            />
          ) : null}
        </View>
      </ThemeProvider>
    </AppearanceContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

export function useAppearance(): AppearanceValue {
  const v = useContext(AppearanceContext);
  if (!v) throw new Error('useAppearance outside AppearanceProvider');
  return v;
}
