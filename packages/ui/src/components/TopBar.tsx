/**
 * TopBar (docs/DESIGN_SYSTEM.md §14, docs/BRANDING.md §2b): the app's four persistent controls
 * and the one brand element allowed in the chrome. Left, FIRST in the bar, the child chip —
 * capped so nothing on the left can reach the mark. Dead center, the mark, in a slot pinned to
 * both side edges (the comment at the slot says why): the middle of the bar is the one position
 * that does not move as the sides change, so it is a landmark, not something the sync chip shunts.
 * Right: the sync chip only when there is something to report (its silence is what made room
 * for the mark), the appearance control, notifications with a count, and the account avatar.
 *
 * THE MARK GIVES WAY; THE CHIPS NEVER DO (the owner's screenshots, 2026-09-28: on an Android phone
 * 1080 px wide the heart sat on top of the sync chip, over the first letters of "5 queued" and of
 * "Not synced"). A landmark that does not move has to yield when something needs its place, and
 * the heart is the one thing here that can: it is decoration with two hidden doors, where
 * everything beside it is the baby, the state of the log, or a control the household reaches for.
 * So the bar measures itself with onLayout (its width, where the left group ends, where the right
 * group starts) and asks `markFits` (topBarLayout.ts) whether the heart still has room between
 * them. When it has not, the heart fades out, takes no touch and leaves the accessibility tree;
 * when the room comes back (the chip goes quiet once the queue is sent), so does the heart. See
 * `placeMark` below.
 *
 * The appearance and account controls open anchored POPOVERS, not sheets (§14: a popover is for
 * a switch) — so the bar measures those two anchors in window coordinates on layout and reports
 * them through `onLayoutAppearance` / `onLayoutAccount`; the app positions its popovers from
 * the rectangles and never reaches into the bar. Both controls carry `expanded` while their
 * popover is open. The count badge is a number on the flat accent in `onAccent` (a control with
 * a digit in it needs 4.5:1, §12 rule 6), and the button's accessible name says the count in
 * words; the badge is hidden at zero. The account avatar is the same 31 circle as the chip's,
 * in the brand gradient, and reads "Account, <name>": everything account-shaped lives behind it
 * and nowhere else. The mark is the delivered artwork when the app hands it in (`markSource`,
 * BRANDING.md §4) and the letters otherwise; its accessible name and the letters come from the
 * app (brand.json) — never typed here. Nothing in this bar is a product name. The count badge
 * is hidden from the screen reader: the bell's own name already says "3 unread", and a stray
 * "3" read after it would be the same number twice (§8).
 *
 * TWO THINGS HERE MOVE, BOTH HANDED IN (the owner, 2026-09-26). On a baby's month-day the chip's
 * avatar wears a party hat (`child.hat`, and the fact in words, `child.monthDay`; `ChildChip`). And
 * on Today the mark stretches with a pull of the page and springs back (`markMotion`, from the
 * page's `useMarkPull`), hanging from its top so it grows down toward the page being pulled. The
 * bar only wears what it is given: without `markMotion` the mark is exactly the still image it was,
 * and the door behind it is the same door either way.
 *
 * THE CHIP AND THE AVATAR CAN BE WRAPPED (`wrapChild`, `wrapAccount`; 2026-09-26), as the tab bar's
 * + can: the app's first-run tips ring the baby's name and the initial, and the ring is a wrapper
 * the app owns. Without them the bar is drawn exactly as before.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { IconName } from '../icons/paths';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar } from './Avatar';
import { ChildChip, type ChildFace } from './ChildChip';
import { IconButton } from './IconButton';
import { Mark } from './Mark';
import { countMarkTap, markHitSlop } from './markDoor';
import type { HatEntrance } from './partyHat';
import type { Anchor } from './popoverPosition';
import type { TapRun } from './starfield';
import { SyncChip, type SyncState } from './SyncChip';
import { AppText, Numeric } from './Text';
import { motionStill } from './tickDraw';
import {
  chipMaxWidth,
  markFits,
  markSize,
  TOP_BAR_AVATAR,
  TOP_BAR_GAP,
  TOP_BAR_GUTTER,
  TOP_BAR_MIN_HEIGHT,
} from './topBarLayout';

export interface TopBarChild {
  name: string;
  ageLabel: string;
  initial: string;
  isBoth?: boolean;
  /** The babies "Both" is made of, drawn as a pair in the chip (2026-09-25). See `ChildChip.faces`. */
  faces?: readonly ChildFace[];
  /** The baby's picture, if the household set one (docs/MEDIA.md). See `ChildChip.photoUri`. */
  photoUri?: string;
  /** The month-day party hat on the one avatar, and how it arrives. See `ChildChip.hat`. */
  hat?: HatEntrance;
  /** The month-day in words — "3 months today" — for the chip's name. See `ChildChip.monthDay`. */
  monthDay?: string;
}

