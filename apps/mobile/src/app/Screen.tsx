/**
 * The chrome every signed-in screen sits in (docs/DESIGN_SYSTEM.md §14, §23.1; BRANDING.md
 * §2b; MOBILE.md §9): the top bar with the child chip first, the mark dead center, the sync
 * chip only when there is something to say, then appearance, notifications and the account
 * avatar; room at the foot for the floating tab bar and its raised button; the keyboard.
 * A screen supplies content only.
 *
 * The bar is OUTSIDE the ScrollView, and since 2026-09-27 it STEPS OUT OF THE PAGE'S WAY: it
 * slides up as the page is scrolled down and comes back the moment it is scrolled up (the owner:
 * *"when scrolling through the page, the header stays or frozen"*, then, of three ways offered,
 * *"Hide on scroll down"*). The child chip and the account avatar are still one small upward
 * swipe from any depth of any list, and at the top of a page the bar is always all there
 * (`barShift` below). `chrome: false` is for the signed-out screens and full-screen steps (sign in,
 * verify, the age gate, onboarding), which have no household to show. `title` is for a pushed
 * page: Back and a heading in the bar's place. A pushed page has no tab bar under it, so
 * `tabBar` defaults off with a title — a page that reserved 92 px for a bar that is not there
 * would end in a blank band.
 *
 * Under the bar sits the banner slot (docs/OFFLINE_SYNC.md §6): when the sync layer has a
 * sentence for the parent it appears there, above the content and outside the ScrollView, so it
 * cannot be scrolled away and cannot cover anything. It is the tap target the chip deliberately
 * is not — and the press handler comes from HERE rather than from the provider, because the
 * thing that can open a sheet is a screen inside the shell.
 *
 * THE APPEARANCE BUTTON LEFT THE BAR on 2026-09-18 (the owner: "move the theme setting that is
 * located on the most top setting (next to notifications) to inside the profile"). It is a row in
 * the account popover and a row in More now — the two places a household goes to change
 * something — and the bar is down to the things that are actually reached for on every screen.
 *
 * The account popover's anchor is the rectangle the bar last reported (`onLayoutAccount`),
 * held in a ref: a layout report must not re-render the screen, and the
 * shell positions each popover from the rectangle the tap hands it. The mark's accessible
 * name and its letters are read from brand.json — this file is the one place in the chrome
 * the placement test allows a brand value, and only for the mark.
 *
 * TWO DELIGHTS THE BAR WEARS, WIRED HERE (the owner, 2026-09-26): on a baby's month-day the chip's
 * avatar wears a party hat, which pops the first time Today shows it that day (`hatPops`) and is
 * still everywhere else (`celebrations/useMonthHat.ts`); and a page that can be pulled down to
 * sync (`pullToSync`, Today) stretches the mark with the pull (`useMarkPull`) while the platform's
 * own refresh control runs the sync (`sync/pullToSync.ts`) — never holding the page.
 *
 * AND THE TWO TIPS ABOUT THE BAR ARE WIRED HERE TOO (the guides audit, 2026-09-26): the baby's
 * name and your initial offer themselves to the tour (`TourSpot`), as the tab bar's cells do. Every
 * tab draws its own bar, so each bar's spot is its own `part` of the anchor — one bar going away,
 * or measuring nothing behind another tab, never takes the one in front with it.
 */
import { BRAND } from '@nibblecue/brand';
import { TOUR_ANCHOR } from '@nibblecue/core';
import {
  Ground,
  H1,
  IconButton,
  initialOf,
  MotionGate,
  pullSpinnerColors,
  screenBottomPadding,
  TOP_BAR_MIN_HEIGHT,
  TopBar,
  useMarkPull,
  useScreenReaderOn,
  useTheme,
  type Anchor,
} from '@nibblecue/ui';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { MARK_SOURCE } from '../brand/assets';
import { useChild } from '../household/ChildContext';
import { useMemberPictures } from '../household/MemberPictures';
import { syncFromPull } from '../sync/pullToSync';
import { backHeld } from './backGuard';
import { syncRuntime, useSyncChip } from '../sync/status';
import { useSyncBanner } from '../sync/SyncProvider';
import { useTour } from '../tour/TourProvider';
import { registerTourScroller, tourSawScroll } from '../tour/scroller';
import { TourSpot } from '../tour/TourSpot';
import { SyncBanner } from './SyncBanner';
import { TabSky } from './TabSky';
import { useShell, useShellBarOpen } from './shell';
import type { RootParams } from './types';

/**
 * How near the end of a page counts as its end for `onEndReached`: three or four rows of a list, so
 * the next page is asked for while the last rows are still being read, not after they ran out.
 */
const END_REACHED_PX = 480;

