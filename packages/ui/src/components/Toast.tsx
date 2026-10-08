/**
 * Toast (docs/DESIGN_SYSTEM.md §5, §7, §11 "Toasts"; docs/MOBILE.md §4, §8): one line of what
 * was saved and up to two actions. The right-hand slot belongs to Undo on every screen — the
 * order comes from `actionsInOrder`, so no caller can put anything to its right, and its label
 * is always "Undo". A secondary action sits to its left and reads softer: the Bold face at the
 * small size in `text2`, against Undo in `accent2` at body size. (The doc's "weight 600" has no
 * face in the type scale — §4 ships Regular, Bold and ExtraBold — and asking the OS for 600 on
 * a custom family falls back to the system face on iOS, which is the §19 defect.)
 *
 * The surface is SOLID whatever the skin: a toast lands over anything and its message must not
 * frost into it. Night uses `surface3` so it stands off the night ground without a shadow. It
 * slides up 10 px and fades in over 180 ms; reduce motion shows it in place. The motion value
 * starts hidden on every mount, so a toast mounted already visible still rises.
 *
 * Screen readers: `accessibilityLiveRegion="polite"` is Android-only, so on iOS the message is
 * ANNOUNCED through `AccessibilityInfo` when it appears — with the action labels, so a VoiceOver
 * user learns Undo exists before the toast dismisses itself. Android keeps the live region
 * (announcing there too would read every toast twice).
 *
 * The auto-dismiss timer lives here (5.2 s, 7 s with two actions) and calls `onDismiss`; the
 * host's reducer decides what shows next. Tapping an action dismisses as well. The clock is
 * keyed on the toast's `id` (the queue item's), falling back to the message: two identical
 * "Logged 4 oz" toasts in a row are two toasts, and the second one gets its full time and its
 * own Undo — keying on the text alone would let the second inherit the first's remaining clock.
 *
 * The two actions sit `space.lg` apart and each reaches 44 pt through hitSlop; the horizontal
 * slop is derived from that gap so the two hit rects touch but never overlap — an overlap
 * resolves to the last sibling, and "a tap on the edge of the secondary action fires Undo"
 * would revert a save the parent wanted.
 *
 * UNDO IS FELT AS A `tap` (the owner, 2026-09-25, of the "that's cool" list: "Let's try doing
 * everything"): a small press that took back what the Save's "done" marked, felt as it is pressed,
 * with the toast going and "Undone" arriving as the screen's half of it. The secondary action is
 * not felt here — "+ Liam" is a save of its own, and is felt as one when it lands.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';
import { Surface } from './Surface';
import { AppText, Body } from './Text';
import { actionsInOrder, toastDuration, type ToastSecondaryAction } from './toastQueue';

export interface ToastProps {
  /** The queue item's id: a new id restarts the clock even when the message text repeats. */
  id?: string;
  message: string;
  undo?: () => void;
  secondary?: ToastSecondaryAction;
  onDismiss: () => void;
  visible: boolean;
  /** Override the auto-dismiss; 0 keeps it on screen until dismissed. */
  durationMs?: number;
  /** Where the host puts it (above the tab bar and the FAB). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const TOAST_MOTION_MS = 180;
const RISE_PX = 10;
const ACTION_MIN_HEIGHT = 28;
/** Wide enough for a sentence, narrow enough not to become a banner on a tablet. */
export const TOAST_MAX_WIDTH = 520;

