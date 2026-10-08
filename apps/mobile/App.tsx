/**
 * The root (docs/AUTH_AND_TRIAL.md §2; docs/DESIGN_SYSTEM.md §3, §14; docs/MOBILE.md §3). The
 * first screen after install is sign in or create an account; a session lands on Today.
 * Providers, outermost first: safe areas, the accounts state machine, the plan, the appearance
 * (which resolves the stored choice against the OS and the plan and mounts the design system's
 * ThemeProvider and the status bar itself — nothing above it reads a token), the selected
 * child, toasts, the sync engine, then navigation with the shell inside it.
 *
 * SyncProvider sits INSIDE ToastProvider and OUTSIDE the navigator: it raises the reconnect and
 * offline toasts (docs/OFFLINE_SYNC.md §6), so it must be under the toast host, and it owns the
 * app's one outbox worker, so it must be above every screen that writes. It renders nothing.
 * LocalNotificationsHost (WP7) sits inside it for the same reason: the plan it keeps on the
 * phone is read from the mirror the worker writes.
 *
 * The container's theme is the palette, so the platform's own transitions and the native form
 * sheets paint the app's ground and never a white or black frame of their own; its base is
 * DarkTheme for dark AND night, because night is a dark ground with amber inks and the
 * container only needs to know which way is up. The shell sits inside the container: its
 * popovers navigate.
 */
import { HouseholdKey } from './src/household/HouseholdKey';
import { SwitchedToast } from './src/household/SwitchedToast';
import { setLoaderMark, setPhotoTroubleReporter, useTheme } from '@nibblecue/ui';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from './src/appearance/AppearanceProvider';
import { preloadAppFonts } from './src/appearance/fonts';
import { crumb } from './src/app/boot';
import { ErrorScreen } from './src/app/ErrorScreen';
import { LinkRouter } from './src/app/LinkRouter';
import { RootNavigator } from './src/app/navigation';
import { ShellProvider } from './src/app/ShellProvider';
import { startHaptics } from './src/feedback/native';
import type { RootParams } from './src/app/types';
import { AccountKeptToast } from './src/auth/AccountKeptToast';
import { AuthProviderRoot } from './src/auth/AuthContext';
import { ChildProvider } from './src/household/ChildContext';
import { MemberPicturesProvider } from './src/household/MemberPictures';
import { BillingProviderView } from './src/billing/BillingContext';
import { PlanProvider } from './src/plan/PlanProvider';
import { PlusUsageWatch } from './src/plan/PlusUsageWatch';
import { runtimeLine } from './src/app/runtime';
import { crumbPhotoTrouble } from './src/media/photoCrumb';
import { SyncProvider } from './src/sync/SyncProvider';
import { ToastProvider } from './src/ui/toast';
import { MARK_SOURCE } from './src/brand/assets';
import { noteCrashRoute } from './src/crash/context';
import { useCrashReports } from './src/crash/useCrashReports';

/**
 * THE LOADER'S MARK, installed once, as the bundle evaluates — before the first frame, so no loader
 * is ever drawn without it (the owner, 2026-09-26: the loading indicator is the logo travelling an
 * ∞). The design system resolves no artwork of its own (`packages/ui/src/components/loaderMark.ts`);
 * it draws this image in exactly the two places docs/BRANDING.md §2's "Waiting" row allows — the
 * boot wait and a button waiting on the server — and `packages/brand/src/placement.test.ts` holds
 * that this line is the only one that hands it over. Not in an effect, as the haptics motor is:
 * that one reads storage first, and this is one assignment that cannot fail.
 */
setLoaderMark(MARK_SOURCE);

/**
 * A PICTURE THAT WOULD NOT DRAW GOES TO THE BOOT LOG (2026-09-29; `src/media/photoCrumb.ts`): the
 * avatar and the child chip fall back to the initial on their own, and this is how the terminal
 * hears where the picture lived and what the phone said. One assignment, like the mark above.
 */
setPhotoTroubleReporter(crumbPhotoTrouble);

/**
 * THE FACES, ASKED FOR AS THE BUNDLE EVALUATES (2026-09-28): the first themed frame waits for
 * them, and the provider that waits mounts only after the accounts provider has built its clients
 * — so they load now, while the launch reads the session, instead of after it (`fonts.ts`
 * `preloadAppFonts`). Never awaited; the provider's own `useFonts` is still what decides.
 */
void preloadAppFonts();

