/**
 * Popover (docs/DESIGN_SYSTEM.md §14, §7; docs/MOBILE.md §9): a popover is for a SWITCH, a sheet
 * is for a task. Anchored to its opener (the appearance and account buttons in the top bar),
 * 272 wide, hanging from the anchor's top-right corner, clamped inside the window, at most 78%
 * of it tall — the arithmetic is `popoverPosition` and is tested on its own. It is a transparent
 * Modal so it sits above the tab bar and the scroller, with a lighter scrim than a sheet's:
 * changing the theme should not feel like leaving the screen.
 *
 * It appears with scale .97→1 and an 8 px drop over 180 ms from the top-right corner (the
 * prototype's `.pop`), and flips its origin to the bottom-right when it opens above the anchor.
 * Reduce motion sets the end state directly. The motion value starts hidden on every mount, so
 * a popover mounted already visible still plays its 180 ms. `accessibilityViewIsModal` keeps a
 * screen reader inside the panel until it closes; the scrim is still a "Close" button for
 * everyone else.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { popoverPosition, POPOVER_WIDTH, type Anchor } from './popoverPosition';
import { POPOVER_SCRIM_OPACITY, Scrim } from './Scrim';
import { noteSheetUp } from './sheetsUp';
import { Surface } from './Surface';
import { useModalGate } from './useModalGate';

export interface PopoverProps {
  visible: boolean;
  /** The opener's frame in window coordinates (`measureInWindow`); null = the top-right corner. */
  anchor: Anchor | null;
  onClose: () => void;
  children?: ReactNode;
  width?: number;
  /** What the panel is, for a screen reader ("Appearance", "Account"). */
  accessibilityLabel?: string;
  testID?: string;
}

export const POPOVER_DURATION_MS = 180;
const DROP_PX = 8;
const SCALE_FROM = 0.97;
const popoverEasing = Easing.bezier(0.2, 0.9, 0.3, 1);

export function Popover({
  visible: asked,
  anchor,
  onClose,
  children,
  width = POPOVER_WIDTH,
  accessibilityLabel,
  testID,
}: PopoverProps) {
  // on an iPhone, never presented while another modal is still going (`modalGate.ts`)
  const visible = useModalGate(asked, 200);
  const t = useTheme();
  const win = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // hidden until the effect runs, whatever `visible` is on the first render
  const progress = useRef(new Animated.Value(0)).current;
  const wasVisible = useRef(false);
  const reduceMotionRef = useRef(t.reduceMotion);
  reduceMotionRef.current = t.reduceMotion;

  // counted while it is meant to be up, as every sheet is (`sheetsUp.ts`)
  useEffect(() => (visible ? noteSheetUp() : undefined), [visible]);

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
      duration: POPOVER_DURATION_MS,
      easing: popoverEasing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      /*
        GONE MEANS GONE, as a sheet's close is (`BottomSheet`): a close cut short while the popover
        is still meant to be hidden unmounts all the same. Left mounted, it was a full-screen modal
        at no opacity over the app, taking every tap and the Back button, and only closing the app
        cleared it. A close cut short by a reopen (`wasVisible` already true again) stays.
      */
      if (!visible && (finished || !wasVisible.current)) setMounted(false);
    });
  }, [visible, progress]);

  if (!mounted) return null;

  const frame = popoverPosition(anchor, win, width, t.space.lg, t.space.sm);
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [frame.placement === 'below' ? -DROP_PX : DROP_PX, 0],
  });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [SCALE_FROM, 1] });
  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
      {...(testID ? { testID } : {})}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Scrim
            onPress={onClose}
            opacity={POPOVER_SCRIM_OPACITY}
            {...(testID ? { testID: `${testID}-scrim` } : {})}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          {...(accessibilityLabel ? { accessibilityLabel } : {})}
          style={[
            styles.panel,
            {
              left: frame.left,
              width: frame.width,
              maxHeight: frame.maxHeight,
              ...(frame.placement === 'below' ? { top: frame.top } : { bottom: frame.bottom }),
              opacity: progress,
              transform: [{ translateY }, { scale }],
              transformOrigin: frame.placement === 'below' ? 'top right' : 'bottom right',
            },
          ]}
          {...(testID ? { testID: `${testID}-panel` } : {})}
        >
          <Surface kind="sheet" radius="l" hue={t.color.text}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: frame.maxHeight }}
              contentContainerStyle={{ padding: t.space.xl }}
            >
              {children}
            </ScrollView>
          </Surface>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: { position: 'absolute' },
});
