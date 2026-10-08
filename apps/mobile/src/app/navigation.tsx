/**
 * The navigation tree, and nothing else (docs/MOBILE.md §3; docs/DESIGN_SYSTEM.md §23.1). One
 * root native stack whose screens depend on the auth phase — the React Navigation auth-flow
 * pattern — so a phase change swaps the tree and no signed-out screen can ever hold signed-in
 * state. Behind `Tabs`, the destinations with the design system's floating bar drawn as
 * the navigator's `tabBar`: the bar is absolutely positioned over the scene, so content shows
 * under it and never through its labels, and its center button opens the Quick Log grid
 * through the shell rather than a route (the prototype's `#tabbar`: the FAB is not a tab).
 *
 * Every pushed page has `headerShown: false`: the Screen `title` prop draws a themed heading
 * with Back, in the app's own type and inks, where a native header would paint the platform's.
 *
 * NIBBLECUE (2026-10-08): CuddleCue's tree with NibbleCue's tabs (Today, Plan, Foods, Shopping,
 * More) and its food pages; the auth, family and account routes are CuddleCue's own.
 */
import { TabBar, useTheme } from '@nibblecue/ui';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Freeze } from 'react-freeze';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { endHold, holdBack } from './backGuard';
import { crumb } from './boot';
import { BootWait } from './BootWait';
import { AccountScreen } from '../screens/account/AccountScreen';
import { PlanScreen } from '../screens/account/PlanScreen';
import { AuthScreen } from '../screens/auth/AuthScreen';
import { EndedScreen } from '../screens/auth/EndedScreen';
import { JoinedScreen } from '../screens/auth/JoinedScreen';
import { NewPasswordScreen } from '../screens/auth/NewPasswordScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { VerifyScreen } from '../screens/auth/VerifyScreen';
import { ShoppingScreen } from '../screens/lists/ShoppingScreen';
import { SuppliesScreen } from '../screens/lists/SuppliesScreen';
import { DeleteAccountScreen } from '../screens/more/DeleteAccountScreen';
import { FamilyScreen } from '../screens/more/FamilyScreen';
import { MoreScreen } from '../screens/more/MoreScreen';
import { AddFoodScreen } from '../screens/nibble/AddFoodScreen';
import { AllergensScreen } from '../screens/nibble/AllergensScreen';
import { EmergencyScreen } from '../screens/nibble/EmergencyScreen';
import { FoodProfileScreen } from '../screens/nibble/FoodProfileScreen';
import { FoodSetupScreen } from '../screens/nibble/FoodSetupScreen';
import { FoodScreen } from '../screens/nibble/FoodScreen';
import { FoodsScreen } from '../screens/nibble/FoodsScreen';
import { MilkScreen } from '../screens/nibble/MilkScreen';
import { NoticedHistoryScreen } from '../screens/nibble/NoticedHistoryScreen';
import { NoticedScreen } from '../screens/nibble/NoticedScreen';
import { PlanTabScreen } from '../screens/nibble/PlanTabScreen';
import { CaregiverScreen, SummaryScreen } from '../screens/nibble/SheetScreens';
import { TodayScreen } from '../screens/nibble/TodayScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { JOIN_SHEET_ROUTE, JoinCodeSheet } from '../sheets/JoinCodeSheet';
import { SignOutSheet } from '../sheets/SignOutSheet';
import { useCanLog } from '../household/useCanLog';
import { useNibbleTrial } from '../nibble/useNibbleTrial';
import { useShell } from './shell';
import { tabItems, tabKeyOf, TAB_ROUTE } from './tabs';
import type { RootParams, TabParams } from './types';

const Root = createNativeStackNavigator<RootParams>();
const Tabs = createBottomTabNavigator<TabParams>();

