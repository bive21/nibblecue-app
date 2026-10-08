/**
 * StrikeText — words that can be struck through, where the line is DRAWN ACROSS them when they
 * become so (the owner, 2026-09-26, of the shopping list: *"the words get a strike-through that
 * sweeps left to right"*). `rowMotion.ts` holds the numbers (`STRIKE_*`, `strikeWindows`).
 *
 * AT REST IT IS THE PLATFORM'S OWN LINE-THROUGH, exactly as the row drew before: a struck line is
 * `textDecorationLine: 'line-through'`, and nothing here is mounted but the one text. Only while the
 * pen is moving is it drawn differently — as the SAME words twice, each seen through a window:
 * the struck words from the left edge to the pen, the plain words from the pen to the right edge.
 * Each window is a clip that slides one way while the words inside it slide back the other, so the
 * words stand perfectly still and only the edge between the windows moves. Both are the platform's
 * own rendering of the same words in the same box, so the line the pen draws is the line the text
 * rests with, and the hand-over at the end changes no pixel. Untick, and the pen runs back.
 *
 * WHY NOT A BAR DRAWN OVER THE WORDS: where the platform puts its line depends on the face, the
 * size and the platform (iOS and Android place it differently), and a bar that missed it by half a
 * point would jump at the hand-over. The windows never have to know where the line is.
 *
 * The box is laid out by a third copy that is never seen, so the row's height and wrapping are the
 * words' own — the two windows are laid over it, each the same size. Transforms only, on the native
 * driver. The windows are hidden from assistive technology and from touch; the words are read once.
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): the line is simply there or not.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num } from './PictureToggle';
import { STRIKE_DELAY_MS, STRIKE_EASE, STRIKE_MS, strikeWindows, UNSTRIKE_MS } from './rowMotion';
import { AppText, type AppTextProps } from './Text';
import { motionStill } from './tickDraw';

export interface StrikeTextProps extends Omit<AppTextProps, 'children'> {
  /** Struck through. When this changes while the words are on screen, the line is drawn across. */
  struck: boolean;
  children: string;
}

const EASE = Easing.bezier(...STRIKE_EASE);
/** Less than this is a re-layout's rounding, not a new width. */
const WIDTH_SLACK = 0.5;

export function StrikeText({ struck, children, style, ...text }: StrikeTextProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // where the pen is: 0 the left edge (nothing struck), 1 the right (all of it)
  const pen = useRef(new Animated.Value(struck ? 1 : 0)).current;
  const was = useRef(struck);
  const [moving, setMoving] = useState(false);
  const [width, setWidth] = useState(0);
  // the width as last laid out, read when a change is made rather than as a dependency
  const measured = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    measured.current = next;
    setWidth(w => (Math.abs(w - next) < WIDTH_SLACK ? w : next));
  };

  // a layout effect, so the frame that shows the new state already has the pen where it starts
  useLayoutEffect(() => {
    const changed = struck !== was.current;
    was.current = struck;
    if (!changed || still || measured.current <= 0) {
      // arrived like this, nothing may move, or not laid out yet: the end state, at once
      pen.setValue(struck ? 1 : 0);
      setMoving(false);
      return;
    }
    setMoving(true);
    const run = Animated.timing(pen, {
      toValue: struck ? 1 : 0,
      duration: struck ? STRIKE_MS : UNSTRIKE_MS,
      delay: struck ? STRIKE_DELAY_MS : 0,
      easing: EASE,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setMoving(false);
    });
    // a new change, reduce motion, or the words going away: stop where it is
    return () => run.stop();
  }, [struck, still, pen]);

  const windows = useMemo(() => {
    const w = strikeWindows(width);
    return {
      struckOuter: { transform: [{ translateX: num(pen, w.struckOuter) }] },
      struckInner: { transform: [{ translateX: num(pen, w.struckInner) }] },
      plainOuter: { transform: [{ translateX: num(pen, w.plainOuter) }] },
      plainInner: { transform: [{ translateX: num(pen, w.plainInner) }] },
    };
  }, [width, pen]);

  if (!moving || still) {
    return (
      <View onLayout={onLayout}>
        <AppText {...text} style={[style, struck ? styles.struck : null]}>
          {children}
        </AppText>
      </View>
    );
  }
  return (
    <View onLayout={onLayout}>
      {/* the words' own box, laid out and never seen: the windows are laid over it */}
      <AppText {...text} style={[style, styles.unseen]}>
        {children}
      </AppText>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[StyleSheet.absoluteFill, styles.clip, windows.struckOuter]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, windows.struckInner]}>
          <AppText {...text} style={[style, styles.struck]}>
            {children}
          </AppText>
        </Animated.View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[StyleSheet.absoluteFill, styles.clip, windows.plainOuter]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, windows.plainInner]}>
          <AppText {...text} style={style}>
            {children}
          </AppText>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  struck: { textDecorationLine: 'line-through' },
  unseen: { opacity: 0 },
  clip: { overflow: 'hidden' },
});