export function Toast({
  id,
  message,
  undo,
  secondary,
  onDismiss,
  visible,
  durationMs,
  style,
  testID = 'toast',
}: ToastProps) {
  const t = useTheme();
  const [mounted, setMounted] = useState(visible);
  // hidden until the effect runs, whatever `visible` is on the first render
  const progress = useRef(new Animated.Value(0)).current;
  const wasVisible = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const reduceMotionRef = useRef(t.reduceMotion);
  reduceMotionRef.current = t.reduceMotion;

  useEffect(() => {
    if (visible === wasVisible.current) return;
    wasVisible.current = visible;
    progress.stopAnimation();
    if (reduceMotionRef.current) {
      progress.setValue(visible ? 1 : 0);
      setMounted(visible);
      return;
    }
    if (visible) setMounted(true);
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: TOAST_MOTION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, progress]);

  const hasUndo = undo !== undefined;
  const hasSecondary = secondary !== undefined;
  const duration = durationMs ?? toastDuration(hasUndo, hasSecondary);
  // which toast this is: the item's id, or the text when the host has no ids
  const identity = id ?? message;
  useEffect(() => {
    if (!visible || duration <= 0) return;
    const timer = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(timer);
    // a new toast restarts the clock; the same toast re-rendered (a fresh `undo` closure) does not
  }, [visible, duration, identity]);

  const actions = actionsInOrder({
    ...(undo ? { undo } : {}),
    ...(secondary ? { secondary } : {}),
  });
  const announcement =
    actions.length > 0
      ? `${message}. ${actions.map(a => a.label).join(' or ')} available.`
      : message;
  useEffect(() => {
    // iOS has no live region; Android's announces the mounted text on its own
    if (!visible || Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [visible, identity, announcement]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] });
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      /**
       * `alignSelf: 'stretch'` FIRST, and the host's `style` after it so a host can still cap
       * the width. The prototype pins the toast `left:12px; right:12px` — full width — and a
       * host that instead lets it shrink-wrap gets a box with NO DEFINITE WIDTH, inside which
       * `styles.message`'s `flex: 1` resolves against nothing: the sentence and the Undo button
       * both collapse and what lands on screen is an empty box the size of its own padding.
       * That is the "empty white box" the owner reported twice, on two different toasts with
       * two different messages (2026-09-17: "It didn't show anything the save toast. Just an
       * empty white box") — neither the text NOR Undo was visible, which an empty message alone
       * could not do. The width is the component's business now, not a host's to remember.
       */
      style={[{ opacity: progress, transform: [{ translateY }], alignSelf: 'stretch' }, style]}
      testID={testID}
    >
      <Surface
        solid
        radius="m"
        hue={t.color.text}
        {...(t.isNight ? { tint: t.color.surface3 } : {})}
        style={{ paddingVertical: t.space.lg, paddingHorizontal: t.space.xl }}
      >
        <View style={[styles.row, { gap: t.space.lg }]}>
          <Body style={styles.message} numberOfLines={2}>
            {message}
          </Body>
          {actions.map(a => (
            <ToastAction
              key={a.slot}
              undoSlot={a.slot === 'undo'}
              gap={t.space.lg}
              onPress={() => {
                if (a.slot === 'undo') haptic('tap');
                a.onPress();
                onDismissRef.current();
              }}
              {...(testID ? { testID: `${testID}-${a.slot}` } : {})}
            >
              {a.label}
            </ToastAction>
          ))}
        </View>
      </Surface>
    </Animated.View>
  );
}

function ToastAction({
  undoSlot,
  gap,
  onPress,
  children,
  testID,
}: {
  undoSlot: boolean;
  /** The row gap the actions sit in; the horizontal slop is derived from it so hit rects never overlap. */
  gap: number;
  onPress: () => void;
  children: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  // two slops of floor((gap − 1) / 2) add up to less than the gap, so neighbours cannot overlap
  const hSlop = Math.max(0, Math.floor((gap - 1) / 2));
  const vSlop = Math.ceil(Math.max(0, (t.hit.min - ACTION_MIN_HEIGHT) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={{ top: vSlop, bottom: vSlop, left: hSlop, right: hSlop }}
      style={({ pressed }) => [
        styles.action,
        {
          // the box plus its slop is at least hit.min wide, whatever the label
          minWidth: t.hit.min - 2 * hSlop,
          paddingHorizontal: t.space.xs,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      <AppText
        variant="bodyStrong"
        ink={undoSlot ? 'accent2' : 'text2'}
        {...(undoSlot
          ? {}
          : { style: { fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight } })}
      >
        {children}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // the message takes the slack and gives it back; the actions never shrink, so a long sentence
  // wraps to its second line rather than squeezing Undo off the end of the row
  message: { flex: 1, flexShrink: 1 },
  action: {
    minHeight: ACTION_MIN_HEIGHT,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