/** The design system's bar as the navigator's tab bar; ids `tab.<key>` and `tab.fab`. */
function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const shell = useShell();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const canLog = useCanLog();
  const tabs = useMemo(() => tabItems(), []);
  const routeName = state.routes[state.index]?.name ?? TAB_ROUTE.today;
  const currentKey = tabKeyOf(routeName) ?? 'today';
  return (
    <TabBar
      tabs={tabs}
      currentKey={currentKey}
      onPress={key => {
        const name = TAB_ROUTE[key];
        const route = state.routes.find(r => r.name === name);
        // the navigator's own tabPress event first, so a screen may claim a re-press (scroll to top)
        const event = route
          ? navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          : null;
        if (!event?.defaultPrevented) navigation.navigate(name);
      }}
      onQuickLog={shell.openQuickLog}
      /* THE + IS TODAY'S, AND ONLY TODAY'S (the owner, 2026-09-30: "The plus button on the center
         menu bar should be accessible only from home page, excluding schedule as well. So the +
         circle icon only from home or today page"). Today is where a parent logs; the Schedule's
         slots each open their own sheet, and the stash and the shopping list have their own one
         floating action (the "Add milk" and "Add supplies" pills), which now sit where the + was
         instead of above it. It was hidden on the stash alone since 2026-09-19. */
      hideQuickLog={currentKey !== 'today' || !canLog}
      width={width}
      bottomInset={insets.bottom}
      testID="tab"
    />
  );
}

function AppTabs() {
  const t = useTheme();
  useEffect(() => crumb('tabs: mounted'), []);
  // NibbleCue Plus's 14-day trial, asked for once when a family first opens NibbleCue
  useNibbleTrial();
  /*
    A JOIN NOTE WRITTEN WHILE TODAY IS ALREADY SHOWING — an invite link opened inside a household,
    a code held on the first screen by somebody signing in to the household they already had — is
    brought to the front from here, inside the navigator (`RootNavigator` has no navigator above it
    to ask). A note there at launch, or written as the phase turned `ready`, needs nothing: its
    route is registered first and opens the branch. Once per note, so leaving the page is leaving.
  */
  const { joinNote } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const shownNote = useRef<number | null>(null);
  useEffect(() => {
    if (joinNote === null || shownNote.current === joinNote.at) return;
    shownNote.current = joinNote.at;
    nav.navigate('Joined');
  }, [joinNote, nav]);
  return (
    <Tabs.Navigator
      tabBar={props => <AppTabBar {...props} />}
      // PAPER, the ground every Screen paints (Screen.tsx `page`): a scene frame in the scheme-
      // tinted `app` showed through for a frame on every tab change as a lavender flash
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.color.paper } }}
      /*
        THE TABS ARE PLAIN VIEWS, NOT A NATIVE CONTAINER OF THEIR OWN (the owner, 2026-10-01, once
        in Dark: "the theme changes, but the tab page just goes blank"). Detached, each tab was a
        fragment inside the tabs' own fragment, which the root stack takes out of the window under
        every pushed page and puts back on Back (`backGuard.ts` has the whole account): the tab
        bar came back and the page inside it did not. As views the tabs come back with the screen
        that holds them, with nothing of their own to rebuild. A hidden tab is `display: none`, as
        mounted as it was before, and drawn by nothing.
      */
      detachInactiveScreens={false}
      // a tab that is not the chosen one does no work (`TabFreeze`)
      screenLayout={({ route, children }) => <TabFreeze routeKey={route.key}>{children}</TabFreeze>}
    >
      {/* in bar order (tabs.ts `TAB_ORDER`), so the navigator and the bar read the same.
          Schedule moved up to second with the bar on 2026-09-18; the bar draws from
          `tabItems()` either way, but leaving this list in the old order would make the
          comment above it false and the two would drift apart unnoticed. */}
      <Tabs.Screen name="Today" component={TodayScreen} />
      <Tabs.Screen name="PlanTab" component={PlanTabScreen} />
      <Tabs.Screen name="Foods" component={FoodsScreen} />
      <Tabs.Screen name="Shopping" component={ShoppingScreen} />
      <Tabs.Screen name="More" component={MoreScreen} />
    </Tabs.Navigator>
  );
}

/**
 * A TAB THAT IS NOT CHOSEN IS FROZEN (the owner, 2026-10-06: "make sure app runs lightly and as
 * smoothly as possible"). The tabs stay mounted as plain views (above), so until now every hidden
 * tab re-rendered on every save, every sync and every minute — Today's two thousand lines while the
 * parent was on Shopping. Frozen, a tab keeps its state and its subscriptions, renders nothing, and
 * catches up in one render when it is chosen again.
 *
 * Frozen on the TAB'S selection, never on focus: a page pushed over the tabs takes focus too, and a
 * tab frozen under it would be the blank page a swipe back reveals (React hides a suspended tree).
 */