export interface TopBarSync {
  state: SyncState;
  count?: number;
}

export interface TopBarAvatar {
  initial: string;
  name: string;
  /**
   * THE PERSON'S OWN PICTURE (2026-09-30; migration 0148): a photo, or one of the app's drawings,
   * as a file the phone holds. It fills the 31 circle in place of the gradient and the letter, and
   * is drawn by `Avatar`, so a picture that will not load, and the amber night, fall back to the
   * initial exactly as a baby's picture does. Absent, the button is the initial it always was.
   */
  photoUri?: string;
}

export interface TopBarProps {
  child: TopBarChild | null;
  onChildPress: () => void;
  /** True while the child switcher is open. */
  childExpanded?: boolean;
  /** The mark's accessible name, from brand.json via the app. */
  markLabel: string;
  /** The mark's text fallback (brand.json `monogram`), from the app — drawn only without an image. */
  markMonogram: string;
  /** The delivered mark (brand.json `assets.mark`), resolved to an image source by the app. */
  markSource?: ImageSourcePropType;
  /**
   * THE MARK'S HIDDEN DOOR (the owner, 2026-09-26: "tap our logo 3 times, to enter night light"):
   * three quick taps on the mark run `onOpen` (`markDoor.ts`). The mark still looks and reads as
   * the image it is — nothing about it says it can be pressed — and a screen reader finds the
   * door as a custom action on it, named `label`. Without it the mark takes no touch at all.
   */
  markDoor?: { label: string; onOpen: () => void };
  /**
   * THE MARK'S STRETCH ON A PULL (2026-09-26; `useMarkPull`): the transform a page that can be
   * pulled to sync hands in, anchored here at the mark's top. Absent, the mark does not move.
   */
  markMotion?: Animated.WithAnimatedObject<ViewStyle>;
  sync: TopBarSync;
  /**
   * The appearance control, and it is OPTIONAL now.
   *
   * The app took it out of the bar on 2026-09-18 (the owner: "move the theme setting that is
   * located on the most top setting (next to notifications) to inside the profile"), so the
   * three props go together and all three are omitted. They stay in the component rather than
   * being deleted because the bar is the design system's and a host that wants the glyph — the
   * admin console's own chrome, a future settings surface — should not have to rebuild it. Pass
   * `onAppearance` and the cell appears; leave it out and the bar closes the gap.
   */
  onAppearance?: () => void;
  /** 'sun' | 'moon' | 'sleep' — the glyph for the theme in force, chosen by the app. */
  appearanceIcon?: IconName;
  /** True while the appearance popover is open. */
  appearanceExpanded?: boolean;
  /** The bell. Absent, no bell is drawn (NibbleCue has no in-app messages yet, 2026-10-08). */
  onNotifications?: () => void;
  notificationCount?: number;
  avatar: TopBarAvatar | null;
  onAccount: () => void;
  /** True while the account popover is open. */
  accountExpanded?: boolean;
  /** The appearance control's rectangle in window coordinates, whenever it lays out. */
  onLayoutAppearance?: (anchor: Anchor) => void;
  /** The account avatar's rectangle in window coordinates, whenever it lays out. */
  onLayoutAccount?: (anchor: Anchor) => void;
  /** The window width. */
  width: number;
  /** The top safe-area inset. */
  topInset: number;
  /**
   * A CHANCE TO WRAP THE CHILD CHIP AND THE ACCOUNT AVATAR, as TabBar's `wrapFab` is for the +:
   * the app's first-run tips point at both (a wrapper the design system cannot know about). The
   * wrapper takes the control's place in the row and adds nothing to it; leaving these out, or
   * returning the control unchanged, is the bar exactly as it was.
   */
  wrapChild?: (chip: ReactNode) => ReactNode;
  wrapAccount?: (avatar: ReactNode) => ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BADGE = 16;
const AVATAR_LETTER = 13;
/** How long the mark takes to step aside or come back: a toast's fade (DESIGN_SYSTEM.md §7). */
const MARK_FADE_MS = 180;

/** Where the bar last laid out the three things the mark's room is decided from (`markFits`). */
interface BarEdges {
  /** The bar's own width; the mark's slot is centered in it. */
  barWidth: number | null;
  /** Where the left group (the child chip, or nothing) ends. */
  leftEnd: number | null;
  /** Where the right group (the sync chip, the bell, the avatar) starts. */
  rightStart: number | null;
}

/** "3", or "99+": the badge is a glance, the label carries the real number. */
export const badgeCountText = (n: number): string => (n > 99 ? '99+' : String(n));

/** The bell's accessible name, with the count in words. */
export const notificationsLabel = (n: number | undefined): string =>
  n !== undefined && n > 0 ? `Notifications, ${n} unread` : 'Notifications';

/** A control through the host's wrapper (`wrapChild`, `wrapAccount`), or as it is without one. */
const wrapped = (wrap: ((control: ReactNode) => ReactNode) | undefined, control: ReactNode) =>
  wrap === undefined ? control : wrap(control);

export function TopBar({
  child,
  onChildPress,
  childExpanded,
  markLabel,
  markMonogram,
  markSource,
  markDoor,
  markMotion,
  sync,
  onAppearance,
  appearanceIcon,
  appearanceExpanded = false,
  onNotifications,
  notificationCount,
  avatar,
  onAccount,
  accountExpanded = false,
  onLayoutAppearance,
  onLayoutAccount,
  width,
  topInset,
  wrapChild,
  wrapAccount,
  style,
  testID,
}: TopBarProps) {
  const t = useTheme();
  const appearanceRef = useRef<View>(null);
  const accountRef = useRef<View>(null);
  const doorRun = useRef<TapRun | null>(null);
  const size = markSize(width);
  const count = notificationCount ?? 0;
  const paddingTop = topInset + t.space.sm;

  /*
    THE MARK'S ROOM, decided from the bar's own layout (the header says why the mark is what gives
    way). The three edges arrive in onLayout events and are kept in a ref, never in state: a
    layout report must not re-render the bar, and the fade runs on the native driver, so the one
    thing that re-renders is the answer itself, and only on the layout that changes it. Hiding
    the mark cannot feed back into the answer either, since the mark is absolutely positioned and
    takes no room in the row, so there is no loop to guard against.

    The FIRST answer is drawn at once rather than faded: it is the bar's first frame, not a change
    anyone watched. The mark starts shown, as it always was, because a bar with nothing on the
    right is by far the common one; a bar that mounts with a long sync chip already up shows the
    overlap until its first layout arrives, and then drops the mark without a fade. Under reduce
    motion and in the amber Night nothing fades at all (`motionStill`): the mark is simply there
    or not there.
  */
  const still = motionStill(t.reduceMotion, t.theme);
  const edges = useRef<BarEdges>({ barWidth: null, leftEnd: null, rightStart: null });
  const [markShown, setMarkShown] = useState(true);
  const shown = useRef(true);
  const measured = useRef(false);
  const markFade = useRef(new Animated.Value(1)).current;

  const placeMark = () => {
    const { barWidth, leftEnd, rightStart } = edges.current;
    if (barWidth === null || leftEnd === null || rightStart === null) return;
    const fits = markFits(barWidth, leftEnd, rightStart, size);
    const first = !measured.current;
    measured.current = true;
    if (fits === shown.current) return;
    shown.current = fits;
    const to = fits ? 1 : 0;
    if (first || still) {
      markFade.setValue(to);
    } else {
      Animated.timing(markFade, {
        toValue: to,
        duration: MARK_FADE_MS,
        useNativeDriver: true,
      }).start();
    }
    setMarkShown(fits);
  };

  // the mark as it is, or hanging from its top in the pull's stretch when a page hands one in
  const heart = (mark: ReactNode) =>
    markMotion === undefined ? (
      mark
    ) : (
      <Animated.View style={[{ transformOrigin: [size / 2, 0, 0] }, markMotion]}>
        {mark}
      </Animated.View>
    );

  const report = (ref: RefObject<View | null>, cb?: (a: Anchor) => void) => () => {
    if (!cb) return;
    // window coordinates, so a popover can be placed by the app's root, not the bar's parent
    ref.current?.measureInWindow((x, y, w, h) => cb({ x, y, width: w, height: h }));
  };

  return (
    <View
      style={[
        styles.row,
        {
          paddingTop,
          paddingBottom: t.space.md,
          paddingHorizontal: TOP_BAR_GUTTER,
          minHeight: TOP_BAR_MIN_HEIGHT + topInset,
          gap: TOP_BAR_GAP,
        },
        style,
      ]}
      onLayout={e => {
        edges.current.barWidth = e.nativeEvent.layout.width;
        placeMark();
      }}
      {...(testID ? { testID } : {})}
    >
      {/*
        THE LEFT GROUP IN A BOX OF ITS OWN, so the bar can see where it ends. The chip goes through
        the host's wrapper (`wrapChild`), which may put it inside a view of its own, so the chip's
        own layout is not in the bar's coordinates; this box's always is. Without a child the box
        is empty and ends where the bar's padding does, which leaves the mark nothing to clear on
        the left.
      */}
      <View
        style={styles.left}
        onLayout={e => {
          const { x, width: w } = e.nativeEvent.layout;
          edges.current.leftEnd = x + w;
          placeMark();
        }}
      >
        {child
          ? wrapped(
              wrapChild,
              <ChildChip
                name={child.name}
                ageLabel={child.ageLabel}
                initial={child.initial}
                {...(child.isBoth !== undefined ? { isBoth: child.isBoth } : {})}
                {...(child.faces !== undefined ? { faces: child.faces } : {})}
                {...(child.photoUri !== undefined ? { photoUri: child.photoUri } : {})}
                {...(child.hat !== undefined ? { hat: child.hat } : {})}
                {...(child.monthDay !== undefined ? { monthDay: child.monthDay } : {})}
                onPress={onChildPress}
                maxWidth={chipMaxWidth(width)}
                {...(childExpanded !== undefined ? { expanded: childExpanded } : {})}
                {...(testID ? { testID: `${testID}.child` } : {})}
              />,
            )
          : null}
      </View>

      <View style={styles.spacer} />

      <View
        style={[styles.right, { gap: TOP_BAR_GAP }]}
        onLayout={e => {
          edges.current.rightStart = e.nativeEvent.layout.x;
          placeMark();
        }}
      >
        {sync.state !== 'ok' ? (
          <SyncChip
            state={sync.state}
            {...(sync.count !== undefined ? { count: sync.count } : {})}
            {...(testID ? { testID: `${testID}.sync` } : {})}
          />
        ) : null}

        {onAppearance === undefined ? null : (
          <View ref={appearanceRef} onLayout={report(appearanceRef, onLayoutAppearance)}>
            <IconButton
              icon={appearanceIcon ?? 'sun'}
              accessibilityLabel="Appearance"
              onPress={onAppearance}
              expanded={appearanceExpanded}
              {...(testID ? { testID: `${testID}.appearance` } : {})}
            />
          </View>
        )}

        {onNotifications === undefined ? null : (
          <View>
            <IconButton
              icon="bell"
              accessibilityLabel={notificationsLabel(notificationCount)}
              onPress={onNotifications}
              {...(testID ? { testID: `${testID}.notifications` } : {})}
            />
            {count > 0 ? (
              <View
                pointerEvents="none"
                // the bell's name carries the count; the digit is presentation (§8)
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.badge,
                  {
                    minWidth: BADGE,
                    height: BADGE,
                    borderRadius: t.radius.pill,
                    paddingHorizontal: t.space.xs,
                    backgroundColor: t.color.accent,
                    borderColor: t.color.surfaceSolid,
                  },
                ]}
              >
                <Numeric
                  variant="badge"
                  color={t.color.onAccent}
                  // a11y-fixed-scale: a count in a badge disc of fixed size; the bell's label
                  // says the number
                  allowFontScaling={false}
                  style={{ letterSpacing: 0 }}
                >
                  {badgeCountText(count)}
                </Numeric>
              </View>
            ) : null}
          </View>
        )}