export default function App() {
  // after the first commit: the frame is painted, and the log says which binary painted it
  useEffect(() => crumb(`app: mounted — ${runtimeLine()}`), []);
  // the motor, once: the parent's vibration setting first, then the driver (src/feedback/native.ts)
  useEffect(() => void startHaptics(), []);
  return (
    <SafeAreaProvider>
      {/* outside every provider: an error screen that needs the thing that broke is not one */}
      <ErrorScreen>
        <AuthProviderRoot>
          {/* the switcher (0153): everything below remounts when another family comes on screen */}
          <HouseholdKey>
            <PlanProvider>
              {/* below Plan and above the screens: it re-reads the account after a purchase, and
                the plan is what every gate in the app is asking about */}
              <BillingProviderView>
                <AppearanceProvider>
                  <ChildProvider>
                    <ToastProvider>
                      {/* renders nothing: the one sentence a sign-in that kept the account is owed,
                        said wherever the parent has landed (auth/AccountKeptToast.tsx) */}
                      <AccountKeptToast />
                      {/* renders nothing: "Now showing …" once a switch has landed */}
                      <SwitchedToast />
                      {/* renders nothing: the days Night and the colors were painted during the
                        preview, for the trial sheets' recap (plan/PlusUsageWatch.tsx) */}
                      <PlusUsageWatch />
                      <SyncProvider>
                        {/* every member's picture (0148), resolved once for the top bar, Family
                          and who's on, from the mirror Sync keeps and the account */}
                        <MemberPicturesProvider>
                          {/* below Sync because the cards arrive in its backfill phase, and above
                            the screens because Today's card and the bell's archive are one
                            reading (docs/IN_APP_MESSAGES.md §1: exactly one card at a time) */}
                          {/* NibbleCue carries no in-app messages, community, widgets or
                            CuddleCue reminders (docs/REUSE.md): the screens sit right here */}
                          <Navigation />
                        </MemberPicturesProvider>
                      </SyncProvider>
                    </ToastProvider>
                  </ChildProvider>
                </AppearanceProvider>
              </BillingProviderView>
            </PlanProvider>
          </HouseholdKey>
        </AuthProviderRoot>
      </ErrorScreen>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const t = useTheme();
  // `paper`, not `app`: the container's ground is what shows between screens and behind a
  // form sheet, and every Screen sits on paper (the owner, 2026-09-19 and again 2026-09-21:
  // the page ground is one static color per theme, never tinted by the chosen scheme)
  const { paper, surface, text, line, accent } = t.color;
  useEffect(() => crumb('navigation: container mounted'), []);
  const theme = useMemo(() => {
    const base = t.theme === 'light' ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: paper,
        card: surface,
        text,
        border: line,
        primary: accent,
      },
    };
  }, [t.theme, paper, surface, text, line, accent]);
  /**
   * THE TOUR PROVIDER IS ABOVE THE SHELL, and that placement is the whole of a bug.
   *
   * It used to live inside `RootNavigator`, which is a CHILD of ShellProvider — so every sheet
   * the shell renders (the Quick entry sheet among them) was a SIBLING of the provider rather
   * than a descendant. `useTour()` returned null there, `tour?.did('log')` was a no-op, and a
   * parent who logged a bottle at the tour's first stop watched it sit on a disabled Next
   * (the owner's phone, 2026-09-17).
   *
   * The overlay stays where it is, inside the navigator and last: it has to draw over the tab
   * bar, and a sheet covering it is right — the parent is doing the thing it asked for.
   */
  // the tour reads which pages are pushed over the tabs off the container's own state (the
  // provider says why a count kept by hand was not enough); this ref is how it listens
  const navRef = useNavigationContainerRef<RootParams>();
  /*
    THE CRASH REPORTS (docs/CRASH_REPORTS.md): the names a report must not carry, the queue sent on
    launch, and the screen a crash happened on, read off the container whenever the route changes.
    Here, below every provider, because the hook reads the account; it renders nothing.
  */
  useCrashReports();
  const noteRoute = (): void => noteCrashRoute(navRef.getCurrentRoute()?.name);
  /*
    THE GROUND UNDER EVERY PAGE, in the theme's own paper (the owner, 2026-09-29, Android in dark
    theme: "when i go to certain pages in more, and clicks the go back button, there is a white
    screen flashes vey briefly"). Android's own back transition fades the page leaving and the page
    returning through each other, so for a moment what shows is whatever lies UNDER the stack of
    pages, and nothing of ours was there: the window behind the app, white while the phone itself
    is in light mode, whatever theme the app is in. Every page paints paper, and so does this.
  */
  return (
    <View style={[styles.ground, { backgroundColor: paper }]}>
      <NavigationContainer ref={navRef} theme={theme} onReady={noteRoute} onStateChange={noteRoute}>
        <ShellProvider>
          <RootNavigator />
          <LinkRouter />
        </ShellProvider>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({ ground: { flex: 1 } });