export interface ScreenProps {
  children: ReactNode;
  testID?: string;
  /** Scroll the content (default). Off for screens that own their own list. */
  scroll?: boolean;
  /**
   * Whether the content may scroll RIGHT NOW. A screen with a list of its own inside the page
   * turns this off for as long as a finger is on that list, so the page does not carry on
   * scrolling once the list runs out (Today's Up next; packages/ui `Rows.scroll` says why).
   */
  scrollEnabled?: boolean;
  /**
   * The content's scroller, for a screen that has to move it — Schedule scrolling to "How often"
   * when Today's Care section says Schedule → (the owner, 2026-09-16). The ScrollView lives here
   * because the bar and the banner must sit outside it, so a screen that needs the handle has to
   * be handed it rather than owning one.
   */
  scrollRef?: RefObject<ScrollView | null>;
  /**
   * The content offset as the page scrolls, throttled — for a screen that shows something once
   * a part of it has gone by (Today's timer bar). Absent, the scroller reports nothing.
   */
  onScroll?: (offsetY: number) => void;
  /**
   * THE SCROLL OFFSET AS AN ANIMATED VALUE, driven on the native side (`Animated.event` with the
   * native driver), for a screen that floats something OVER the page and has to move it with
   * the page on the same frame — Today's Up next list (`overlay`). A JS listener is a frame
   * late by construction; this is not.
   */
  scrollY?: Animated.Value;
  /**
   * A LAYER OVER THE SCROLLER, clipped to it, taking no touches of its own (`box-none`): what a
   * screen puts here is drawn above the page and is NOT a child of the page's ScrollView.
   *
   * That last part is the point. Android's ScrollView takes a vertical drag off any child once
   * the finger has moved eight points, unless the child is a nested scroller — and a nested
   * scroller hands the page whatever it cannot consume itself, so a list inside the page either
   * cannot be scrolled without holding still first, or drags the page along when it runs out.
   * A list floated here is nobody's child: it scrolls the instant it is touched, and its end is
   * the end. `TodayScreen` holds its place in the page with a spacer and moves it with
   * `scrollY`.
   */
  overlay?: ReactNode;
  /** The content's own root view, for a screen that measures where something is in the page. */
  contentRef?: RefObject<View | null>;
  /** The page's content changed size — a screen that placed something against it re-measures. */
  onContentSizeChange?: () => void;
  /**
   * PINNED OVER THE TOP OF THE SCROLLING CONTENT, under the bar and the banner, never moving
   * with the page: Today's running timers, folded into a strip once their cards have scrolled
   * away. It is laid over the scroller rather than above it in the flow, so its arrival does not
   * shove the page down under a moving thumb.
   */
  sticky?: ReactNode;
  /** Draw the top bar (default). Off for the signed-out screens. */
  chrome?: boolean;
  /** A pushed screen: back + heading instead of the top bar. */
  title?: string;
  /** Room for the floating tab bar (default when chrome is on and the screen is not pushed). */
  tabBar?: boolean;
  /**
   * Room for the log button standing above the bar, too: Today's alone, the one tab that shows it
   * (`navigation.tsx` `hideQuickLog`). Every other tab's page ends just above the bar (2026-10-06).
   */
  logButton?: boolean;
  /**
  /**
   * WHICH GROUND THIS SCREEN SITS ON, and `paper` is now the answer everywhere.
   *
   * It arrived on Supplies and the shopping list first (the shopping brief, 2026-09-19) and the
   * owner asked for it on the rest the same day: *"make the background color on shopping list
   * the same the whole app. i like this universal color better, and theme color selection for
   * the buttons"*. That sentence is also the rule: the household's scheme is for the things you
   * TAP — buttons, the FAB, chips, links, the active tab, a progress fill — and not for a tint
   * over the page behind them.
   *
   * IT COSTS THE GLASS SKIN NOTHING, which is what made it safe to do at once. The default skin
   * is Paper, whose `groundWash` and `orbAlpha` are both zero — so the default household never
   * had a lit ground to lose. Glass, which is sold, still paints its washes and its orbs; they
   * now sit over a warm neutral instead of a lavender one, which is a change of ground and not
   * a loss of the thing somebody paid for.
   *
   * `app` remains, for a screen that wants the lit ground back. Nothing asks for it today.
   */
  page?: 'app' | 'paper';
  /**
   * A control at the right of a pushed page's bar, beside Back — Manage's Reminders button.
   *
   * WHY IT IS NOT A `SectionHeader` ACTION. A page whose action scrolls away with its heading has
   * an action a parent has to scroll back up to reach. (Supplies had its "Add supply" here until
   * the owner moved it under the catalog on 2026-09-26, `docs/SUPPLIES.md` §10.) Requires
   * `title`, since it is drawn in the pushed bar.
   */
  barTrailing?: ReactNode;
  /**
   * Draw `title` in the bar (the default). Off for a page that draws its own heading in the
   * content — over its lede, or with an action beside it that the bar has no room for — leaving
   * the bar as Back and `barTrailing`. The heading is the same `H1`, 23, either way: a page opened
   * from another page is named at one size wherever it is drawn, and only a tab page is named at
   * 28 (`TabTitle`; docs/DESIGN_SYSTEM.md §4.1 rule 1, 2026-09-30). The bar still carries the
   * title for a screen reader, which is the part that must not be lost.
   */
  titleInBar?: boolean;
  /**
   * SOMETHING THAT BELONGS BESIDE THE TITLE, in the pushed bar: Community's *Early access* badge
   * (2026-09-29), which used to be a card in the page repeating the page's own name ("Community"
   * twice, the owner's screenshot). Small and never a control; the title keeps the room it needs
   * and is cut before it is pushed off. Requires `title` and `titleInBar`.
   */
  titleAccessory?: ReactNode;
  /**
   * THE TITLE IS A BUTTON. Family's household name: the owner taps it and `titleEditor` takes
   * its place. Absent, the heading is only a heading. `titlePressLabel` is what a screen reader
   * hears, the name included.
   */
  onTitlePress?: () => void;
  titlePressLabel?: string;
  titlePressTestID?: string;
  /**
   * REPLACES THE HEADING while that button is open, in the same bar. The spoken page name stays
   * `title`, on the bar, so a screen reader still knows which page this is.
   */
  titleEditor?: ReactNode;
  /**
   * PINNED UNDER THE PAGE, ABOVE THE KEYBOARD: a discussion's reply box and a request's comment box
   * (2026-09-29). It is outside the scroller, so it never scrolls away from the thumb, and inside
   * the keyboard's avoider, so it rises with the keyboard. It pads itself for the phone's own
   * buttons. Requires `title` (a pushed page): a tab has its bar there.
   */
  footer?: ReactNode;
  /**
   * THE PAGE WAS SCROLLED NEAR ITS END: a paged list asks for its next page (Community's lists).
   * Asked once per length of content, so a list that is still loading is not asked again until it
   * has grown. A page too short to scroll is never asked: the list's own "Show more" is the way on.
   */
  onEndReached?: () => void;
  /**
   * A PICTURE BEHIND THE BAR, exactly the bar's own box — Today's sky (the owner, 2026-09-25, of
   * the "that's cool" list; packages/ui `LiveSky`). It is laid in a wrapper the bar is drawn over,
   * so it is as tall as the bar is on this phone — the status-bar inset, the row, a chip grown with
   * the phone's text — without anybody measuring anything, and it ends where the bar ends: the
   * page's own words are never on it. It takes no touches and is hidden from assistive
   * technology here, whatever the caller hands in. Absent, the bar is drawn exactly as before.
   */
  barBackdrop?: ReactNode;
  /**
   * PULL THE PAGE DOWN TO SYNC (Today; the owner, 2026-09-26): the platform's own refresh control
   * over the page, which sends what this phone owes and reads what the others wrote
   * (`sync/pullToSync.ts`) without ever holding the page, and the mark in the bar stretching with
   * the pull and springing back (`useMarkPull`). Needs `scroll`.
   */
  pullToSync?: boolean;
  /**
   * THE MONTH-DAY HAT POPS HERE (Today): a baby's party hat pops the first time this page shows it
   * that day, and is simply there on every other page (`celebrations/useMonthHat.ts`).
   */
  hatPops?: boolean;
}