function TabFreeze({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const chosen = useNavigationState(s => s.routes[s.index]?.key === routeKey);
  return <Freeze freeze={!chosen}>{children}</Freeze>;
}

/** A recovery link that lands while signed in opens the new-password screen once. */
function RecoveryRedirect() {
  const { recovery } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  useEffect(() => {
    if (recovery) nav.navigate('NewPassword');
  }, [recovery, nav]);
  return null;
}

export function RootNavigator() {
  const { phase, termsStep, joinNote } = useAuth();
  const t = useTheme();
  // the app's ground while the session is read, and the loader only if that takes a while
  if (phase === 'booting') return <BootWait />;
  /*
   * THE TERMS STEP (`auth/terms-step.ts`, 2026-09-27): somebody signed in with no recorded "yes" to
   * the current Terms — an account Google made on the sign-in side, or Terms that moved on since.
   * AUTH itself is drawn for them, with the sign-up page's own checkbox, and it is the only screen
   * registered, so nothing else in the app can be reached until the box is ticked. NOT A PHASE and
   * not a screen of its own (the owner deleted both on 2026-09-22): the phase underneath is
   * unchanged, and the moment the box is ticked the tree below is drawn for it. `NewPassword` stays
   * reachable, so a reset link that lands meanwhile still opens where it should.
   */
  if (termsStep !== 'none')
    return (
      <>
        <RecoveryRedirect />
        <Root.Navigator
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.color.paper } }}
        >
          <Root.Screen name="Auth" component={AuthScreen} />
          <Root.Screen name="NewPassword" component={NewPasswordScreen} />
        </Root.Navigator>
      </>
    );
  /**
   * THE FIRST-RUN TOUR's provider is in `App.tsx`, above the shell, so that the sheets the shell
   * renders are inside it too — a sheet outside it cannot tell the tour the parent just logged
   * something (App.tsx says what that cost). What lives here is the OVERLAY, as the LAST child
   * rather than a Modal: the point of a stop is that the screen behind it is the screen being
   * described, and a modal would put the tab bar behind the dim as well.
   */
  /*
   * THE THREE CHILDREN BESIDE `Root.Navigator` ARE OUTSIDE IT, which is a constraint on what
   * they may do. `app/providers.test.ts` reads this list out of the tree below and holds each one
   * to it, so a fourth child, or a hook that needs a navigator in any of the three, fails the
   * build rather than the launch.
   * `useNavigation` is fine here — with no navigator above it, it falls back to the container
   * ref, which is how `RecoveryRedirect` dispatches. `useNavigationState` is NOT: it reads a
   * navigator's state and throws without one, which is how a tour watcher mounted at this exact
   * spot stopped the app opening at all (docs/PREFLIGHT.md §8). Anything here that needs to know
   * where the parent IS has to be told, not to go looking.
   */
  return (
    <>
      <RecoveryRedirect />
      <Root.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.color.paper } }}
        // NO BACK WHILE A PAGE IS STILL SLIDING (the owner, 2026-10-01: a Back pressed as Family
        // came in left the screen black until Expo Go was closed; `backGuard.ts`): every page the
        // root stack moves holds Back from its slide's start to its end
        screenListeners={{ transitionStart: holdBack, transitionEnd: endHold }}
      >
        {phase === 'signed_out' ? (
          <>
            <Root.Screen name="Auth" component={AuthScreen} />
            <Root.Screen name="Verify" component={VerifyScreen} />
            <Root.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Root.Screen
              name="JoinCode"
              navigationKey="signed_out"
              component={JoinCodeSheet}
              options={JOIN_SHEET_ROUTE}
            />
          </>
        ) : null}
        {phase === 'unverified' ? <Root.Screen name="Verify" component={VerifyScreen} /> : null}
        {/* There is no `terms` phase any more (the owner, 2026-09-22: "the before you start a
            few things to agree too (t&c) page is still here, delete it"). The Terms of Use and
            the Privacy Policy are the checkbox on the sign-up page; the acceptance is recorded
            from there, and nothing stands between a verified account and its first question —
            see `auth/pending-terms.ts` and docs/AUTH_AND_TRIAL.md §2. */}
        {/* AN ACCOUNT THAT LOST ITS HOUSEHOLD (`core/accounts/standing.ts`) keeps every door the
            onboarding phase has — the setup flow is one of its three ways on, and a new invite
            code is the first — so the two phases share their routes rather than duplicating
            them. Only the screen the parent LANDS on differs. */}
        {phase === 'ended' || phase === 'onboarding' ? (
          <>
            {phase === 'ended' ? <Root.Screen name="Ended" component={EndedScreen} /> : null}
            {/* keyed, so the `ready` branch's own Onboarding ("Start your own family") is never
                this one carried over a phase change, nor this one that */}
            <Root.Screen name="Onboarding" navigationKey="setup" component={OnboardingScreen} />
            {/* A KEY PER BRANCH, because this sheet is registered in three of them. A phase change
                keeps every open route whose name the next branch still registers, so without one a
                join made from setup's sheet turned `ready` with the sheet left as the ONLY route,
                saying "You're in Dana's family" over nothing. A new key drops it, and the branch
                opens on its first screen: the confirmation. */}
            <Root.Screen
              name="JoinCode"
              navigationKey="setup"
              component={JoinCodeSheet}
              options={JOIN_SHEET_ROUTE}
            />
            <Root.Screen name="NewPassword" component={NewPasswordScreen} />
          </>
        ) : null}
        {phase === 'ready' ? (
          <>
            {/* THE FIRST PAGE IN A HOUSEHOLD JUST JOINED (2026-09-29; `JoinedScreen`): registered
                first while the account owes a join note, so the phase turning `ready` opens on the
                confirmation rather than on Today — and gone the moment the note is read, which
                takes the page with it. Never swiped away: its buttons are how it is left. */}
            {joinNote !== null ? (
              <Root.Screen
                name="Joined"
                component={JoinedScreen}
                options={{ gestureEnabled: false }}
              />
            ) : null}
            <Root.Screen name="Tabs" component={AppTabs} />
            <Root.Screen name="Family" component={FamilyScreen} />
            {/* "START YOUR OWN FAMILY" (CuddleCue 0154): a key of its own, so a first setup's
                route is never carried over a phase change as this one */}
            <Root.Screen name="Onboarding" navigationKey="own" component={OnboardingScreen} />
            <Root.Screen name="Supplies" component={SuppliesScreen} />
            {/* NibbleCue's own pages (docs/PRODUCT.md) */}
            <Root.Screen name="Food" component={FoodScreen} />
            <Root.Screen name="AddFood" component={AddFoodScreen} />
            <Root.Screen name="Allergens" component={AllergensScreen} />
            <Root.Screen name="Noticed" component={NoticedScreen} />
            <Root.Screen name="NoticedHistory" component={NoticedHistoryScreen} />
            {/* the emergency card covers everything, like CuddleCue's night light */}
            <Root.Screen
              name="Emergency"
              component={EmergencyScreen}
              options={{
                presentation: 'fullScreenModal',
                animation: t.reduceMotion ? 'none' : 'fade',
              }}
            />
            <Root.Screen name="Milk" component={MilkScreen} />
            <Root.Screen name="Caregiver" component={CaregiverScreen} />
            <Root.Screen name="Summary" component={SummaryScreen} />
            <Root.Screen name="FoodProfile" component={FoodProfileScreen} />
            <Root.Screen name="FoodSetup" component={FoodSetupScreen} />
            <Root.Screen name="DeleteAccount" component={DeleteAccountScreen} />
            <Root.Screen name="Account" component={AccountScreen} />
            <Root.Screen name="Plan" component={PlanScreen} />
            <Root.Screen
              name="SignOut"
              component={SignOutSheet}
              options={{ presentation: 'formSheet' }}
            />
            {/* FAMILY'S "JOIN ANOTHER HOUSEHOLD": the same sheet, which says here that one account
                holds one household for now, names this one, and says what to do instead (0139) */}
            <Root.Screen
              name="JoinCode"
              navigationKey="ready"
              component={JoinCodeSheet}
              options={JOIN_SHEET_ROUTE}
            />
            <Root.Screen name="NewPassword" component={NewPasswordScreen} />
          </>
        ) : null}
      </Root.Navigator>
    </>
  );
}