        {avatar
          ? wrapped(
              wrapAccount,
              <View ref={accountRef} onLayout={report(accountRef, onLayoutAccount)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Account, ${avatar.name}`}
                  accessibilityState={{ expanded: accountExpanded }}
                  onPress={onAccount}
                  {...(testID ? { testID: `${testID}.account` } : {})}
                  hitSlop={Math.ceil((t.hit.min - TOP_BAR_AVATAR) / 2)}
                  style={({ pressed }) => [
                    styles.avatar,
                    {
                      width: TOP_BAR_AVATAR,
                      height: TOP_BAR_AVATAR,
                      borderRadius: t.radius.pill,
                      // a picture brings its own light ground and ring (`Avatar`): the accent under
                      // it showed at the circle's edge as a dark, shaded fringe (2026-09-30)
                      backgroundColor:
                        avatar.photoUri !== undefined ? 'transparent' : t.color.accent,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {avatar.photoUri !== undefined ? (
                    // the picture, through the one component that falls back to the initial: the
                    // button's own name says who it is, so the circle is presentation
                    <Avatar
                      name={avatar.name}
                      size={TOP_BAR_AVATAR}
                      photoUri={avatar.photoUri}
                      accessibilityLabel=""
                    />
                  ) : (
                    <>
                      <LinearGradient
                        colors={[...t.gradient.brand]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: t.radius.pill }]}
                      />
                      <AppText
                        variant="bodyStrong"
                        color={t.onGradient}
                        // a11y-fixed-scale: one initial in the avatar's fixed disc; the
                        // account button's label names the person
                        allowFontScaling={false}
                        style={{ fontSize: AVATAR_LETTER }}
                      >
                        {avatar.initial}
                      </AppText>
                    </>
                  )}
                </Pressable>
              </View>,
            )
          : null}
      </View>

      {/*
        Dead center (BRANDING.md §2b), anchored SYMMETRICALLY: the slot spans the bar with
        `left: 0, right: 0` and centers the mark inside itself. It must not be positioned with
        `left: '50%'` and a negative margin, which is what this did and why the mark drew off
        center on a device. A percentage offset on an absolutely positioned child is measured
        from the containing block Yoga picks — the padding box under the CSS-compliant absolute
        layout of Yoga 3, the content box under the older behavior — and the two disagree by the
        bar's horizontal padding, so the mark lands `TOP_BAR_GUTTER` left of center under one of
        them. Anchoring both edges removes the question: the parent's horizontal padding is equal
        on both sides, so a slot pinned to both edges is symmetric about the bar's center whichever
        box it is measured against, and `alignItems: 'center'` then centers the mark exactly.
        The vertical insets stay explicit, because they are deliberately unequal — the status-bar
        inset is above and only `space.md` below — so the mark sits on the same line as the chip
        rather than in the middle of the whole bar.

        WHEN THE MARK HAS STEPPED ASIDE (`markShown` false, `placeMark` above) the slot fades to
        nothing, takes no touch and leaves the accessibility tree, all three at once: a mark that
        can be tapped or read out where nobody can see it would be a trap, and its fading edge
        must not catch a tap on the chip under it. ITS NIGHT LIGHT DOOR IS SIMPLY UNAVAILABLE
        WHILE IT IS AWAY, for touch and for a screen reader alike: the night light has no other
        way in (docs/DESIGN_SYSTEM.md §14, the owner's choice of a hidden door), and a custom
        action cannot hang on an image that is not there. It is back with the mark, which is as
        soon as the sync chip goes quiet. The pull's stretch (`markMotion`) needs nothing: the
        page still syncs on a pull, and the stretch plays on a mark nobody sees.
      */}
      <Animated.View
        // with a door the slot lets every touch through but the mark's own (`box-none`); without
        // one, or while the mark has stepped aside, it takes none at all
        pointerEvents={markShown && markDoor ? 'box-none' : 'none'}
        {...(markShown
          ? {}
          : {
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants' as const,
            })}
        style={[
          styles.markSlot,
          { top: paddingTop, bottom: t.space.md, left: 0, right: 0 },
          { opacity: markFade },
        ]}
      >
        {markDoor ? (
          <Pressable
            // the image keeps speaking for itself; the door is its custom action (`Mark`)
            accessible={false}
            hitSlop={markHitSlop(width)}
            onPress={() => {
              const tap = countMarkTap(doorRun.current, Date.now());
              doorRun.current = tap.run;
              if (tap.fired) markDoor.onOpen();
            }}
            {...(testID ? { testID: `${testID}.markDoor` } : {})}
          >
            {heart(
              <Mark
                size={size}
                label={markLabel}
                monogram={markMonogram}
                door={markDoor}
                {...(markSource !== undefined ? { source: markSource } : {})}
                {...(testID ? { testID: `${testID}.mark` } : {})}
              />,
            )}
          </Pressable>
        ) : (
          heart(
            <Mark
              size={size}
              label={markLabel}
              monogram={markMonogram}
              {...(markSource !== undefined ? { source: markSource } : {})}
              {...(testID ? { testID: `${testID}.mark` } : {})}
            />,
          )
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  // the chip's own give, kept by the box it is measured in: `ChildChip` may shrink (its name
  // ellipsizes) so that a bar too narrow for everything never pushes the bell and the avatar
  // off its edge, and a box that could not shrink would take that away
  left: { flexShrink: 1 },
  spacer: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  markSlot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