export function Screen({
  children,
  testID,
  scroll = true,
  scrollEnabled = true,
  scrollRef,
  onScroll,
  scrollY,
  overlay,
  contentRef,
  onContentSizeChange,
  sticky,
  chrome = true,
  title,
  tabBar = chrome && title === undefined,
  logButton = false,
  page = 'paper',
  barTrailing,
  titleInBar = true,
  titleAccessory,
  onTitlePress,
  titlePressLabel,
  titlePressTestID,
  titleEditor,
  footer,
  onEndReached,
  barBackdrop,
  pullToSync = false,
  hatPops = false,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const shell = useShell();
  /*
    THE BAR ASKS FOR WHAT IT DRAWS, AND NOTHING MORE (2026-09-28). Every page a parent has opened
    keeps its bar mounted, and each used to read the whole queue and the whole of what the shell has
    open — so a save re-rendered every one of them at each step of its flush and at each sheet that
    opened or closed around it, for a chip that for a sync that takes a moment never appears, and
    two `expanded` states that belong to the bar's own two overlays. Each reads its answer now
    (`useSyncChip`, `useShellBarOpen`), and a bar re-renders when what it draws changes.
  */
  const open = useShellBarOpen();
  const { account, env, mock, online } = useAuth();
  const child = useChild();
  // the viewer's own picture in the profile button (0148), or null for the initial
  const { mine: myPicture } = useMemberPictures();
  const syncChip = useSyncChip(online);
  const banner = useSyncBanner();
  const accountAnchor = useRef<Anchor | null>(null);
  /*
    THE TOUR MAY MOVE THIS PAGE, while it is the page in front: a beat whose control sits below
    the fold asks the focused screen to bring it up (`tour/scroller.ts`). The offset is kept here
    from the scroll events so the ask can be a delta from where the page actually is.

    (Whether a page is PUSHED over the tabs — what used to be counted from here — is read off the
    navigator's own state by the tour provider now, so it cannot drift.)
  */
  const own = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const focused = useIsFocused();
  /** This bar's own part of the top-bar anchors: every tab draws a bar, and each is one spot. */
  const barPart = useId();
  useEffect(() => {
    if (!focused || !scroll) return;
    return registerTourScroller(dy => {
      own.current?.scrollTo({ y: Math.max(0, offset.current + dy), animated: true });
    });
  }, [focused, scroll]);
  // the month-day hats: which babies wear one today, and whether this bar is where they pop
  // NibbleCue has no month-day hat (CuddleCue's celebrations were not carried over): `hatPops`
  // is accepted and ignored so a page written for either app reads the same
  void hatPops;
  // the picture of a baby on the way, for the chip while the household waits for its first
  const waiting = child.householdExpecting ? (child.expecting[0] ?? null) : null;
  const waitingFace = waiting === null ? null : child.photoOf(waiting.id);
  const attachScroll = useCallback(
    (node: ScrollView | null) => {
      own.current = node;
      if (scrollRef) scrollRef.current = node;
    },
    [scrollRef],
  );
  /** The content height the page last asked for more at (`onEndReached`): once per length. */
  const endAskedAt = useRef(-1);
  const report = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      // the tour's card shrinks to its bar once the parent has really moved the page
      // (`scroller.ts`, which counts the distance); a no-op when no tour is running, and it
      // ignores the tour's own scrolls
      tourSawScroll(y - offset.current);
      offset.current = y;
      onScroll?.(y);
      if (onEndReached !== undefined) {
        const { layoutMeasurement, contentSize } = e.nativeEvent;
        const near = layoutMeasurement.height + y >= contentSize.height - END_REACHED_PX;
        if (near && endAskedAt.current !== contentSize.height) {
          endAskedAt.current = contentSize.height;
          onEndReached();
        }
      }
    },
    [onScroll, onEndReached],
  );
  /*
    PULL TO SYNC, AND THE HEART ON THE PULL. The page's offset drives the mark's stretch on the native
    side — the same value a screen that floats something hands in (`scrollY`), or the mark's own —
    and the platform's refresh control starts the sync. `refreshing` is the spinner only: the page
    is never held while it turns, and it is let go after `PULL_SYNC.maxMs` whatever the network does.
  */
  const pulls = pullToSync && scroll;
  const heart = useMarkPull(scrollY);
  const { synced: heartSynced } = heart;
  const heartMoves = pulls && heart.style !== undefined;
  const [refreshing, setRefreshing] = useState(false);
  const syncing = useRef(false);
  const noSync = env.off.has('sync');
  const onRefresh = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    heartSynced();
    setRefreshing(true);
    // EXPO_PUBLIC_OFF=sync promises nothing talks to the server: then the pull is only the spinner
    void syncFromPull(noSync ? null : syncRuntime()).then(() => {
      syncing.current = false;
      setRefreshing(false);
    });
  }, [heartSynced, noSync]);
  const spinner = pullSpinnerColors(t.color, t.theme);

  /*
    THE BAR STEPS OUT OF THE PAGE'S WAY (the owner, 2026-09-27: "Hide on scroll down"). Scrolling
    down slides it up, one point for every point the page moves, until it is gone; scrolling up
    brings it back the same way (`diffClamp`), and it is never hidden by more than the page has
    scrolled, so at the top of a page it is always all there. Every tab with the top bar does it;
    a pushed page keeps its Back where it is.

    THE PAGE NEVER MOVES, and that is the whole of the 2026-09-28 rebuild. The first version slid
    the page up with the bar, and on a phone that shook every page (the owner: *"its like its
    shaking a little bit, making it look blurry … app wide"*; their screen recording, measured
    frame by frame: the content stepping +13, −5, +15, −5 px while the finger was down, and smooth
    the moment it let go). A scroller moved under the finger reads its own movement as the finger's
    and answers it. So the scroller sits still, from the status bar to the foot of the screen, its
    content starting one bar lower (`padTop`), and what moves is:

      - the bar's row, sliding up under the status bar and CLIPPED there (`barClip`), so a chip
        never slides over the phone's clock, which the first version let it do;
      - the edge the page is shown from (`clipTop`): a clipping frame whose top follows the bar's
        foot, with the scroller counter-moved inside it by exactly as much, so nothing under the
        finger moves on the screen at all;
      - the picture behind the bar, when a page has one (Today's sky), with the bar.

    HELD IN PLACE while a tour or a tip is up (its cards point at the bar's chip and avatar), while
    a screen reader is on (focus can land on the bar at any time, and an element off the screen is
    one it cannot show), and while the sync banner is up under it (a banner that went with the bar
    would be a banner scrolled away). Native-driven throughout.

    NOT ON AN iPHONE'S TODAY, for now: iOS draws the pull-to-sync spinner at the top of the
    scroller's frame, which is under the bar now, and Android's `progressViewOffset` has no iOS
    twin. The bar simply stays put there until an iOS build is being tested.
  */
  const hides = chrome && title === undefined && scroll && !(pulls && Platform.OS === 'ios');
  // the bar's own height is measured; until then, the least it can be, so the first frame is close
  const [barHeight, setBarHeight] = useState(TOP_BAR_MIN_HEIGHT + insets.top);
  const row = hides ? Math.max(0, barHeight - insets.top) : 0;
  const bannerUp = chrome && banner !== null;
  const [bannerHeight, setBannerHeight] = useState(0);
  const padTop = row + (hides && bannerUp ? bannerHeight : 0);
  const tour = useTour();
  const screenReader = useScreenReaderOn();
  const held = (tour !== null && tour.phase !== 'off') || screenReader || bannerUp;
  // 1 lets the bar go, 0 holds it: a multiplier, so holding it never resets where the page is
  const letGo = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    letGo.setValue(held ? 0 : 1);
  }, [held, letGo]);
  // the offset every native-driven thing on this page reads: a screen's own, or the mark's
  const offsetValue = scrollY ?? heart.offset;
  const barShift = useMemo(() => {
    if (row <= 0) return null;
    // a pull past the top (iOS) reads as the top
    const y = offsetValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: 'clamp',
    });
    const moved = Animated.diffClamp(y, 0, row);
    // never more than the page has scrolled: min(moved, y) = (moved + y − |moved − y|) / 2
    const gap = Animated.subtract(moved, y).interpolate({
      inputRange: [-1, 0, 1],
      outputRange: [1, 0, 1],
    });
    const hidden = Animated.multiply(
      Animated.multiply(Animated.subtract(Animated.add(moved, y), gap), 0.5),
      letGo,
    );
    const bar = Animated.multiply(hidden, -1);
    const clipTop = Animated.add(bar, padTop);
    return { bar, clipTop, counter: Animated.multiply(clipTop, -1) };
  }, [row, padTop, offsetValue, letGo]);

  // native-driven when a screen floats something over the page, the heart follows the pull, or the
  // bar steps aside; a JS handler otherwise
  const nativeY = scrollY ?? (heartMoves || hides ? heart.offset : undefined);
  const onScrollEvent = useMemo(
    () =>
      nativeY
        ? Animated.event([{ nativeEvent: { contentOffset: { y: nativeY } } }], {
            useNativeDriver: true,
            listener: report,
          })
        : report,
    [nativeY, report],
  );

  const profile = account?.profile ?? null;
  const bottom = tabBar
    ? screenBottomPadding(insets.bottom, t.tabs, logButton)
    : insets.bottom + t.space.xxxl;
  /*
    THE DOODLE PATTERN IS THE APP'S BACKGROUND (the owner, 2026-09-22: *"replace the background
    for the main app, with the one we have on onboarding, with all the baby icons"*).

    It was the first-run treatment and nothing else, held to five signed-out pages by a test,
    because a decoration with INK in it reaching Today should have been a review rather than a
    diff nobody read. This is that review, and the owner has asked for the spread. What makes it
    safe to say yes is that the wallpaper is glyphs and arithmetic rather than a picture: every
    text ink is measured over it, on both grounds it can land on, for all 54 skin × scheme ×
    theme combinations (`patternComposites`, `theme/contrast.test.ts`). A JPEG could not have
    been let out of setup at all.

    WHAT IT IS NOT SAFE FOR is status ink. crit over the pattern bottoms out at 3.92:1 on Glass
    against a 4.5 floor — a shade worse than the 4.44:1 it already measures on that skin's bare
    lit ground — so the rule that kept status strings on a solid surface during the first run now
    binds every screen, and `first-run/ground-usage.test.ts` scans for it.

    IT IS NOT GATED ON THE SKIN, and that is the one thing here that must not regress. An earlier
    draft asked whether the household's skin paints washes or orbs — but the DEFAULT skin is
    Paper, whose wash is zero, so every parent on the free plan would be back to a blank page.
    `Ground` decides what there is to draw: it returns null in night, where the pattern's alpha
    is 0 because that is the whole point of night mode, and on a flat skin with no pattern.
    EXPO_PUBLIC_OFF=ground turns the layer off, which is what that switch is for.
  */
  const decorated = !env.off.has('ground');
  const hasBar = chrome || title !== undefined;
  // every tab's bar has the sky behind it, Today's included (`TabSky`, 2026-10-06)
  const backdrop = barBackdrop ?? (chrome && title === undefined ? <TabSky /> : undefined);

  const bar =
    title !== undefined ? (
      <View
        style={[
          styles.titleRow,
          titleEditor !== undefined ? { alignItems: 'flex-start' } : null,
          {
            paddingTop: insets.top + t.space.sm,
            paddingBottom: t.space.sm,
            paddingHorizontal: t.space.xxl,
            gap: t.space.md,
          },
        ]}
      >
        {nav.canGoBack() ? (
          <IconButton
            icon="back"
            accessibilityLabel="Back"
            // not while this page is still sliding in: the pop would race the push (`backGuard.ts`)
            onPress={() => {
              if (!backHeld()) nav.goBack();
            }}
            testID="screen.back"
          />
        ) : null}
        {titleInBar && titleAccessory !== undefined ? (
          <View style={[styles.title, styles.titleWithAccessory, { gap: t.space.sm }]}>
            <H1 style={styles.titleText} numberOfLines={1}>
              {title}
            </H1>
            {titleAccessory}
          </View>
        ) : titleInBar && titleEditor !== undefined ? (
          <View style={styles.title}>{titleEditor}</View>
        ) : titleInBar && onTitlePress !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={titlePressLabel ?? title}
            accessibilityHint="Change it"
            onPress={onTitlePress}
            {...(titlePressTestID !== undefined ? { testID: titlePressTestID } : {})}
            hitSlop={t.space.sm}
            style={({ pressed }) => [
              styles.title,
              { minHeight: t.hit.min, justifyContent: 'center', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <H1>{title}</H1>
          </Pressable>
        ) : titleInBar ? (
          <H1 style={styles.title}>{title}</H1>
        ) : (
          // the heading is in the page, so the bar keeps only the SPOKEN one: a screen reader
          // landing on a pushed page has to be told which page it is, and the content's own
          // heading is below the fold of the first focus
          <View accessibilityRole="header" accessibilityLabel={title} style={styles.title} />
        )}
        {barTrailing ?? null}
      </View>
    ) : chrome ? (
      <TopBar
        child={
          // a baby on the way has the chip too (migration 0150): its name and its due date
          child.children.length > 0 || child.householdExpecting
            ? {
                name: child.chipName,
                ageLabel: child.chipAge,
                initial: initialOf(child.chipName),
                isBoth: child.isAll,
                // BOTH IS THE BABIES THEMSELVES (2026-09-25): each one's initial and face, which
                // the chip draws as a pair that splits from the one avatar and merges back into it
                ...(child.isAll
                  ? {
                      faces: child.children.map(c => {
                        const face = child.photoOf(c.id);
                        return {
                          initial: initialOf(c.name),
                          ...(face !== null ? { photoUri: face } : {}),
                        };
                      }),
                    }
                  : {}),
                // the baby's own face in the bar when the household has set one; `ChildChip`
                // keeps the initial for "Both" and for night (docs/MEDIA.md)
                ...(child.photoUri !== null ? { photoUri: child.photoUri } : {}),
                // and a baby on the way's, when one was chosen in setup (migration 0150)
                ...(child.photoUri === null && waitingFace !== null
                  ? { photoUri: waitingFace }
                  : {}),
              }
            : null
        }
        onChildPress={shell.openChildSwitcher}
        childExpanded={open === 'child'}
        markLabel={BRAND.appDisplayName}
        markMonogram={BRAND.monogram}
        markSource={MARK_SOURCE}
        // the heart stretches with a pull of this page, when it can be pulled and may move
        {...(pulls && heart.style !== undefined ? { markMotion: heart.style } : {})}
        // One call site, one rule: the precedence lives in sync/status.ts and is tested there —
        // and so does WHEN it is said: a sync that takes a moment never shows (`syncChipShown`,
        // the owner, 2026-09-26: "if it's just a few milliseconds, just dont show this up").
        // `online` is SESSION reachability and the queue's `connected` is the PHONE's, so the
        // chip says offline when either is — a session that cannot be refreshed cannot sync
        // (`chipFor`, read through `useSyncChip` above)
        sync={syncChip}
        avatar={
          profile
            ? {
                initial: initialOf(profile.display_name),
                name: profile.display_name,
                // the person's own picture in place of the letter, when they have set one (0148)
                ...(myPicture !== null ? { photoUri: myPicture } : {}),
              }
            : null
        }
        onAccount={() => shell.openAccount(accountAnchor.current)}
        accountExpanded={open === 'account'}
        onLayoutAccount={a => {
          accountAnchor.current = a;
        }}
        width={width}
        topInset={insets.top}
        // the tips about the baby's name and your initial ring them here (docs/TOUR_SCRIPT.md §D)
        wrapChild={chip => (
          <TourSpot id={TOUR_ANCHOR.childChip} part={barPart} radius={t.radius.pill}>
            {chip}
          </TourSpot>
        )}
        wrapAccount={avatar => (
          <TourSpot id={TOUR_ANCHOR.avatar} part={barPart} radius={t.radius.pill}>
            {avatar}
          </TourSpot>
        )}
        testID="topbar"
      />
    ) : null;

  const inner = (
    <View
      ref={contentRef}
      collapsable={false}
      style={[
        styles.inner,
        {
          paddingHorizontal: t.space.xxl,
          paddingTop: hasBar ? t.space.sm : insets.top + t.space.md,
          paddingBottom: bottom,
          gap: t.space.lg,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      {children}
    </View>
  );

  const bannerNode = banner ? (
    <SyncBanner
      message={banner.message}
      tone={banner.tone}
      onDismiss={banner.dismiss}
      // TRY AGAIN, on every build. Until now the banner was a statement everywhere but a
      // dev build, because the inspector was the only queue surface there was — so a
      // parent whose queue had used up its ten attempts could read about it and do
      // nothing (`SyncRuntime.retry` records what that cost).
      {...(banner.retry ? { onRetry: banner.retry } : {})}
      // Tapping the banner itself still opens the queue where that surface is mounted,
      // which is the developer inspector only (MOBILE §13). Everywhere else the button
      // above is the action and the sentence is the rest.
      {...(mock && env.stage !== 'production' ? { onPress: shell.openSyncInspector } : {})}
    />
  ) : null;

  const scrollView = scroll ? (
    <Animated.ScrollView
      ref={attachScroll}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      // the content starts one bar lower when the bar is laid over the page (`barShift`)
      contentContainerStyle={[styles.scroll, hides ? { paddingTop: padTop } : null]}
      style={styles.scroller}
      onScroll={onScrollEvent}
      // every frame for a value that moves a floating layer, the bar or the heart; three reads a
      // second is plenty for a threshold and for the offset the tour scrolls from
      scrollEventThrottle={nativeY ? 16 : 48}
      {...(onContentSizeChange ? { onContentSizeChange } : {})}
      {...(pulls
        ? {
            refreshControl: (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                // the platform's own spinner, in the theme's ink (theme/pullSpinner.ts), drawn
                // under the bar rather than behind it when the bar is laid over the page
                tintColor={spinner.ink}
                colors={[spinner.ink]}
                progressBackgroundColor={spinner.disc}
                {...(hides ? { progressViewOffset: padTop } : {})}
              />
            ),
            onScrollBeginDrag: () => heart.beginDrag(syncing.current),
            onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
              heart.endDrag(e.nativeEvent.contentOffset.y),
          }
        : {})}
    >
      {inner}
    </Animated.ScrollView>
  ) : null;

  const overlayLayer = overlay ? (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      {overlay}
    </View>
  ) : null;

  const stickyLayer = sticky ? (
    <View pointerEvents="box-none" style={styles.sticky}>
      {sticky}
    </View>
  ) : null;

  return (
    /*
      EVERY LOOP ON THE PAGE STOPS WHILE IT IS NOT THE PAGE IN FRONT (packages/ui `MotionGate`;
      docs/DESIGN_SYSTEM.md §7.1). The tabs stay mounted behind the bar and a pushed page keeps the
      one under it, so without this a breathing mark, a drifting "z" or a running card's ticking
      digits on Today would keep turning for a parent who is on the Schedule. The gate closes with
      focus and opens with it; each loop also stops on its own when the app is put away.
    */
    <MotionGate active={focused}>
      {/* The ground token sits on this root so the ground can sit BEHIND the keyboard avoider:
          `behavior="padding"` shrinks that box as the keyboard opens, and the bloom at the foot of
          the ground would be cropped away on exactly the screens that have text fields. */}
      <View
        style={[styles.screen, { backgroundColor: page === 'paper' ? t.color.paper : t.color.app }]}
      >
        {decorated ? (
          // overflow lives HERE and not on styles.screen, which is the KeyboardAvoidingView every
          // screen in the product uses. A child with only a borderRadius is not clipped in React
          // Native, and neither view has one, so this is a plain rectangular clip.
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.groundClip]}>
            {/* `motif` — the four large hero glyphs — is not passed: the pattern replaced it in
              setup on 2026-09-21 and `Ground` draws one or the other, never both. */}
            <Ground width={width} height={height} pattern />
          </View>
        ) : null}
        <KeyboardAvoidingView
          style={[styles.screen, styles.transparent]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {hides ? (
            <View style={styles.screen}>
              {/* THE PAGE, from under the status bar to the foot, and it never moves (`barShift`) */}
              <View style={[styles.page, { top: insets.top }]}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.clip,
                    barShift ? { transform: [{ translateY: barShift.clipTop }] } : { top: padTop },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.screen,
                      barShift
                        ? { transform: [{ translateY: barShift.counter }] }
                        : { marginTop: -padTop },
                    ]}
                  >
                    {scrollView}
                    {overlayLayer}
                  </Animated.View>
                  {/* at the page's edge, which is the bar's foot: it moves with the bar, not the page */}
                  {stickyLayer}
                </Animated.View>
                {bannerUp ? (
                  <View
                    style={[styles.underBar, { top: row }]}
                    onLayout={e => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      setBannerHeight(prev => (prev === h ? prev : h));
                    }}
                  >
                    {bannerNode}
                  </View>
                ) : null}
              </View>
              {/* THE BAR, over the page: its picture moves with it, and its row is clipped at the
                  status bar, so it slides under the clock and never over it */}
              <View pointerEvents="box-none" style={[styles.barLayer, { height: barHeight }]}>
                {backdrop !== undefined ? (
                  <Animated.View
                    pointerEvents="none"
                    importantForAccessibility="no-hide-descendants"
                    accessibilityElementsHidden
                    style={[
                      StyleSheet.absoluteFill,
                      barShift ? { transform: [{ translateY: barShift.bar }] } : null,
                    ]}
                  >
                    {backdrop}
                  </Animated.View>
                ) : null}
                <View
                  pointerEvents="box-none"
                  style={[styles.barClip, { top: insets.top, height: row }]}
                >
                  <Animated.View
                    onLayout={e => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      setBarHeight(prev => (prev === h ? prev : h));
                    }}
                    style={[
                      styles.barRow,
                      { top: -insets.top },
                      barShift ? { transform: [{ translateY: barShift.bar }] } : null,
                    ]}
                  >
                    {bar}
                  </Animated.View>
                </View>
              </View>
            </View>
          ) : (
            <>
              {bar !== null ? (
                // the bar's own box, which the picture behind it (if any) fills exactly
                <View>
                  {backdrop !== undefined ? (
                    // the picture first, so the bar is drawn over it
                    <View
                      pointerEvents="none"
                      importantForAccessibility="no-hide-descendants"
                      accessibilityElementsHidden
                      style={StyleSheet.absoluteFill}
                    >
                      {backdrop}
                    </View>
                  ) : null}
                  {bar}
                </View>
              ) : null}
              <View style={styles.screen}>
                {bannerUp ? bannerNode : null}
                {scroll ? (
                  <View style={styles.scroller}>
                    {scrollView}
                    {overlayLayer}
                    {stickyLayer}
                  </View>
                ) : (
                  inner
                )}
                {title !== undefined ? (footer ?? null) : null}
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </View>
    </MotionGate>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  groundClip: { overflow: 'hidden' },
  // a keyword, not a color literal: the ground behind it is what shows through
  transparent: { backgroundColor: 'transparent' },
  scroller: { flex: 1 },
  scroll: { flexGrow: 1 },
  sticky: { position: 'absolute', top: 0, left: 0, right: 0 },
  // the page when the bar is laid over it: absolute, so the bar's measure never moves it
  page: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // the frame the page is shown through, its top at the bar's foot (`barShift.clipTop`)
  clip: { overflow: 'hidden' },
  underBar: { position: 'absolute', left: 0, right: 0 },
  barLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  // the bar's row is shown from the status bar down, and nowhere above it
  barClip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  barRow: { position: 'absolute', left: 0, right: 0 },
  // clipped to the scroller, so what floats over the page leaves with the page's edge
  overlay: { overflow: 'hidden' },
  inner: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  // the title and what belongs beside it (`titleAccessory`): the title gives way, never the badge
  titleWithAccessory: { flexDirection: 'row', alignItems: 'center' },
  titleText: { flexShrink: 1 },
});
